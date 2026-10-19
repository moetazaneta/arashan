import { authorize } from "../access/permissions";
import { type CommandName, recordFarmAudit } from "../audit/audit";
import type { FarmCommandContext } from "../context";
import { type CalendarDate, dateAt, isCalendarDate } from "../dates";
import { DomainError } from "../errors";
import type { FlockId, ResourceEventId, ResourceId } from "../ids";
import {
  createAutomaticRecord,
  deleteAutomaticRecord,
  restoreAutomaticRecord,
} from "../money/commands";
import { maxAmount, type MoneySource } from "../money/money";
import { noNorms, normGroups, type Norms } from "./norms";
import {
  maxQuantity,
  maxReasonLength,
  maxResourceNameLength,
  maxUnitLength,
  type Resource,
  type ResourceEvent,
  stockOf,
  stockOn,
} from "./resource";

// The commands of the Resources and of their events. Each one checks the permission first and
// appends one audit entry for each record that it changes. A command that changes nothing writes
// nothing. An event is never changed: a Member cancels one made by mistake and records it again.

// Resources.

/** The fields of a Resource that a Member enters. */
export interface ResourceInput {
  name: string;
  unit: string;
}

/** A Member adds a Resource, with a Stock of 0. Its name is unique in the Farm. */
export async function createResource(
  ctx: FarmCommandContext,
  input: ResourceInput,
): Promise<ResourceId> {
  authorize(ctx.member, "resource.create", { farmId: ctx.farm.id });
  const fields = validResource(input);
  await requireFreeName(ctx, fields.name, null);
  const resourceId = await ctx.repos.resources.insert({
    ...fields,
    stock: 0,
    norms: { ...noNorms },
    archivedAt: null,
  });
  await auditResource(ctx, "resource.create", resourceId);
  return resourceId;
}

/**
 * A Member changes the name or the unit of a Resource. The unit changes only while the Resource has
 * no events (`resource.unitLocked`): the quantities of its events are in the unit.
 */
export async function updateResource(
  ctx: FarmCommandContext,
  input: ResourceInput & { resourceId: ResourceId },
): Promise<void> {
  authorize(ctx.member, "resource.update", { farmId: ctx.farm.id });
  const resource = await requireResource(ctx, input.resourceId);
  const fields = validResource(input);
  await requireFreeName(ctx, fields.name, resource.id);
  if (resource.name === fields.name && resource.unit === fields.unit) return;
  if (resource.unit !== fields.unit && (await ctx.repos.resources.events(resource.id)).length > 0) {
    throw new DomainError("resource.unitLocked");
  }
  await ctx.repos.resources.update(resource.id, fields);
  await auditResource(ctx, "resource.update", resource.id);
}

/**
 * A Member archives a Resource that the Farm does not use now: the forms do not offer it, and its
 * card and its history stay.
 */
export async function archiveResource(
  ctx: FarmCommandContext,
  input: { resourceId: ResourceId },
): Promise<void> {
  authorize(ctx.member, "resource.archive", { farmId: ctx.farm.id });
  const resource = await requireResource(ctx, input.resourceId);
  if (resource.archivedAt !== null) return;
  await ctx.repos.resources.update(resource.id, { archivedAt: ctx.now() });
  await auditResource(ctx, "resource.archive", resource.id);
}

/** A Member takes a Resource out of the archive. */
export async function unarchiveResource(
  ctx: FarmCommandContext,
  input: { resourceId: ResourceId },
): Promise<void> {
  authorize(ctx.member, "resource.archive", { farmId: ctx.farm.id });
  const resource = await requireResource(ctx, input.resourceId);
  if (resource.archivedAt === null) return;
  await ctx.repos.resources.update(resource.id, { archivedAt: null });
  await auditResource(ctx, "resource.unarchive", resource.id);
}

// Events.

/**
 * A Member records a Restock: a quantity of the Resource came to the Farm on a date. A Restock with
 * a price (in hundredths of the currency unit) makes an Automatic Expense of the System category
 * «Пополнение ресурса», of the Farm as a whole; the Farm's own harvest has no price. The Expense
 * keeps the price, and it goes away when a Member cancels the Restock.
 */
export async function recordRestock(
  ctx: FarmCommandContext,
  input: {
    resourceId: ResourceId;
    date: CalendarDate;
    quantity: number;
    price: number | null;
  },
): Promise<ResourceEventId> {
  authorize(ctx.member, "resource.record", { farmId: ctx.farm.id });
  const resource = await requireOpenResource(ctx, input.resourceId);
  const date = validDate(ctx, input.date);
  const quantity = validQuantity(input.quantity);
  if (input.price !== null) validPrice(input.price);
  const eventId = await addEvent(ctx, resource, {
    kind: "restock",
    date,
    quantity,
    flockId: null,
    reason: null,
  });
  if (input.price !== null) {
    await createAutomaticRecord(ctx, "resource.restock", {
      key: "restock",
      source: restockSource(eventId),
      date,
      amount: input.price,
      scope: { kind: "farm" },
    });
  }
  await auditEvent(ctx, "resource.restock", resource.id, eventId, null);
  return eventId;
}

/**
 * A Member records a Usage: a quantity of the Resource went to a Flock on a date. The Flock is not
 * Archived. The Stock can become less than 0: a Member can record the Restock later.
 */
export async function recordUsage(
  ctx: FarmCommandContext,
  input: { resourceId: ResourceId; date: CalendarDate; quantity: number; flockId: FlockId },
): Promise<ResourceEventId> {
  authorize(ctx.member, "resource.record", { farmId: ctx.farm.id });
  const resource = await requireOpenResource(ctx, input.resourceId);
  const date = validDate(ctx, input.date);
  const quantity = validQuantity(input.quantity);
  const flock = await ctx.repos.flocks.get(input.flockId);
  if (flock === null) throw new DomainError("flock.notFound");
  if (flock.archivedAt !== null) throw new DomainError("flock.archived");
  const eventId = await addEvent(ctx, resource, {
    kind: "usage",
    date,
    quantity,
    flockId: flock.id,
    reason: null,
  });
  await auditEvent(ctx, "resource.use", resource.id, eventId, flock.id);
  return eventId;
}

/**
 * A Member records an Adjustment after a count: at the end of the date, the Farm had the counted
 * quantity (0 or more). The Adjustment keeps the counted quantity, and the Stock on the date becomes
 * it (`stockSteps`); an event that a Member records later before that date does not move it. A
 * count that finds the Stock as it is changes nothing (`resource.adjustmentNoChange`). The reason is
 * required, for example «сено сгнило».
 */
export async function recordAdjustment(
  ctx: FarmCommandContext,
  input: { resourceId: ResourceId; date: CalendarDate; counted: number; reason: string },
): Promise<ResourceEventId> {
  authorize(ctx.member, "resource.record", { farmId: ctx.farm.id });
  const resource = await requireOpenResource(ctx, input.resourceId);
  const date = validDate(ctx, input.date);
  if (!Number.isSafeInteger(input.counted) || input.counted < 0 || input.counted > maxQuantity) {
    throw new DomainError("resource.quantityInvalid");
  }
  const reason = validReason(input.reason);
  const events = await ctx.repos.resources.events(resource.id);
  if (input.counted === stockOn(events, date)) {
    throw new DomainError("resource.adjustmentNoChange");
  }
  const eventId = await addEvent(
    ctx,
    resource,
    { kind: "adjustment", date, quantity: input.counted, flockId: null, reason },
    events,
  );
  await auditEvent(ctx, "resource.adjust", resource.id, eventId, null);
  return eventId;
}

/**
 * A Member cancels an event made by mistake: it becomes Deleted (ADR 0005), and the Stock changes
 * back. The Automatic Expense of a Restock becomes Deleted with it. An event of an Archived Resource
 * can be cancelled too.
 */
export async function cancelResourceEvent(
  ctx: FarmCommandContext,
  input: { eventId: ResourceEventId },
): Promise<void> {
  authorize(ctx.member, "resource.record", { farmId: ctx.farm.id });
  const event = await ctx.repos.resources.getEvent(input.eventId);
  if (event === null) throw new DomainError("resource.eventNotFound");
  const resource = await requireResource(ctx, event.resourceId);
  await ctx.repos.resources.markEventDeleted(event.id, ctx.now());
  if (event.kind === "restock") {
    const source = restockSource(event.id);
    if ((await ctx.repos.moneyRecords.findBySource(source)) !== null) {
      await deleteAutomaticRecord(ctx, "resource.cancelEvent", source);
    }
  }
  await refreshStock(ctx, resource, await ctx.repos.resources.events(resource.id));
  await auditEvent(ctx, "resource.cancelEvent", resource.id, event.id, event.flockId);
}

/**
 * A Member restores a cancelled Restock, Usage or Adjustment from the Trash, with the Automatic
 * Expense of a Restock with a price. The Stock of the Resource changes as when the event was new. An
 * Archived Resource gets no events (`resource.archived`); the Flock of a Usage can be Archived now,
 * as the event had it already. For the Trash, which checks the permission.
 */
export async function restoreResourceEvent(
  ctx: FarmCommandContext,
  id: ResourceEventId,
): Promise<void> {
  const event = await ctx.repos.resources.getDeletedEvent(id);
  if (event === null) throw new DomainError("trash.notFound");
  const resource = await requireOpenResource(ctx, event.resourceId);
  const source = restockSource(event.id);
  const expense =
    event.kind === "restock" ? await ctx.repos.moneyRecords.findDeletedBySource(source) : null;
  await ctx.repos.resources.markEventRestored(event.id);
  if (expense !== null) await restoreAutomaticRecord(ctx, "resource.restoreEvent", source);
  await refreshStock(ctx, resource, await ctx.repos.resources.events(resource.id));
  await auditEvent(ctx, "resource.restoreEvent", resource.id, event.id, event.flockId);
}

/** The source of the Automatic Expense of a Restock. */
export function restockSource(eventId: ResourceEventId): MoneySource {
  return { kind: "restock", id: eventId };
}

// The rules that the commands share.

/**
 * Writes the event and the new Stock of the Resource. `events` are the events of the Resource before
 * this one, if the command has read them already.
 */
async function addEvent(
  ctx: FarmCommandContext,
  resource: Resource,
  fields: Omit<ResourceEvent, "id" | "resourceId" | "createdAt">,
  events?: ResourceEvent[],
): Promise<ResourceEventId> {
  const before = events ?? (await ctx.repos.resources.events(resource.id));
  const event = { ...fields, resourceId: resource.id, createdAt: ctx.now() };
  const eventId = await ctx.repos.resources.insertEvent(event);
  await refreshStock(ctx, resource, [...before, { ...event, id: eventId }]);
  return eventId;
}

/** Writes the Stock of the Resource from all its events, if it changed. */
async function refreshStock(
  ctx: FarmCommandContext,
  resource: Resource,
  events: readonly ResourceEvent[],
): Promise<void> {
  const stock = stockOf(events);
  if (stock !== resource.stock) await ctx.repos.resources.update(resource.id, { stock });
}

function auditResource(
  ctx: FarmCommandContext,
  command: CommandName,
  id: ResourceId,
): Promise<void> {
  return recordFarmAudit(ctx, { command, target: { kind: "Resource", id } });
}

/**
 * The audit entries of an event: one for the event, one for its Resource, and one for the Flock of
 * a Usage, so that the history of each one shows it.
 */
async function auditEvent(
  ctx: FarmCommandContext,
  command: CommandName,
  resourceId: ResourceId,
  eventId: ResourceEventId,
  flockId: FlockId | null,
): Promise<void> {
  await recordFarmAudit(ctx, { command, target: { kind: "ResourceEvent", id: eventId } });
  await auditResource(ctx, command, resourceId);
  if (flockId !== null)
    await recordFarmAudit(ctx, { command, target: { kind: "Flock", id: flockId } });
}

async function requireResource(ctx: FarmCommandContext, id: ResourceId): Promise<Resource> {
  const resource = await ctx.repos.resources.get(id);
  if (resource === null) throw new DomainError("resource.notFound");
  return resource;
}

/** A Resource that is not Archived: only such a Resource gets new events. */
async function requireOpenResource(ctx: FarmCommandContext, id: ResourceId): Promise<Resource> {
  const resource = await requireResource(ctx, id);
  if (resource.archivedAt !== null) throw new DomainError("resource.archived");
  return resource;
}

/** Throws `resource.nameTaken` if another Resource, also an Archived one, has the name. */
async function requireFreeName(
  ctx: FarmCommandContext,
  name: string,
  self: ResourceId | null,
): Promise<void> {
  const same = await ctx.repos.resources.findByName(name);
  if (same.some((other) => other.id !== self)) throw new DomainError("resource.nameTaken");
}

/** The text with the spaces trimmed and the inner spaces as one. */
function clean(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function validResource(input: ResourceInput): ResourceInput {
  const name = clean(input.name);
  if (name === "") throw new DomainError("resource.nameRequired");
  if (name.length > maxResourceNameLength) throw new DomainError("resource.nameTooLong");
  const unit = clean(input.unit);
  if (unit === "") throw new DomainError("resource.unitRequired");
  if (unit.length > maxUnitLength) throw new DomainError("resource.unitTooLong");
  return { name, unit };
}

/** A real date, not in the future in the time zone of the Farm. */
function validDate(ctx: FarmCommandContext, date: CalendarDate): CalendarDate {
  if (!isCalendarDate(date)) throw new DomainError("resource.dateInvalid");
  if (date > dateAt(ctx.now(), ctx.farm.timeZone)) throw new DomainError("resource.dateInFuture");
  return date;
}

/** A whole number of thousandths of the unit, from 1 to `maxQuantity`. */
function validQuantity(quantity: number): number {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > maxQuantity) {
    throw new DomainError("resource.quantityInvalid");
  }
  return quantity;
}

/** The price of a Restock follows the rule of an amount of money (`money.amountInvalid`). */
function validPrice(price: number): void {
  if (!Number.isSafeInteger(price) || price < 1 || price > maxAmount) {
    throw new DomainError("money.amountInvalid");
  }
}

function validReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed === "") throw new DomainError("resource.reasonRequired");
  if (trimmed.length > maxReasonLength) throw new DomainError("resource.reasonTooLong");
  return trimmed;
}

/** A Member sets the Norms. Only events change the Stock. */
export async function setResourceNorms(
  ctx: FarmCommandContext,
  input: { resourceId: ResourceId; norms: Norms },
): Promise<void> {
  authorize(ctx.member, "resource.update", { farmId: ctx.farm.id });
  const resource = await requireOpenResource(ctx, input.resourceId);
  for (const group of normGroups) {
    const norm = input.norms[group];
    if (!Number.isSafeInteger(norm) || norm < 0 || norm > maxQuantity) {
      throw new DomainError("resource.normInvalid");
    }
  }
  if (normGroups.every((group) => resource.norms[group] === input.norms[group])) return;
  await ctx.repos.resources.update(resource.id, { norms: { ...input.norms } });
  await auditResource(ctx, "resource.setNorms", resource.id);
}

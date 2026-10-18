import { authorize } from "../access/permissions";
import { recordFarmAudit } from "../audit/audit";
import type { FarmCommandContext } from "../context";
import { type CalendarDate, dateAt, isCalendarDate } from "../dates";
import { DomainError, type ErrorCode } from "../errors";
import type { MembershipId, SheepId } from "../ids";
import {
  maxSheepNameLength,
  maxSheepNotesLength,
  maxTagLength,
  maxWeightKg,
  type Origin,
  type Sex,
  type Sheep,
  type Weighing,
} from "./sheep";

// The commands of the Sheep registry: register a Sheep, change it, give it to another Owner, and
// delete it. Each one checks the permission first and appends one audit entry for the Sheep.

/** The fields of a Sheep that a Member enters in the form. An empty text is no value. */
export interface SheepDetails {
  tag: string | null;
  name: string | null;
  sex: Sex;
  birthDate: CalendarDate | null;
  notes: string | null;
  weight: Weighing | null;
}

/** The Origin of a Sheep that a Member registers: an External Sheep comes with the pedigree. */
export type RegisteredOrigin = Extract<Origin, "born" | "bought">;

/** A new Sheep of the Farm. */
export interface SheepRegistration extends SheepDetails {
  ownerId: MembershipId;
  origin: RegisteredOrigin;
  /**
   * True for an Initial entry: a Sheep that was on the Farm before the app. Its Origin is Born or
   * Bought, its birth date is optional, and it needs no Purchase.
   */
  initialEntry: boolean;
}

/**
 * A Member registers a Sheep. Outside the Initial entry, a Sheep is Born on the Farm and has a birth
 * date: a Bought Sheep comes from a Purchase (`sheep.purchaseRequired`). The Tag is optional, and
 * unique among the Sheep of the Farm. The Owner is a Member of the Farm.
 */
export async function registerSheep(
  ctx: FarmCommandContext,
  input: SheepRegistration,
): Promise<SheepId> {
  authorize(ctx.member, "sheep.register", { farmId: ctx.farm.id });
  if (!input.initialEntry && input.origin === "bought") {
    throw new DomainError("sheep.purchaseRequired");
  }
  const details = validDetails(input, today(ctx));
  requireBirthDate(details, input);
  await requireFreeTag(ctx, details.tag, null);
  await requireOwner(ctx, input.ownerId);
  const sheepId = await ctx.repos.sheep.insert({
    ...details,
    origin: input.origin,
    initialEntry: input.initialEntry,
    status: "active",
    ownerId: input.ownerId,
    registeredAt: ctx.now(),
  });
  await recordSheepAudit(ctx, "sheep.register", sheepId);
  return sheepId;
}

/** The new fields of a Sheep. The Origin changes only for an Initial entry, between Born and Bought. */
export interface SheepUpdate extends SheepDetails {
  sheepId: SheepId;
  origin?: RegisteredOrigin;
}

/**
 * A Member changes the fields of a Sheep. The same rules apply as for a new Sheep. The Owner changes
 * only with `changeSheepOwner`, which records the date. A change that changes nothing writes nothing.
 */
export async function updateSheep(ctx: FarmCommandContext, input: SheepUpdate): Promise<void> {
  authorize(ctx.member, "sheep.update", { farmId: ctx.farm.id });
  const sheep = await requireSheep(ctx, input.sheepId);
  const origin = input.origin ?? sheep.origin;
  if (origin !== sheep.origin && !sheep.initialEntry) throw new DomainError("sheep.originLocked");
  const details = validDetails(input, today(ctx));
  requireBirthDate(details, { origin, initialEntry: sheep.initialEntry });
  await requireFreeTag(ctx, details.tag, sheep.id);
  const changed = { ...details, origin };
  if (sameFields(sheep, changed)) return;
  await ctx.repos.sheep.update(sheep.id, changed);
  await recordSheepAudit(ctx, "sheep.update", sheep.id);
}

/**
 * A Member gives an Active Sheep to another Member of the Farm, on a date. The date is not in the
 * future, and not before the birth date or the last change of the Owner. The card shows the history
 * of the Owners.
 */
export async function changeSheepOwner(
  ctx: FarmCommandContext,
  input: { sheepId: SheepId; ownerId: MembershipId; date: CalendarDate },
): Promise<void> {
  authorize(ctx.member, "sheep.changeOwner", { farmId: ctx.farm.id });
  const sheep = await requireSheep(ctx, input.sheepId);
  if (sheep.status !== "active" || sheep.ownerId === null) throw new DomainError("sheep.notActive");
  if (input.ownerId === sheep.ownerId) throw new DomainError("sheep.sameOwner");
  await requireOwner(ctx, input.ownerId);
  const date = validDate(input.date);
  const lastChange = (await ctx.repos.sheep.ownerChanges(sheep.id)).at(-1);
  if (
    date > today(ctx) ||
    (sheep.birthDate !== null && date < sheep.birthDate) ||
    (lastChange !== undefined && date < lastChange.date)
  ) {
    throw new DomainError("sheep.ownerChangeDateInvalid");
  }
  await ctx.repos.sheep.insertOwnerChange({
    sheepId: sheep.id,
    previousOwnerId: sheep.ownerId,
    ownerId: input.ownerId,
    date,
    at: ctx.now(),
  });
  await ctx.repos.sheep.update(sheep.id, { ownerId: input.ownerId });
  await recordSheepAudit(ctx, "sheep.changeOwner", sheep.id);
}

/**
 * A Member deletes a Sheep that was registered by mistake. The Sheep becomes Deleted: the app hides
 * it but keeps it, and a Member can restore it (ADR 0005).
 */
export async function deleteSheep(
  ctx: FarmCommandContext,
  input: { sheepId: SheepId },
): Promise<void> {
  authorize(ctx.member, "sheep.delete", { farmId: ctx.farm.id });
  const sheep = await requireSheep(ctx, input.sheepId);
  await ctx.repos.sheep.markDeleted(sheep.id, ctx.now());
  await recordSheepAudit(ctx, "sheep.delete", sheep.id);
}

/** Today in the time zone of the Farm. */
function today(ctx: FarmCommandContext): CalendarDate {
  return dateAt(ctx.now(), ctx.farm.timeZone);
}

function recordSheepAudit(
  ctx: FarmCommandContext,
  command: "sheep.register" | "sheep.update" | "sheep.changeOwner" | "sheep.delete",
  sheepId: SheepId,
): Promise<void> {
  return recordFarmAudit(ctx, { command, target: { kind: "Sheep", id: sheepId } });
}

/** The Sheep of the Farm, or `sheep.notFound`. A Deleted Sheep and an External Sheep are not found. */
async function requireSheep(ctx: FarmCommandContext, id: SheepId): Promise<Sheep> {
  const sheep = await ctx.repos.sheep.get(id);
  if (sheep === null || sheep.origin === "external") throw new DomainError("sheep.notFound");
  return sheep;
}

/**
 * Throws `sheep.tagTaken` if another Sheep of the Farm has the same Tag. A Sold or a Dead Sheep keeps
 * its Tag; a Deleted Sheep and an External Sheep do not count.
 */
async function requireFreeTag(
  ctx: FarmCommandContext,
  tag: string | null,
  self: SheepId | null,
): Promise<void> {
  if (tag === null) return;
  const same = await ctx.repos.sheep.findByTag(tag);
  if (same.some((other) => other.id !== self)) {
    throw new DomainError("sheep.tagTaken");
  }
}

/**
 * Throws `sheep.ownerNotMember` if the Owner is not a Member of the Farm now. The Owner of an Active
 * Sheep is always a Member who is not removed: `removeMember` rejects a Member who owns one. A
 * command that makes a Sheep Active again (a restore, a found Lost Sheep, a cancelled Sale) checks
 * the Owner with this rule too.
 */
export async function requireOwner(ctx: FarmCommandContext, ownerId: MembershipId): Promise<void> {
  const membership = await ctx.repos.memberships.get(ownerId);
  if (membership === null || membership.archivedAt !== undefined) {
    throw new DomainError("sheep.ownerNotMember");
  }
}

/** A Born Sheep outside the Initial entry has a birth date. */
function requireBirthDate(
  details: SheepDetails,
  sheep: { origin: Origin; initialEntry: boolean },
): void {
  if (details.birthDate === null && sheep.origin === "born" && !sheep.initialEntry) {
    throw new DomainError("sheep.birthDateRequired");
  }
}

/** The fields with the texts trimmed and the dates checked, or a domain error. */
function validDetails(input: SheepDetails, today: CalendarDate): SheepDetails {
  const tag = optionalText(input.tag, maxTagLength, "sheep.tagTooLong");
  const birthDate = input.birthDate === null ? null : validDate(input.birthDate);
  if (birthDate !== null && birthDate > today) throw new DomainError("sheep.birthDateInFuture");
  return {
    tag: tag === null ? null : tag.replace(/\s+/g, " "),
    name: optionalText(input.name, maxSheepNameLength, "sheep.nameTooLong"),
    sex: input.sex,
    birthDate,
    notes: optionalText(input.notes, maxSheepNotesLength, "sheep.notesTooLong"),
    weight: input.weight === null ? null : validWeight(input.weight, birthDate, today),
  };
}

function validWeight(weight: Weighing, birthDate: CalendarDate | null, today: CalendarDate) {
  if (!Number.isFinite(weight.kg) || weight.kg <= 0 || weight.kg > maxWeightKg) {
    throw new DomainError("sheep.weightInvalid");
  }
  const date = validDate(weight.date);
  if (date > today || (birthDate !== null && date < birthDate)) {
    throw new DomainError("sheep.weighingDateInvalid");
  }
  return { kg: weight.kg, date };
}

function validDate(date: string): CalendarDate {
  if (!isCalendarDate(date)) throw new DomainError("sheep.dateInvalid");
  return date;
}

/** The trimmed text, or null if it is empty. Throws the code if the text is too long. */
function optionalText(text: string | null, maxLength: number, code: ErrorCode): string | null {
  const trimmed = text?.trim() ?? "";
  if (trimmed === "") return null;
  if (trimmed.length > maxLength) throw new DomainError(code);
  return trimmed;
}

function sameFields(sheep: Sheep, fields: SheepDetails & { origin: Origin }): boolean {
  return (
    sheep.tag === fields.tag &&
    sheep.name === fields.name &&
    sheep.sex === fields.sex &&
    sheep.birthDate === fields.birthDate &&
    sheep.notes === fields.notes &&
    sheep.origin === fields.origin &&
    sheep.weight?.kg === fields.weight?.kg &&
    sheep.weight?.date === fields.weight?.date
  );
}

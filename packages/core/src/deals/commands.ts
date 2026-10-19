import { authorize } from "../access/permissions";
import { type CommandName, recordFarmAudit } from "../audit/audit";
import type { FarmCommandContext } from "../context";
import { type CalendarDate, dateAt, isCalendarDate } from "../dates";
import { DomainError } from "../errors";
import { recordFlockMove } from "../flocks/commands";
import type { DealId, FlockId, SheepId } from "../ids";
import {
  createAutomaticRecord,
  deleteAutomaticRecord,
  updateAutomaticRecord,
} from "../money/commands";
import { maxAmount, type MoneyScope } from "../money/money";
import {
  type BoughtSheep,
  requireNotParent,
  requireOwner,
  validBoughtSheep,
} from "../sheep/commands";
import { recordStatusChange, requireStatusChange, revertStatusChange } from "../sheep/lifecycle";
import type { Sheep, StatusChange } from "../sheep/sheep";
import { type Deal, type DealKind, dealSource, maxSheepPerPurchase, maxSheepPerSale } from "./deal";

// The commands of the Sales and the Purchases. Each one checks the permission and all its rules
// before the first write, so that a deal never changes some of its Sheep and not the others. Each
// one appends an audit entry for the deal, for its Automatic record and for each of its Sheep.

/** A Sale: the Active Sheep, the day and the total price, in hundredths of the currency unit. */
export interface SaleInput {
  sheepIds: readonly SheepId[];
  date: CalendarDate;
  price: number;
}

/**
 * A Member sells one or more Active Sheep of the Farm, also of different Owners, on a date, for one
 * total price. Each Sheep becomes Sold and leaves its Flock on that date, as with a change of the
 * Status. The Sale makes its Automatic record: an Income of «Продажа баранов» with the price, about
 * the Sheep if the Sale has one, else about the Farm. Gives the id of the Sale.
 */
export async function sellSheep(ctx: FarmCommandContext, input: SaleInput): Promise<DealId> {
  authorize(ctx.member, "deal.create", { farmId: ctx.farm.id });
  const sheepIds = [...new Set(input.sheepIds)];
  requireSheepCount(sheepIds.length, maxSheepPerSale);
  const date = validDate(ctx, input.date);
  const price = validPrice(input.price);
  const selling: Sheep[] = [];
  for (const sheepId of sheepIds) {
    const sheep = await requireSheep(ctx, sheepId);
    await requireStatusChange(ctx, sheep, date);
    selling.push(sheep);
  }
  const dealId = await ctx.repos.deals.insert({
    kind: "sale",
    date,
    sheepIds,
    flockId: null,
    createdAt: ctx.now(),
  });
  await auditDeal(ctx, "sale.create", "sale", dealId);
  await createAutomaticRecord(ctx, "sale.create", {
    key: "sheepSale",
    source: dealSource({ kind: "sale", id: dealId }),
    date,
    amount: price,
    scope: scopeOf(sheepIds),
  });
  for (const sheep of selling) {
    await recordStatusChange(ctx, sheep, { status: "sold", date, reason: null, saleId: dealId });
    await auditSheep(ctx, "sale.create", sheep.id);
  }
  return dealId;
}

/** A Purchase: the new Sheep, the day, the total price and the Flock of the new Sheep, or null. */
export interface PurchaseInput {
  sheep: readonly BoughtSheep[];
  date: CalendarDate;
  price: number;
  flockId: FlockId | null;
}

/**
 * A Member records that the Farm bought one or more new Sheep on a date, for one total price, in
 * one form. Each Sheep is registered with the Origin Bought and the id of the Purchase, by the rules
 * of a new Sheep (`validBoughtSheep`), and goes into the Flock on that date, if the Purchase has
 * one. The Purchase makes its Automatic record: an Expense of «Покупка баранов» with the price,
 * about the Sheep if the Purchase has one, else about the Farm. Gives the id of the Purchase.
 */
export async function buySheep(ctx: FarmCommandContext, input: PurchaseInput): Promise<DealId> {
  authorize(ctx.member, "deal.create", { farmId: ctx.farm.id });
  requireSheepCount(input.sheep.length, maxSheepPerPurchase);
  const date = validDate(ctx, input.date);
  const price = validPrice(input.price);
  if (input.flockId !== null) {
    const flock = await ctx.repos.flocks.get(input.flockId);
    if (flock === null) throw new DomainError("flock.notFound");
    if (flock.archivedAt !== null) throw new DomainError("flock.archived");
  }
  const rows = await validBoughtSheep(ctx, input.sheep, date);
  const dealId = await ctx.repos.deals.insert({
    kind: "purchase",
    date,
    sheepIds: [],
    flockId: input.flockId,
    createdAt: ctx.now(),
  });
  const sheepIds: SheepId[] = [];
  for (const row of rows) {
    const sheepId = await ctx.repos.sheep.insert({ ...row, purchaseId: dealId });
    sheepIds.push(sheepId);
    if (input.flockId !== null) {
      const sheep = await ctx.repos.sheep.get(sheepId);
      if (sheep !== null) await recordFlockMove(ctx, sheep, input.flockId, date);
    }
    await auditSheep(ctx, "purchase.create", sheepId);
  }
  await ctx.repos.deals.setSheep(dealId, sheepIds);
  await auditDeal(ctx, "purchase.create", "purchase", dealId);
  await createAutomaticRecord(ctx, "purchase.create", {
    key: "sheepPurchase",
    source: dealSource({ kind: "purchase", id: dealId }),
    date,
    amount: price,
    scope: scopeOf(sheepIds),
  });
  return dealId;
}

/**
 * A Member changes the price of a Sale or a Purchase. The price is the amount of its Automatic
 * record, so this changes the record: a change of its amount in the table of the Incomes or the
 * Expenses changes the price of the deal in the same way. A change of nothing writes nothing.
 */
export async function changeDealPrice(
  ctx: FarmCommandContext,
  input: { dealId: DealId; price: number },
): Promise<void> {
  authorize(ctx.member, "deal.update", { farmId: ctx.farm.id });
  const deal = await requireDeal(ctx, input.dealId);
  const price = validPrice(input.price);
  const record = await ctx.repos.moneyRecords.findBySource(dealSource(deal));
  if (record === null) throw new DomainError("money.notFound");
  if (record.amount === price) return;
  const command = deal.kind === "sale" ? "sale.updatePrice" : "purchase.updatePrice";
  await updateAutomaticRecord(ctx, command, dealSource(deal), {
    date: record.date,
    amount: price,
    scope: record.scope,
  });
  await auditDeal(ctx, command, deal.kind, deal.id);
}

/**
 * A Member cancels a Sale or a Purchase made by mistake. The deal and its Automatic record become
 * Deleted (ADR 0005): a Member cannot delete the record alone. The Trash can restore the deal later.
 *
 * - A cancelled Sale makes its Sheep Active again: each one goes back to the Flock that it left with
 *   the Sale, if that Flock is not Archived now. The Owner of each Sheep must be a Member now
 *   (`sheep.ownerNotMember`).
 * - A cancelled Purchase makes its Sheep Deleted. The core rejects it if one of them is the parent
 *   of another Sheep (`sheep.isParent`), or if a Sale sold one (`deal.sheepSold`): cancel that Sale
 *   first.
 */
export async function cancelDeal(
  ctx: FarmCommandContext,
  input: { dealId: DealId },
): Promise<void> {
  authorize(ctx.member, "deal.cancel", { farmId: ctx.farm.id });
  const deal = await requireDeal(ctx, input.dealId);
  if (deal.kind === "sale") await cancelSale(ctx, deal);
  else await cancelPurchase(ctx, deal);
  await deleteAutomaticRecord(ctx, cancelCommands[deal.kind], dealSource(deal));
  await ctx.repos.deals.markDeleted(deal.id, ctx.now());
  await auditDeal(ctx, cancelCommands[deal.kind], deal.kind, deal.id);
}

const cancelCommands = {
  sale: "sale.cancel",
  purchase: "purchase.cancel",
} as const satisfies Record<DealKind, CommandName>;

/** The Sheep of the Sale become Active again: each one gets the Status and the Flock from before. */
async function cancelSale(ctx: FarmCommandContext, deal: Deal): Promise<void> {
  const reverting: { sheep: Sheep; change: StatusChange }[] = [];
  for (const sheepId of deal.sheepIds) {
    const sheep = await ctx.repos.sheep.get(sheepId);
    const change =
      sheep === null ? undefined : (await ctx.repos.sheep.statusChanges(sheep.id)).at(-1);
    // A Sold Sheep cannot change after the Sale, so its last change is the Sale's.
    if (sheep === null || sheep.status !== "sold" || change?.saleId !== deal.id) {
      throw new DomainError("sheep.notFound");
    }
    if (sheep.ownerId !== null) await requireOwner(ctx, sheep.ownerId);
    reverting.push({ sheep, change });
  }
  for (const { sheep, change } of reverting) {
    await revertStatusChange(ctx, sheep, change);
    await auditSheep(ctx, "sale.cancel", sheep.id);
  }
}

/** The Sheep of the Purchase become Deleted. */
async function cancelPurchase(ctx: FarmCommandContext, deal: Deal): Promise<void> {
  const deleting: Sheep[] = [];
  for (const sheepId of deal.sheepIds) {
    const sheep = await ctx.repos.sheep.get(sheepId);
    if (sheep === null) throw new DomainError("sheep.notFound");
    if (sheep.status === "sold") throw new DomainError("deal.sheepSold");
    await requireNotParent(ctx, sheep.id);
    deleting.push(sheep);
  }
  for (const sheep of deleting) {
    await ctx.repos.sheep.markDeleted(sheep.id, ctx.now());
    await auditSheep(ctx, "purchase.cancel", sheep.id);
  }
}

/** The deal, or `deal.notFound`: a cancelled deal is Deleted, so it is not found either. */
async function requireDeal(ctx: FarmCommandContext, id: DealId): Promise<Deal> {
  const deal = await ctx.repos.deals.get(id);
  if (deal === null) throw new DomainError("deal.notFound");
  return deal;
}

/** The Sheep of the Farm, or `sheep.notFound`. A Deleted Sheep and an External Sheep are not found. */
async function requireSheep(ctx: FarmCommandContext, id: SheepId): Promise<Sheep> {
  const sheep = await ctx.repos.sheep.get(id);
  if (sheep === null || sheep.origin === "external") throw new DomainError("sheep.notFound");
  return sheep;
}

/** A deal has at least one Sheep (`deal.noSheep`) and at most `max` (`deal.tooManySheep`). */
function requireSheepCount(count: number, max: number): void {
  if (count === 0) throw new DomainError("deal.noSheep");
  if (count > max) throw new DomainError("deal.tooManySheep");
}

/** A real date, not in the future: the Farm got or paid the money on it. */
function validDate(ctx: FarmCommandContext, date: CalendarDate): CalendarDate {
  if (!isCalendarDate(date)) throw new DomainError("deal.dateInvalid");
  if (date > dateAt(ctx.now(), ctx.farm.timeZone)) throw new DomainError("deal.dateInFuture");
  return date;
}

/** A deal always has a price: a whole number of hundredths, from 1 to `maxAmount`. */
function validPrice(price: number): number {
  if (!Number.isSafeInteger(price) || price < 1 || price > maxAmount) {
    throw new DomainError("deal.priceInvalid");
  }
  return price;
}

/**
 * What the Automatic record of a deal is about: the Sheep, if the deal has one; else the Farm as a
 * whole. A total price of many Sheep is not split between them.
 */
function scopeOf(sheepIds: readonly SheepId[]): MoneyScope {
  const [only] = sheepIds;
  return sheepIds.length === 1 && only !== undefined
    ? { kind: "sheep", sheepId: only }
    : { kind: "farm" };
}

function auditDeal(
  ctx: FarmCommandContext,
  command: CommandName,
  kind: DealKind,
  id: DealId,
): Promise<void> {
  return recordFarmAudit(ctx, {
    command,
    target: { kind: kind === "sale" ? "Sale" : "Purchase", id },
  });
}

function auditSheep(ctx: FarmCommandContext, command: CommandName, id: SheepId): Promise<void> {
  return recordFarmAudit(ctx, { command, target: { kind: "Sheep", id } });
}

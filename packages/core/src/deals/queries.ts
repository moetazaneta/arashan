import { authorize } from "../access/permissions";
import type { FarmQueryContext } from "../context";
import type { CalendarDate } from "../dates";
import { type FlockRef, flockRefOf, flocksById } from "../flocks/queries";
import type { DealId, MembershipId, MoneyRecordId, SheepId } from "../ids";
import { type OwnerRef, ownerNames, type SheepRef } from "../sheep/queries";
import type { Sheep, SheepStatus } from "../sheep/sheep";
import { type Deal, type DealKind, dealSource } from "./deal";

// The queries of the Sales and the Purchases. The price of a deal is the amount of its Automatic
// record, so each query reads the record.

/** The Sheep of a deal that a row of the list shows, the first ones of the deal. */
export const dealSheepPreview = 5;

/** A deal as the list «Сделки» shows it. */
export interface DealRow {
  id: DealId;
  kind: DealKind;
  date: CalendarDate;
  /** The total price, in hundredths of the currency unit: the amount of the Automatic record. */
  price: number;
  /** The Automatic record: an Income of a Sale, an Expense of a Purchase. */
  recordId: MoneyRecordId | null;
  sheepCount: number;
  /** The first Sheep of the deal, at most `dealSheepPreview`. */
  sheep: SheepRef[];
  /** The Flock of the new Sheep of a Purchase, or null. */
  flock: FlockRef | null;
  createdAt: number;
}

/** A Sheep of a deal, as the card of the deal shows it: with its Status and its Owner now. */
export interface DealSheepRow extends SheepRef {
  status: SheepStatus;
  owner: OwnerRef | null;
}

/** A deal as its card shows it, with all its Sheep. */
export interface DealCard extends Omit<DealRow, "sheep"> {
  sheep: DealSheepRow[];
}

/** The Sales and the Purchases of the Farm, or the deals of one kind, the newest first. */
export async function listDeals(
  ctx: FarmQueryContext,
  input: { kind: DealKind | null },
): Promise<DealRow[]> {
  authorize(ctx.member, "deal.view", { farmId: ctx.farm.id });
  const deals = (await ctx.repos.deals.list())
    .filter((deal) => input.kind === null || deal.kind === input.kind)
    .sort(newestFirst);
  const flocks = await flocksById(ctx);
  return Promise.all(
    deals.map(async (deal) => {
      const sheep = await sheepOf(ctx, deal.sheepIds.slice(0, dealSheepPreview));
      return {
        ...(await rowOf(ctx, deal)),
        sheep: sheep.map(toRef),
        flock: deal.flockId === null ? null : flockRefOf(flocks, deal.flockId),
      };
    }),
  );
}

/**
 * The card of a deal, or null if the Farm has no such deal or it is cancelled: a card that is open
 * when a Member cancels the deal then shows that it is gone.
 */
export async function getDeal(
  ctx: FarmQueryContext,
  input: { dealId: DealId },
): Promise<DealCard | null> {
  authorize(ctx.member, "deal.view", { farmId: ctx.farm.id });
  const deal = await ctx.repos.deals.get(input.dealId);
  if (deal === null) return null;
  const [sheep, owners, flocks] = await Promise.all([
    sheepOf(ctx, deal.sheepIds),
    ownerNames(ctx),
    flocksById(ctx),
  ]);
  return {
    ...(await rowOf(ctx, deal)),
    flock: deal.flockId === null ? null : flockRefOf(flocks, deal.flockId),
    sheep: sheep.map((one) => ({
      ...toRef(one),
      status: one.status,
      owner: one.ownerId === null ? null : ownerRef(owners, one.ownerId),
    })),
  };
}

/** The fields of a row that every deal has, with the price from its Automatic record. */
async function rowOf(ctx: FarmQueryContext, deal: Deal): Promise<Omit<DealRow, "sheep" | "flock">> {
  const record = await ctx.repos.moneyRecords.findBySource(dealSource(deal));
  return {
    id: deal.id,
    kind: deal.kind,
    date: deal.date,
    // The commands write a deal and its record in one transaction, so a deal always has one.
    price: record?.amount ?? 0,
    recordId: record?.id ?? null,
    sheepCount: deal.sheepIds.length,
    createdAt: deal.createdAt,
  };
}

/** The Sheep of the ids, in their order. A deal never has a Deleted Sheep (`sheep.inDeal`). */
async function sheepOf(ctx: FarmQueryContext, ids: readonly SheepId[]): Promise<Sheep[]> {
  const found = await Promise.all(ids.map((id) => ctx.repos.sheep.get(id)));
  return found.filter((sheep) => sheep !== null);
}

function toRef(sheep: Sheep): SheepRef {
  return { id: sheep.id, tag: sheep.tag, name: sheep.name, sex: sheep.sex, origin: sheep.origin };
}

function ownerRef(owners: Map<MembershipId, string>, id: MembershipId): OwnerRef {
  return { id, name: owners.get(id) ?? "" };
}

/** By date, the newest first; on one date, the one made last first. */
function newestFirst(a: Deal, b: Deal): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return b.createdAt - a.createdAt;
}

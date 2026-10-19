import type { CalendarDate } from "../dates";
import type { DealId, SheepId } from "../ids";
import type { SheepRef } from "../sheep/queries";
import type { Sheep } from "../sheep/sheep";
import type { TrashType } from "../trash/trash";
import { restoreDeal } from "./commands";
import { type DealKind, dealSource } from "./deal";
import { dealSheepPreview } from "./queries";

/** A cancelled Sale or Purchase as the Trash shows it. */
export interface TrashDeal {
  kind: DealKind;
  date: CalendarDate;
  /** The price: the amount of its Deleted Automatic record, or null if it has none. */
  price: number | null;
  sheepCount: number;
  /** The first Sheep of the deal, at most `dealSheepPreview`. The Sheep of a Purchase are Deleted. */
  sheep: SheepRef[];
}

/** The cancelled deals. Each one comes back with its Automatic record and its Sheep. */
export const dealTrash: TrashType<"deal", TrashDeal> = {
  async list(ctx) {
    const deals = await ctx.repos.deals.listDeleted();
    if (deals.length === 0) return [];
    // The record that became Deleted last is the price, if an event has more than one.
    const prices = new Map<string, number>();
    const records = await ctx.repos.moneyRecords.listDeleted();
    for (const record of records.sort((a, b) => a.deletedAt - b.deletedAt)) {
      if (record.source !== null) prices.set(sourceKey(record.source), record.amount);
    }
    // The Sheep of a cancelled Purchase are Deleted; the Sheep of a cancelled Sale are not. Only the
    // first Sheep of each deal are read, not all Sheep of the Farm.
    const deleted = new Map<SheepId, Sheep>();
    for (const one of await ctx.repos.sheep.listDeleted()) deleted.set(one.id, one);
    const sheepOf = async (id: SheepId) => deleted.get(id) ?? (await ctx.repos.sheep.get(id));
    return Promise.all(
      deals.map(async (deal) => {
        const shown = await Promise.all(deal.sheepIds.slice(0, dealSheepPreview).map(sheepOf));
        return {
          kind: "deal" as const,
          id: deal.id,
          deletedAt: deal.deletedAt,
          record: {
            kind: deal.kind,
            date: deal.date,
            price: prices.get(sourceKey(dealSource(deal))) ?? null,
            sheepCount: deal.sheepIds.length,
            sheep: shown.flatMap((one) =>
              one === null || one === undefined
                ? []
                : [{ id: one.id, tag: one.tag, name: one.name, sex: one.sex, origin: one.origin }],
            ),
          },
        };
      }),
    );
  },
  restore: (ctx, id) => restoreDeal(ctx, id as DealId),
};

function sourceKey(source: { kind: string; id: string }): string {
  return `${source.kind}:${source.id}`;
}

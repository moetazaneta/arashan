import { authorize } from "../access/permissions";
import type { FarmQueryContext } from "../context";
import type { CalendarDate } from "../dates";
import { type FlockRef, flockRefOf, flocksById } from "../flocks/queries";
import type { MoneyRecordId, ResourceEventId, ResourceId } from "../ids";
import { restockSource } from "./commands";
import { inEventOrder, type Resource, type ResourceEventKind, stockChange } from "./resource";

// The queries of the Resources. The list shows the Archived Resources too, with the flag
// `archived`: the history shows them, and a form leaves them out.

/** A Resource as its list shows it. */
export interface ResourceRow {
  id: ResourceId;
  name: string;
  unit: string;
  /** The Stock now, in thousandths of the unit. */
  stock: number;
  archived: boolean;
}

/** One event of a Resource, as its card shows it. */
export interface ResourceEventRow {
  id: ResourceEventId;
  kind: ResourceEventKind;
  date: CalendarDate;
  /**
   * How much the event changed the Stock, in thousandths of the unit: more than 0 for a Restock,
   * less than 0 for a Usage, and either for an Adjustment.
   */
  change: number;
  /** The Stock after the event, with all the events before it. */
  stockAfter: number;
  /** The Flock of a Usage, or null. */
  flock: FlockRef | null;
  /** The reason of an Adjustment, or null. */
  reason: string | null;
  /** The Automatic Expense of a Restock with a price, or null. */
  expense: { id: MoneyRecordId; amount: number } | null;
}

/** The card of a Resource: its Stock now and its events, the newest first. */
export interface ResourceCard extends ResourceRow {
  events: ResourceEventRow[];
}

/** The Resources of the Farm, also the Archived ones, by name. */
export async function listResources(ctx: FarmQueryContext): Promise<ResourceRow[]> {
  authorize(ctx.member, "resource.view", { farmId: ctx.farm.id });
  const resources = await ctx.repos.resources.list();
  return resources.map(resourceRow).sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

/**
 * The card of a Resource, or null if the Farm has no such Resource. The price of a Restock is the amount of its Automatic Expense: a Member
 * can change it in the table of Expenses.
 */
export async function getResource(
  ctx: FarmQueryContext,
  input: { resourceId: ResourceId },
): Promise<ResourceCard | null> {
  authorize(ctx.member, "resource.view", { farmId: ctx.farm.id });
  const resource = await ctx.repos.resources.get(input.resourceId);
  if (resource === null) return null;
  const [events, flocks] = await Promise.all([
    ctx.repos.resources.events(resource.id),
    flocksById(ctx),
  ]);
  let stock = 0;
  const rows: ResourceEventRow[] = [];
  for (const event of inEventOrder(events)) {
    const change = stockChange(event);
    stock += change;
    const expense =
      event.kind === "restock"
        ? await ctx.repos.moneyRecords.findBySource(restockSource(event.id))
        : null;
    rows.push({
      id: event.id,
      kind: event.kind,
      date: event.date,
      change,
      stockAfter: stock,
      flock: event.flockId === null ? null : flockRefOf(flocks, event.flockId),
      reason: event.reason,
      expense: expense === null ? null : { id: expense.id, amount: expense.amount },
    });
  }
  // The card computes the Stock from the events, as `stockOf` does, so it shows the same sum as
  // the list of events.
  return { ...resourceRow(resource), stock, events: rows.reverse() };
}

function resourceRow(resource: Resource): ResourceRow {
  return {
    id: resource.id,
    name: resource.name,
    unit: resource.unit,
    stock: resource.stock,
    archived: resource.archivedAt !== null,
  };
}

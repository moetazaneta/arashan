import { authorize } from "../access/permissions";
import type { FarmQueryContext } from "../context";
import { type CalendarDate, isCalendarDate } from "../dates";
import { DomainError } from "../errors";
import { isOnFarm, type Sheep } from "../sheep/sheep";
import {
  dailyNeed,
  daysOfStock,
  groupCounts,
  usageDays,
  usageSuggestion,
  type Norms,
  type GroupCounts,
} from "./norms";
import { type FlockRef, flockRefOf, flocksById } from "../flocks/queries";
import type { FlockId, MoneyRecordId, ResourceEventId, ResourceId } from "../ids";
import { restockSource } from "./commands";
import { type Resource, type ResourceEventKind, stockSteps } from "./resource";

// The queries of the Resources. The list shows the Archived Resources too, with the flag
// `archived`: the history shows them, and a form leaves them out.

/** A Resource as its list shows it. */
export interface ResourceRow {
  id: ResourceId;
  name: string;
  unit: string;
  /** The Stock now, in thousandths of the unit. */
  stock: number;
  norms: Norms;
  archived: boolean;
}

/** One event of a Resource, as its card shows it. */
export interface ResourceEventRow {
  id: ResourceEventId;
  kind: ResourceEventKind;
  date: CalendarDate;
  /**
   * How much the event changed the Stock, in thousandths of the unit: more than 0 for a Restock,
   * less than 0 for a Usage, and for an Adjustment the difference between the count and the Stock
   * before it.
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
  const steps = stockSteps(events);
  const rows: ResourceEventRow[] = [];
  for (const { event, change, stock } of steps) {
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
  const stock = steps.at(-1)?.stock ?? 0;
  return { ...resourceRow(resource), stock, events: rows.reverse() };
}

function resourceRow(resource: Resource): ResourceRow {
  return {
    id: resource.id,
    name: resource.name,
    unit: resource.unit,
    stock: resource.stock,
    norms: resource.norms,
    archived: resource.archivedAt !== null,
  };
}

/** The Norms, Sheep and days behind the suggested quantity of a Usage. */
export interface UsageSuggestion {
  norms: Norms;
  counts: GroupCounts;
  perDay: number;
  days: number;
  lastUsage: CalendarDate | null;
  quantity: number;
}

/** How long the whole Stock would last for one Flock alone. */
export interface FlockForecast {
  flock: FlockRef;
  counts: GroupCounts;
  dailyNeed: number;
  days: number | null;
}

/** How long the Stock would last for the Farm and for its Flocks. */
export interface StockForecast {
  resourceId: ResourceId;
  stock: number;
  dailyNeed: number;
  days: number | null;
  flocks: FlockForecast[];
}

/** The Usage suggestion uses the Sheep in the Flock now and their age on the supplied date. */
export async function suggestUsage(
  ctx: FarmQueryContext,
  input: { resourceId: ResourceId; flockId: FlockId; date: CalendarDate },
): Promise<UsageSuggestion | null> {
  authorize(ctx.member, "resource.view", { farmId: ctx.farm.id });
  if (!isCalendarDate(input.date)) throw new DomainError("resource.dateInvalid");
  const [resource, flock] = await Promise.all([
    ctx.repos.resources.get(input.resourceId),
    ctx.repos.flocks.get(input.flockId),
  ]);
  if (resource === null || flock === null) return null;
  const [sheep, events] = await Promise.all([
    ctx.repos.sheep.listInFlock(flock.id),
    ctx.repos.resources.events(resource.id),
  ]);
  const counts = groupCounts(sheep.filter(isOnFarm), ctx.farm.lambAgeMonths, input.date);
  const dates = events
    .filter((event) => event.kind === "usage" && event.flockId === flock.id)
    .map((event) => event.date);
  const lastUsage =
    dates
      .filter((date) => date <= input.date)
      .sort()
      .at(-1) ?? null;
  return {
    norms: resource.norms,
    counts,
    lastUsage,
    ...usageSuggestion({ norms: resource.norms, counts, days: usageDays(dates, input.date) }),
  };
}

/** The forecast reads the Sheep and the Flocks once for all the Resources. */
export async function getStockForecast(
  ctx: FarmQueryContext,
  input: { date: CalendarDate },
): Promise<StockForecast[]> {
  authorize(ctx.member, "resource.view", { farmId: ctx.farm.id });
  if (!isCalendarDate(input.date)) throw new DomainError("resource.dateInvalid");
  const [resources, flocks, sheep] = await Promise.all([
    ctx.repos.resources.list(),
    ctx.repos.flocks.list(),
    ctx.repos.sheep.list(),
  ]);
  const sheepByFlock = new Map<FlockId, Sheep[]>();
  for (const item of sheep) {
    if (!isOnFarm(item) || item.flockId === null) continue;
    const items = sheepByFlock.get(item.flockId) ?? [];
    items.push(item);
    sheepByFlock.set(item.flockId, items);
  }
  const groups = flocks
    .filter((flock) => flock.archivedAt === null && sheepByFlock.has(flock.id))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .map((flock) => ({
      flock: { id: flock.id, name: flock.name, archived: false },
      counts: groupCounts(sheepByFlock.get(flock.id)!, ctx.farm.lambAgeMonths, input.date),
    }));
  return resources
    .filter((resource) => resource.archivedAt === null)
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .map((resource) => {
      const flocks = groups.map((group) => {
        const need = dailyNeed(resource.norms, group.counts);
        return { ...group, dailyNeed: need, days: daysOfStock(resource.stock, need) };
      });
      const need = flocks.reduce((sum, flock) => sum + flock.dailyNeed, 0);
      return {
        resourceId: resource.id,
        stock: resource.stock,
        dailyNeed: need,
        days: daysOfStock(resource.stock, need),
        flocks,
      };
    });
}

import type { CalendarDate } from "../dates";
import type { FarmId, FlockId, ResourceEventId, ResourceId } from "../ids";

// The feed of a Farm: the Resources (hay, grain…), their Stock, and the events that change it. A
// Restock adds a quantity, a Usage gives a quantity to a Flock, and an Adjustment corrects the Stock
// after a count. The Stock is the sum of the Restocks, minus the Usages, plus or minus the
// Adjustments (`stockOf`).

/**
 * A quantity is an integer of thousandths of the unit of its Resource: 1500 is 1,5 kg. A sum of
 * quantities is then exact, and a quantity can have at most three decimals.
 */
export const quantityScale = 1000;

/** The largest quantity of one event: 1 000 000 units. A sum of many events stays a safe integer. */
export const maxQuantity = 1_000_000 * quantityScale;

/** The longest name of a Resource. */
export const maxResourceNameLength = 60;
/** The longest unit of measure of a Resource, for example «кг», «тюк» or «мешок». */
export const maxUnitLength = 20;
/** The longest reason of an Adjustment. */
export const maxReasonLength = 200;

/** A material that the Farm keeps in stock and gives to Flocks, for example hay or grain. */
export interface Resource {
  id: ResourceId;
  farmId: FarmId;
  name: string;
  /** The one unit of measure of all the quantities of the Resource, as a Member wrote it. */
  unit: string;
  /**
   * The Stock now, in thousandths of the unit (`stockOf` of the events). Each command that
   * adds or cancels an event computes it again from all the events, so that a list of Resources reads
   * no events.
   */
  stock: number;
  /** When a Member archived the Resource, in milliseconds since the Unix epoch, or null. */
  archivedAt: number | null;
}

/** A Restock adds to the Stock, a Usage removes from it, and an Adjustment corrects it. */
export type ResourceEventKind = "restock" | "usage" | "adjustment";

export const resourceEventKinds = [
  "restock",
  "usage",
  "adjustment",
] as const satisfies readonly ResourceEventKind[];

/**
 * An event that changes the Stock of a Resource. A Restock can have a price: then it has an
 * Automatic Expense, which keeps the price (`findBySource` with the source `restock`).
 */
export interface ResourceEvent {
  id: ResourceEventId;
  resourceId: ResourceId;
  kind: ResourceEventKind;
  date: CalendarDate;
  /**
   * In thousandths of the unit. More than 0 for a Restock and a Usage. For an Adjustment, the
   * quantity that the count found (0 or more): the Stock at the end of its date.
   */
  quantity: number;
  /** The Flock that got the Resource: only for a Usage, which must have one. */
  flockId: FlockId | null;
  /** Why the Stock changed: only for an Adjustment, which must have one. */
  reason: string | null;
  /** When a Member recorded the event, in milliseconds since the Unix epoch. */
  createdAt: number;
}

/** One event in the order of the Stock, with its change of the Stock and the Stock after it. */
export interface StockStep<T> {
  event: T;
  /** Plus for a Restock, minus for a Usage; for an Adjustment, the difference that the count found. */
  change: number;
  stock: number;
}

type StockEvent = Pick<ResourceEvent, "kind" | "quantity" | "date" | "createdAt">;

/**
 * The events in the order of the Stock: by date; in one date, the Restocks and the Usages in the
 * order in which a Member recorded them, and then the Adjustments. A count gives the Stock at the end
 * of its date, so it comes after all the other events of that day.
 */
export function inEventOrder<T extends StockEvent>(events: readonly T[]): T[] {
  return events.toSorted((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const countA = a.kind === "adjustment" ? 1 : 0;
    const countB = b.kind === "adjustment" ? 1 : 0;
    return countA !== countB ? countA - countB : a.createdAt - b.createdAt;
  });
}

/**
 * The Stock step by step. A Restock adds its quantity, a Usage removes it, and an Adjustment makes
 * the Stock the counted quantity: its change is the difference from the Stock before it. Thus an
 * event that a Member records or cancels later, on a date before a count, does not change the Stock
 * after the count: the count already saw it.
 */
export function stockSteps<T extends StockEvent>(events: readonly T[]): StockStep<T>[] {
  let stock = 0;
  return inEventOrder(events).map((event) => {
    const change =
      event.kind === "restock"
        ? event.quantity
        : event.kind === "usage"
          ? -event.quantity
          : event.quantity - stock;
    stock += change;
    return { event, change, stock };
  });
}

/**
 * The Stock after the events: the sum of the Restocks, minus the Usages, plus or minus the
 * Adjustments, as `stockSteps` computes them. It can be less than 0, for example when a Member
 * records a Usage before the Restock.
 */
export function stockOf(events: readonly StockEvent[]): number {
  return stockSteps(events).at(-1)?.stock ?? 0;
}

/** The Stock at the end of the date: after all the events of that day and before it. */
export function stockOn(events: readonly StockEvent[], date: CalendarDate): number {
  return stockOf(events.filter((event) => event.date <= date));
}

/**
 * Reads the Resources of one Farm and their events. The backend binds it to the Farm (`FarmReaders`
 * in context.ts). Each method hides Deleted records (ADR 0005) and shows the Archived Resources.
 */
export interface FarmResourceReader {
  get(id: ResourceId): Promise<Resource | null>;
  /** The Resources of the Farm, in no order. */
  list(): Promise<Resource[]>;
  /** The Resources whose name has the same key (`nameKey`) as this name. */
  findByName(name: string): Promise<Resource[]>;
  /** The event, or null if there is none in this Farm or it is Deleted. */
  getEvent(id: ResourceEventId): Promise<ResourceEvent | null>;
  /** The events of the Resource, in no order. */
  events(resourceId: ResourceId): Promise<ResourceEvent[]>;
}

export type ResourceFields = Omit<Resource, "id" | "farmId">;

/** Reads and writes the Resources of one Farm and their events. Nothing erases a record. */
export interface FarmResourceRepository extends FarmResourceReader {
  insert(fields: ResourceFields): Promise<ResourceId>;
  /** Changes the fields that `fields` has. */
  update(id: ResourceId, fields: Partial<ResourceFields>): Promise<void>;
  insertEvent(event: Omit<ResourceEvent, "id">): Promise<ResourceEventId>;
  /** Makes the event Deleted, for one that a Member cancelled. */
  markEventDeleted(id: ResourceEventId, deletedAt: number): Promise<void>;
}

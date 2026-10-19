import type { CalendarDate } from "../dates";
import type { FarmId, FlockId, ResourceEventId, ResourceId } from "../ids";

// The feed of a Farm: the Resources (hay, grain…), their Stock, and the events that change it. A
// Restock adds a quantity, a Usage gives a quantity to a Flock, and an Adjustment corrects the Stock
// after a count. The Stock is the sum of the events (`stockOf`).

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
   * The Stock now, in thousandths of the unit: the sum of the events (`stockOf`). Each command that
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
   * In thousandths of the unit. More than 0 for a Restock and a Usage. For an Adjustment, the change
   * of the Stock: more than 0 if the count found more, less than 0 if it found less.
   */
  quantity: number;
  /** The Flock that got the Resource: only for a Usage, which must have one. */
  flockId: FlockId | null;
  /** Why the Stock changed: only for an Adjustment, which must have one. */
  reason: string | null;
  /** When a Member recorded the event, in milliseconds since the Unix epoch. */
  createdAt: number;
}

/** How much the event changes the Stock: plus for a Restock, minus for a Usage. */
export function stockChange(event: Pick<ResourceEvent, "kind" | "quantity">): number {
  return event.kind === "usage" ? -event.quantity : event.quantity;
}

/**
 * The Stock after the events: the sum of the Restocks, minus the Usages, plus or minus the
 * Adjustments. It can be less than 0, for example when a Member records a Usage before the Restock.
 */
export function stockOf(events: readonly Pick<ResourceEvent, "kind" | "quantity">[]): number {
  return events.reduce((stock, event) => stock + stockChange(event), 0);
}

/** The Stock at the end of the date: after all the events of that day and before it. */
export function stockOn(
  events: readonly Pick<ResourceEvent, "kind" | "quantity" | "date">[],
  date: CalendarDate,
): number {
  return stockOf(events.filter((event) => event.date <= date));
}

/**
 * The events in the order in which they happened: by date, then by the time when a Member recorded
 * them.
 */
export function inEventOrder<T extends Pick<ResourceEvent, "date" | "createdAt">>(
  events: readonly T[],
): T[] {
  return events.toSorted((a, b) =>
    a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1,
  );
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

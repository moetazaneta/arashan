import type { CalendarDate } from "../dates";
import type { DealId, FarmId, FlockId, SheepId } from "../ids";
import type { MoneySource } from "../money/money";

// The deals of a Farm: a Sale of Sheep and a Purchase of Sheep. A deal has a date, one total price and
// one or more Sheep. The price is the amount of its Automatic record (an Income of «Продажа баранов»
// or an Expense of «Покупка баранов»): the deal stores no copy, so the two never differ. A deal made by
// mistake is cancelled: it becomes Deleted with its Automatic record (ADR 0005), and the Trash can
// restore it.

/** A Sale (the Farm sold Sheep) or a Purchase (the Farm bought Sheep). */
export type DealKind = "sale" | "purchase";

export const dealKinds = ["sale", "purchase"] as const satisfies readonly DealKind[];

/** A Sale or a Purchase of one or more Sheep, for one total price. */
export interface Deal {
  id: DealId;
  farmId: FarmId;
  kind: DealKind;
  /** The day of the deal: the Farm got or paid all the money on it. */
  date: CalendarDate;
  /**
   * The Sheep of the deal, in the order of the form: the Sheep that a Sale made Sold, or the new
   * Sheep of a Purchase. They can have different Owners.
   */
  sheepIds: SheepId[];
  /** The Flock that the new Sheep of a Purchase went into, or null. A Sale has none. */
  flockId: FlockId | null;
  /** When a Member recorded the deal, in milliseconds since the Unix epoch. */
  createdAt: number;
}

/** The most Sheep in one Sale: the bulk action of the Sheep table. */
export const maxSheepPerSale = 500;
/** The most new Sheep in one Purchase: the rows of one form. */
export const maxSheepPerPurchase = 100;

/** The event of the Automatic record of the deal. */
export function dealSource(deal: Pick<Deal, "id" | "kind">): MoneySource {
  return { kind: deal.kind, id: deal.id };
}

/**
 * Reads the deals of one Farm. The backend binds it to the Farm (`FarmReaders` in context.ts). Each
 * method hides the Deleted deals: a cancelled deal is one.
 */
export interface FarmDealReader {
  get(id: DealId): Promise<Deal | null>;
  /** All deals of the Farm, in no order. */
  list(): Promise<Deal[]>;
}

export type DealFields = Omit<Deal, "id" | "farmId">;

/** Reads and writes the deals of one Farm. Nothing erases a deal. */
export interface FarmDealRepository extends FarmDealReader {
  insert(fields: DealFields): Promise<DealId>;
  /** Sets the Sheep of a Purchase, after the command made them. Nothing else of a deal changes. */
  setSheep(id: DealId, sheepIds: SheepId[]): Promise<void>;
  /** Makes the deal Deleted: a Member cancelled it. */
  markDeleted(id: DealId, deletedAt: number): Promise<void>;
}

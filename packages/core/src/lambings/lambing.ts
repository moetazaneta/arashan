import type { CalendarDate } from "../dates";
import type { FarmId, LambingId, MembershipId, SheepId } from "../ids";
import type { OwnerChange, Sheep } from "../sheep/sheep";

// The Lambing: the event when an Ewe gives birth to one or more Lambs. Each live Lamb becomes a
// Sheep of the Farm (Origin Born). A stillborn Lamb is only a number on the Lambing, not a Sheep.

/** One Lambing of an Ewe of the Farm. */
export interface Lambing {
  id: LambingId;
  farmId: FarmId;
  motherId: SheepId;
  /** The Father, also an External Sheep, or null if nobody knows him. */
  fatherId: SheepId | null;
  /** The birth date of all its Lambs. */
  date: CalendarDate;
  /** The live Lambs: the Sheep that the Lambing registered, in the order of the form. */
  lambIds: SheepId[];
  /** How many Lambs were born dead. They are not Sheep records. */
  stillborn: number;
  /** When a Member recorded the Lambing, in milliseconds since the Unix epoch. */
  recordedAt: number;
}

/** The most live Lambs of one Lambing. */
export const maxLambs = 8;
/** The most stillborn Lambs of one Lambing. */
export const maxStillborn = 8;

/**
 * The Owner of the Sheep at the end of the date, from the changes of its Owner (the oldest first):
 * the new Owner of the last change on or before the date, or else the Owner before the first change.
 * Null only for an External Sheep, which has no Owner.
 */
export function ownerAt(
  sheep: Pick<Sheep, "ownerId">,
  changes: readonly Pick<OwnerChange, "previousOwnerId" | "ownerId" | "date">[],
  date: CalendarDate,
): MembershipId | null {
  const last = changes.findLast((change) => change.date <= date);
  if (last !== undefined) return last.ownerId;
  return changes[0]?.previousOwnerId ?? sheep.ownerId;
}

/**
 * The date of the last Lambing of the Ewe, or null if she has none. A later event of the Mother, such
 * as a move, a change of the Owner or a change of the Status, is not dated before it: her Lambs got
 * her Owner and her Flock of that date, and she was Active then.
 */
export async function lastLambingDate(
  lambings: FarmLambingReader,
  motherId: SheepId,
): Promise<CalendarDate | null> {
  let last: CalendarDate | null = null;
  for (const lambing of await lambings.listOfMother(motherId)) {
    if (last === null || lambing.date > last) last = lambing.date;
  }
  return last;
}

/**
 * Reads the Lambings of one Farm. The backend binds it to the Farm (`FarmReaders` in context.ts).
 * Each method hides Deleted Lambings (ADR 0005).
 */
export interface FarmLambingReader {
  get(id: LambingId): Promise<Lambing | null>;
  /** The Lambings of the Mother, in the order in which Members recorded them. */
  listOfMother(motherId: SheepId): Promise<Lambing[]>;
}

export type LambingFields = Omit<Lambing, "id" | "farmId">;

/** Reads and writes the Lambings of one Farm. Nothing erases a Lambing. */
export interface FarmLambingRepository extends FarmLambingReader {
  insert(fields: LambingFields): Promise<LambingId>;
}

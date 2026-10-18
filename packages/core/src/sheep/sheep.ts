import { addMonths, type CalendarDate } from "../dates";
import type { FarmSettings } from "../farms/farm";
import type { FlockMove } from "../flocks/flock";
import type {
  FarmId,
  FlockId,
  FlockMoveId,
  MembershipId,
  OwnerChangeId,
  SheepId,
  StatusChangeId,
} from "../ids";

/** The sex of a Sheep: a Ram or an Ewe. */
export const sexes = ["ram", "ewe"] as const;
export type Sex = (typeof sexes)[number];

/**
 * How the Farm knows a Sheep: Born on the Farm, Bought, or External (a parent that was never on the
 * Farm, with the pedigree slice).
 */
export const origins = ["born", "bought", "external"] as const;
export type Origin = (typeof origins)[number];

/** The state of a Sheep in its life on the Farm. Only an Active Sheep is on the Farm now. */
export const sheepStatuses = ["active", "sold", "slaughtered", "dead", "lost"] as const;
export type SheepStatus = (typeof sheepStatuses)[number];

/**
 * The Statuses that a Member gives to an Active Sheep when it leaves the Farm without a Sale.
 * Slaughtered and Dead are final; a Lost Sheep can come back (it was found). Sold comes with a Sale.
 */
export const exitStatuses = ["slaughtered", "dead", "lost"] as const;
export type ExitStatus = (typeof exitStatuses)[number];

/** The weight of a Sheep in kilograms, and the date of the weighing. */
export interface Weighing {
  kg: number;
  date: CalendarDate;
}

/** One animal of the Farm. */
export interface Sheep {
  id: SheepId;
  farmId: FarmId;
  /** The number on the ear tag, or null if the Sheep has no Tag. */
  tag: string | null;
  name: string | null;
  sex: Sex;
  /** Null if nobody knows it, for example for an Initial entry. */
  birthDate: CalendarDate | null;
  origin: Origin;
  /** True if a Member registered the Sheep as an Initial entry: it was on the Farm before the app. */
  initialEntry: boolean;
  status: SheepStatus;
  /** The Member to whom the Sheep belongs. Null only for an External Sheep, which has no Owner. */
  ownerId: MembershipId | null;
  notes: string | null;
  /** The last weighing, or null. */
  weight: Weighing | null;
  /**
   * The Flock that the Sheep is in now, or null. Only an Active Sheep is in a Flock. A move changes
   * it and records the move (`FlockMove`), the history of the Flock membership.
   */
  flockId: FlockId | null;
  /** When a Member registered the Sheep, in milliseconds since the Unix epoch. */
  registeredAt: number;
}

/** A change of the Owner of a Sheep, on a date. */
export interface OwnerChange {
  id: OwnerChangeId;
  sheepId: SheepId;
  previousOwnerId: MembershipId;
  ownerId: MembershipId;
  /** The date when the new Owner got the Sheep. */
  date: CalendarDate;
  /** When a Member recorded the change, in milliseconds since the Unix epoch. */
  at: number;
}

/**
 * A change of the Status of a Sheep, on a date: the Sheep stopped being Active, or a Lost Sheep came
 * back. The changes of a Sheep are the history of its Status. A wrong change is undone: it becomes
 * Deleted, and the Sheep gets its Status from before.
 */
export interface StatusChange {
  id: StatusChangeId;
  sheepId: SheepId;
  /** The Status before the change. */
  from: SheepStatus;
  /** The Status after the change. */
  to: SheepStatus;
  /** The date when it happened, for example the day when the Sheep died. */
  date: CalendarDate;
  /** Why, in the words of the Member, or null. */
  reason: string | null;
  /**
   * The move out of all Flocks that the change made: a Sheep that stops being Active leaves its
   * Flock on that date. Null if the Sheep was in no Flock, and for a Lost Sheep that came back.
   */
  flockMoveId: FlockMoveId | null;
  /** When a Member recorded the change, in milliseconds since the Unix epoch. */
  at: number;
}

/** The longest Tag, name and notes. */
export const maxTagLength = 30;
export const maxSheepNameLength = 60;
export const maxSheepNotesLength = 2000;
/** The longest reason of a change of the Status. */
export const maxStatusReasonLength = 500;
/** The heaviest weight in kilograms that the app accepts. */
export const maxWeightKg = 300;

// The Cyrillic letters that look like Latin ones. On a Russian keyboard, a Member can type «А12» for
// the Tag "A12", so both give the same key.
const latinLookalikes: Record<string, string> = {
  а: "a",
  в: "b",
  е: "e",
  к: "k",
  м: "m",
  н: "h",
  о: "o",
  р: "p",
  с: "c",
  т: "t",
  у: "y",
  х: "x",
};

/**
 * The key that compares two Tags: the case, the spaces at the ends, and the Cyrillic letters that
 * look like Latin ones do not count, and the spaces inside count as one. Thus "A-12", «а-12 » and
 * "a-12" are the same Tag.
 */
export function tagKey(tag: string): string {
  return tag
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("ru")
    .replace(/[авекмнорстух]/g, (letter) => latinLookalikes[letter] ?? letter);
}

/**
 * True if the Sheep is a Lamb on the date: it is younger than the lamb age of the Farm. A Sheep
 * without a birth date is an adult.
 */
export function isLamb(
  birthDate: CalendarDate | null,
  lambAgeMonths: number,
  today: CalendarDate,
): boolean {
  if (birthDate === null) return false;
  return today < addMonths(birthDate, lambAgeMonths);
}

/**
 * The Sheep with the flag `lamb` on the date, which is today in the time zone of the Farm
 * (`dateAt`). A query of the backend does not compute it, because the result of a query stays the
 * same until its data changes, and a Lamb grows up without a change of data. The client computes it
 * when it shows the Sheep, and again when the day changes.
 */
export function withLamb<Item extends { birthDate: CalendarDate | null }>(
  items: readonly Item[],
  farm: Pick<FarmSettings, "lambAgeMonths">,
  today: CalendarDate,
): (Item & { lamb: boolean })[] {
  return items.map((item) => ({
    ...item,
    lamb: isLamb(item.birthDate, farm.lambAgeMonths, today),
  }));
}

/**
 * Reads the Sheep of one Farm. The backend binds it to the Farm (`FarmReaders` in context.ts), so it
 * never gives a Sheep of another Farm. Each method hides Deleted Sheep (ADR 0005).
 */
export interface FarmSheepReader {
  /** The Sheep, or null if there is none in this Farm or it is Deleted. */
  get(id: SheepId): Promise<Sheep | null>;
  /** All Sheep of the Farm, also the External ones and the ones that are not Active. */
  list(): Promise<Sheep[]>;
  /**
   * The Sheep whose Tag has the same key (`tagKey`) as this Tag. An External Sheep is not in the
   * answer: its Tag never makes a Tag of the Farm taken.
   */
  findByTag(tag: string): Promise<Sheep[]>;
  /** The changes of the Owner of the Sheep, the oldest first. */
  ownerChanges(sheepId: SheepId): Promise<OwnerChange[]>;
  /** True if the Member is the Owner of at least one Active Sheep of the Farm. */
  ownsActiveSheep(ownerId: MembershipId): Promise<boolean>;
  /** The Sheep that are in the Flock now. */
  listInFlock(flockId: FlockId): Promise<Sheep[]>;
  /** The moves of the Sheep between Flocks, in the order in which a Member recorded them. */
  flockMoves(sheepId: SheepId): Promise<FlockMove[]>;
  /** The changes of the Status of the Sheep, in the order in which a Member recorded them. */
  statusChanges(sheepId: SheepId): Promise<StatusChange[]>;
}

/** The fields of a Sheep that a command writes. */
export type SheepFields = Omit<Sheep, "id" | "farmId">;

/** Reads and writes the Sheep of one Farm. Nothing erases a Sheep. */
export interface FarmSheepRepository extends FarmSheepReader {
  insert(sheep: SheepFields): Promise<SheepId>;
  /** Changes the fields that `fields` has. A field that it does not have stays the same. */
  update(id: SheepId, fields: Partial<SheepFields>): Promise<void>;
  insertOwnerChange(change: Omit<OwnerChange, "id">): Promise<OwnerChangeId>;
  insertFlockMove(move: Omit<FlockMove, "id">): Promise<FlockMoveId>;
  /** Makes a move Deleted: a Member undid it. */
  markFlockMoveDeleted(id: FlockMoveId, deletedAt: number): Promise<void>;
  insertStatusChange(change: Omit<StatusChange, "id">): Promise<StatusChangeId>;
  /** Makes a change of the Status Deleted: a Member undid it. */
  markStatusChangeDeleted(id: StatusChangeId, deletedAt: number): Promise<void>;
  /** Makes the Sheep Deleted. A Member can restore it later. */
  markDeleted(id: SheepId, deletedAt: number): Promise<void>;
}

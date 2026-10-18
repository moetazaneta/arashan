import type { CalendarDate } from "../dates";
import type {
  FarmId,
  FlockId,
  FlockMoveId,
  LocationId,
  SheepId,
  ShepherdAssignmentId,
  ShepherdId,
} from "../ids";

// The Flocks of a Farm, their Locations and their Shepherds, and the moves of Sheep between Flocks.
// The dates of a move and of an assignment are never in the future, so the current state never
// depends on the day: the current Flock of a Sheep is `Sheep.flockId`, and the current Shepherds of
// a Flock are its open assignments. Only an Active Sheep is in a Flock: a Sheep with a `flockId` is
// Active. A Location has no history: a Flock has only its Location of now.

/** A place where a Flock stays, for example a pasture, a sheepfold (кошара) or a yard. */
export interface Location {
  id: LocationId;
  farmId: FarmId;
  name: string;
  notes: string | null;
  /** When a Member archived the Location, in milliseconds since the Unix epoch, or null. */
  archivedAt: number | null;
}

/** A hired person who herds one or more Flocks. A Shepherd is not a User and cannot log in. */
export interface Shepherd {
  id: ShepherdId;
  farmId: FarmId;
  name: string;
  phone: string | null;
  notes: string | null;
  /** When a Member archived the Shepherd, for example when the Shepherd left, or null. */
  archivedAt: number | null;
}

/** A group of Sheep with its Shepherds and its Location. Both are optional. */
export interface Flock {
  id: FlockId;
  farmId: FarmId;
  name: string;
  /** Where the Flock stays now, or null. */
  locationId: LocationId | null;
  /** When a Member archived the Flock, or null. An Archived Flock has no Sheep. */
  archivedAt: number | null;
}

/**
 * A Shepherd herds a Flock from a date to a date, both days included. An open assignment (`to` is
 * null) goes on now. A Shepherd can herd more than one Flock at one time.
 */
export interface ShepherdAssignment {
  id: ShepherdAssignmentId;
  flockId: FlockId;
  shepherdId: ShepherdId;
  from: CalendarDate;
  to: CalendarDate | null;
}

/**
 * A Sheep goes into a Flock, or out of all Flocks (`flockId` is null), on a date. The moves of a
 * Sheep are the history of its Flock membership.
 */
export interface FlockMove {
  id: FlockMoveId;
  sheepId: SheepId;
  flockId: FlockId | null;
  date: CalendarDate;
  /** When a Member recorded the move, in milliseconds since the Unix epoch. */
  at: number;
}

/** The longest name of a Flock, a Location or a Shepherd. */
export const maxNameLength = 60;
/** The longest phone number of a Shepherd: a text, in any format. */
export const maxPhoneLength = 30;
/** The longest notes of a Location or a Shepherd. */
export const maxNotesLength = 2000;

/**
 * The key that compares two names of Flocks or Locations: the case, the spaces at the ends and the
 * letter «ё» (as «е») do not count, and the spaces inside count as one.
 */
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru").replaceAll("ё", "е");
}

/** One stay of a Sheep in a Flock: from the date of the move into it to the date of the next move. */
export interface FlockStay {
  flockId: FlockId;
  from: CalendarDate;
  /** The day when the Sheep left the Flock (it was still in it that day), or null if it is there now. */
  to: CalendarDate | null;
}

/**
 * The moves in the order in which they happened: by date, then by the time when a Member recorded
 * them. The sort is stable, so two moves of one command keep the order of the repository.
 */
function inOrder(moves: readonly FlockMove[]): FlockMove[] {
  return moves.toSorted((a, b) => (a.date === b.date ? a.at - b.at : a.date < b.date ? -1 : 1));
}

/** The stays of a Sheep in Flocks, from its moves, the oldest first. */
export function flockStays(moves: readonly FlockMove[]): FlockStay[] {
  const stays: FlockStay[] = [];
  for (const move of inOrder(moves)) {
    // The stay that goes on before this move, if the Sheep was in a Flock.
    const last = stays.at(-1);
    const current = last?.to === null ? last : undefined;
    if ((current?.flockId ?? null) === move.flockId) continue;
    if (current !== undefined) current.to = move.date;
    if (move.flockId !== null) stays.push({ flockId: move.flockId, from: move.date, to: null });
  }
  return stays;
}

/**
 * The Flock that had the Sheep at the end of the date, or null: after all its moves of that day. For
 * example, the Flock of a Mother on the date of a Lambing, or the head count of a Flock on a date.
 */
export function flockAt(moves: readonly FlockMove[], date: CalendarDate): FlockId | null {
  return inOrder(moves).findLast((move) => move.date <= date)?.flockId ?? null;
}

/**
 * The Flocks that had the Sheep at some time of the date, for the question «who was responsible». On
 * the day of a move the Sheep was in both Flocks: in the old one at the start of the day and in the
 * new one at the end. Thus a Sheep that left all Flocks on a date, for example because it died, was
 * still in its Flock that day.
 */
export function flocksOn(moves: readonly FlockMove[], date: CalendarDate): FlockId[] {
  const flocks = flockStays(moves)
    .filter((stay) => stay.from <= date && (stay.to === null || date <= stay.to))
    .map((stay) => stay.flockId);
  return [...new Set(flocks)];
}

/** True if the assignment covers the date: the days `from` and `to` count. */
export function assignedOn(assignment: ShepherdAssignment, date: CalendarDate): boolean {
  return assignment.from <= date && (assignment.to === null || date <= assignment.to);
}

/** True if two periods of days have at least one day in common. */
export function periodsOverlap(
  a: { from: CalendarDate; to: CalendarDate | null },
  b: { from: CalendarDate; to: CalendarDate | null },
): boolean {
  return (a.to === null || b.from <= a.to) && (b.to === null || a.from <= b.to);
}

/**
 * Reads the Locations of one Farm. The backend binds it to the Farm (`FarmReaders` in context.ts).
 * Each method hides Deleted Locations (ADR 0005) and shows the Archived ones.
 */
export interface FarmLocationReader {
  get(id: LocationId): Promise<Location | null>;
  list(): Promise<Location[]>;
  /** The Locations whose name has the same key (`nameKey`) as this name. */
  findByName(name: string): Promise<Location[]>;
}

export type LocationFields = Omit<Location, "id" | "farmId">;

/** Reads and writes the Locations of one Farm. Nothing erases a Location. */
export interface FarmLocationRepository extends FarmLocationReader {
  insert(fields: LocationFields): Promise<LocationId>;
  /** Changes the fields that `fields` has. */
  update(id: LocationId, fields: Partial<LocationFields>): Promise<void>;
}

/** Reads the Shepherds of one Farm, as `FarmLocationReader` reads the Locations. */
export interface FarmShepherdReader {
  get(id: ShepherdId): Promise<Shepherd | null>;
  list(): Promise<Shepherd[]>;
}

export type ShepherdFields = Omit<Shepherd, "id" | "farmId">;

/** Reads and writes the Shepherds of one Farm. Nothing erases a Shepherd. */
export interface FarmShepherdRepository extends FarmShepherdReader {
  insert(fields: ShepherdFields): Promise<ShepherdId>;
  update(id: ShepherdId, fields: Partial<ShepherdFields>): Promise<void>;
}

/**
 * Reads the Flocks of one Farm and the assignments of their Shepherds, as `FarmLocationReader` reads
 * the Locations. Each method hides Deleted assignments.
 */
export interface FarmFlockReader {
  get(id: FlockId): Promise<Flock | null>;
  list(): Promise<Flock[]>;
  /** The Flocks whose name has the same key (`nameKey`) as this name. */
  findByName(name: string): Promise<Flock[]>;
  /** The assignment, or null if there is none in this Farm or it is Deleted. */
  getAssignment(id: ShepherdAssignmentId): Promise<ShepherdAssignment | null>;
  /** All assignments of the Farm, the oldest first. */
  listAssignments(): Promise<ShepherdAssignment[]>;
  /** The assignments of the Flock, the oldest first. */
  assignmentsOfFlock(flockId: FlockId): Promise<ShepherdAssignment[]>;
  /** The assignments of the Shepherd, the oldest first. */
  assignmentsOfShepherd(shepherdId: ShepherdId): Promise<ShepherdAssignment[]>;
}

export type FlockFields = Omit<Flock, "id" | "farmId">;

/** Reads and writes the Flocks of one Farm and their assignments. Nothing erases a Flock. */
export interface FarmFlockRepository extends FarmFlockReader {
  insert(fields: FlockFields): Promise<FlockId>;
  update(id: FlockId, fields: Partial<FlockFields>): Promise<void>;
  insertAssignment(assignment: Omit<ShepherdAssignment, "id">): Promise<ShepherdAssignmentId>;
  updateAssignment(
    id: ShepherdAssignmentId,
    dates: Pick<ShepherdAssignment, "from" | "to">,
  ): Promise<void>;
  /** Makes the assignment Deleted, for one that a Member made by mistake. */
  markAssignmentDeleted(id: ShepherdAssignmentId, deletedAt: number): Promise<void>;
}

import { authorize } from "../access/permissions";
import type { FarmQueryContext } from "../context";
import { type CalendarDate, isCalendarDate } from "../dates";
import { DomainError } from "../errors";
import type { FlockId, LocationId, SheepId, ShepherdAssignmentId, ShepherdId } from "../ids";
import type { Sex, Sheep } from "../sheep/sheep";
import {
  assignedOn,
  type Flock,
  flocksOn,
  flockStays,
  type Location,
  periodsOverlap,
  type Shepherd,
  type ShepherdAssignment,
} from "./flock";

// The queries of Flocks, Locations and Shepherds, and the Flock history of a Sheep. Each list shows
// the Archived records too, with the flag `archived`: the history shows them, and a form leaves them
// out.

/** A Flock as another record shows it. */
export interface FlockRef {
  id: FlockId;
  name: string;
  archived: boolean;
}

/** A Location as another record shows it. */
export interface LocationRef {
  id: LocationId;
  name: string;
  archived: boolean;
}

/** A Shepherd as another record shows it. */
export interface ShepherdRef {
  id: ShepherdId;
  name: string;
  archived: boolean;
}

/** A Location as its list shows it, with the Flocks that stay there now. */
export interface LocationRow extends LocationRef {
  notes: string | null;
  /** The Flocks that are not Archived and have this Location. */
  flocks: FlockRef[];
}

/** A Shepherd as its list shows it, with the Flocks that the Shepherd herds now. */
export interface ShepherdRow extends ShepherdRef {
  phone: string | null;
  notes: string | null;
  /** The Flocks of the Shepherd's open assignments. */
  flocks: FlockRef[];
}

/** A Flock as its list shows it. */
export interface FlockRow extends FlockRef {
  location: LocationRef | null;
  /** The Shepherds of the open assignments of the Flock. */
  shepherds: ShepherdRef[];
  /** How many Sheep are in the Flock now. */
  sheepCount: number;
}

/** One assignment of a Shepherd to a Flock. */
export interface AssignmentRow {
  id: ShepherdAssignmentId;
  shepherd: ShepherdRef;
  from: CalendarDate;
  /** The last day, or null if the assignment goes on now. */
  to: CalendarDate | null;
}

/** A Sheep of a Flock, as the card of the Flock lists it. */
export interface FlockSheep {
  id: SheepId;
  tag: string | null;
  name: string | null;
  sex: Sex;
  birthDate: CalendarDate | null;
}

/** A Flock as its card shows it: its assignments, the newest first, and its Sheep, by Tag. */
export interface FlockCard extends FlockRow {
  assignments: AssignmentRow[];
  sheep: FlockSheep[];
}

/** One stay of a Sheep in a Flock: both days count. */
export interface SheepFlockStay {
  flock: FlockRef;
  from: CalendarDate;
  /** The day when the Sheep left the Flock, or null if it is there now. */
  to: CalendarDate | null;
  /** The Shepherds who herded the Flock at some time of the stay. */
  shepherds: ShepherdRef[];
}

/** A Flock that had the Sheep on a date, and the Shepherds of the Flock on that date. */
export interface ResponsibleFlock {
  flock: FlockRef;
  shepherds: ShepherdRef[];
}

/** The Locations of the Farm, by name. */
export async function listLocations(ctx: FarmQueryContext): Promise<LocationRow[]> {
  authorize(ctx.member, "flock.view", { farmId: ctx.farm.id });
  const [locations, flocks] = await Promise.all([
    ctx.repos.locations.list(),
    ctx.repos.flocks.list(),
  ]);
  return locations
    .map((location) => ({
      ...locationRef(location),
      notes: location.notes,
      flocks: flocks
        .filter((flock) => flock.archivedAt === null && flock.locationId === location.id)
        .map(flockRef)
        .sort(byName),
    }))
    .sort(byName);
}

/** The Shepherds of the Farm, by name. */
export async function listShepherds(ctx: FarmQueryContext): Promise<ShepherdRow[]> {
  authorize(ctx.member, "flock.view", { farmId: ctx.farm.id });
  const [shepherds, flocks, assignments] = await Promise.all([
    ctx.repos.shepherds.list(),
    flocksById(ctx),
    ctx.repos.flocks.listAssignments(),
  ]);
  return shepherds
    .map((shepherd) => ({
      ...shepherdRef(shepherd),
      phone: shepherd.phone,
      notes: shepherd.notes,
      flocks: refsOf(
        assignments.filter((a) => a.shepherdId === shepherd.id && a.to === null),
        (a) => flocks.get(a.flockId),
        flockRef,
      ),
    }))
    .sort(byName);
}

/** The Flocks of the Farm, by name, with their Location, Shepherds and head count. */
export async function listFlocks(ctx: FarmQueryContext): Promise<FlockRow[]> {
  authorize(ctx.member, "flock.view", { farmId: ctx.farm.id });
  const [flocks, locations, shepherds, assignments, sheep] = await Promise.all([
    ctx.repos.flocks.list(),
    locationsById(ctx),
    shepherdsById(ctx),
    ctx.repos.flocks.listAssignments(),
    ctx.repos.sheep.list(),
  ]);
  return flocks
    .map((flock) => toFlockRow(flock, { locations, shepherds, assignments, sheep }))
    .sort(byName);
}

/** The card of a Flock, or null if the Farm has no such Flock. */
export async function getFlock(
  ctx: FarmQueryContext,
  input: { flockId: FlockId },
): Promise<FlockCard | null> {
  authorize(ctx.member, "flock.view", { farmId: ctx.farm.id });
  const flock = await ctx.repos.flocks.get(input.flockId);
  if (flock === null) return null;
  const [locations, shepherds, assignments, sheep] = await Promise.all([
    locationsById(ctx),
    shepherdsById(ctx),
    ctx.repos.flocks.assignmentsOfFlock(flock.id),
    ctx.repos.sheep.listInFlock(flock.id),
  ]);
  return {
    ...toFlockRow(flock, { locations, shepherds, assignments, sheep }),
    assignments: assignments
      .map((assignment) => ({
        id: assignment.id,
        shepherd: shepherdRefOf(shepherds, assignment.shepherdId),
        from: assignment.from,
        to: assignment.to,
      }))
      .sort((a, b) => (a.from === b.from ? 0 : a.from < b.from ? 1 : -1)),
    sheep: sheep
      .map(({ id, tag, name, sex, birthDate }) => ({ id, tag, name, sex, birthDate }))
      .sort(byTag),
  };
}

/**
 * The stays of a Sheep in Flocks, the history of its Flock membership, the newest first: for the card
 * of the Sheep. Each stay has the Shepherds who herded the Flock at some time of the stay. The query
 * of the card checks the permission.
 */
export async function sheepFlockStays(
  ctx: FarmQueryContext,
  sheepId: SheepId,
): Promise<SheepFlockStay[]> {
  const [moves, flocks, shepherds, assignments] = await Promise.all([
    ctx.repos.sheep.flockMoves(sheepId),
    flocksById(ctx),
    shepherdsById(ctx),
    ctx.repos.flocks.listAssignments(),
  ]);
  return flockStays(moves)
    .map((stay) => ({
      flock: flockRefOf(flocks, stay.flockId),
      from: stay.from,
      to: stay.to,
      shepherds: refsOf(
        assignments.filter((a) => a.flockId === stay.flockId && periodsOverlap(a, stay)),
        (a) => shepherds.get(a.shepherdId),
        shepherdRef,
      ),
    }))
    .reverse();
}

/**
 * Who was responsible for the Sheep on the date: the Flock that had it and the Shepherds of that
 * Flock on that date. Usually one Flock, or none if the Sheep was in no Flock. On the day of a move
 * there are two: the Flock that the Sheep left and the Flock that it went into.
 */
export async function getSheepResponsible(
  ctx: FarmQueryContext,
  input: { sheepId: SheepId; date: CalendarDate },
): Promise<ResponsibleFlock[]> {
  authorize(ctx.member, "flock.view", { farmId: ctx.farm.id });
  if (!isCalendarDate(input.date)) throw new DomainError("sheep.dateInvalid");
  const sheep = await requireSheep(ctx, input.sheepId);
  const [moves, flocks, shepherds] = await Promise.all([
    ctx.repos.sheep.flockMoves(sheep.id),
    flocksById(ctx),
    shepherdsById(ctx),
  ]);
  const responsible: ResponsibleFlock[] = [];
  for (const flockId of flocksOn(moves, input.date)) {
    const assignments = await ctx.repos.flocks.assignmentsOfFlock(flockId);
    responsible.push({
      flock: flockRefOf(flocks, flockId),
      shepherds: refsOf(
        assignments.filter((assignment) => assignedOn(assignment, input.date)),
        (assignment) => shepherds.get(assignment.shepherdId),
        shepherdRef,
      ),
    });
  }
  return responsible;
}

/** The Flock of each Sheep for the table: the Flocks of the Farm by id, also the Archived ones. */
export async function flocksById(
  ctx: Pick<FarmQueryContext, "repos">,
): Promise<Map<FlockId, Flock>> {
  return new Map((await ctx.repos.flocks.list()).map((flock) => [flock.id, flock]));
}

/** The Flock with the id, as another record shows it. */
export function flockRefOf(flocks: Map<FlockId, Flock>, id: FlockId): FlockRef {
  const flock = flocks.get(id);
  return flock === undefined ? { id, name: "", archived: false } : flockRef(flock);
}

/** The Sheep of the Farm, or `sheep.notFound`. A Deleted Sheep and an External Sheep are not found. */
async function requireSheep(ctx: FarmQueryContext, id: SheepId): Promise<Sheep> {
  const sheep = await ctx.repos.sheep.get(id);
  if (sheep === null || sheep.origin === "external") throw new DomainError("sheep.notFound");
  return sheep;
}

async function locationsById(ctx: FarmQueryContext): Promise<Map<LocationId, Location>> {
  return new Map((await ctx.repos.locations.list()).map((location) => [location.id, location]));
}

async function shepherdsById(ctx: FarmQueryContext): Promise<Map<ShepherdId, Shepherd>> {
  return new Map((await ctx.repos.shepherds.list()).map((shepherd) => [shepherd.id, shepherd]));
}

function toFlockRow(
  flock: Flock,
  data: {
    locations: Map<LocationId, Location>;
    shepherds: Map<ShepherdId, Shepherd>;
    assignments: readonly ShepherdAssignment[];
    sheep: readonly Sheep[];
  },
): FlockRow {
  const location = flock.locationId === null ? undefined : data.locations.get(flock.locationId);
  return {
    ...flockRef(flock),
    location: location === undefined ? null : locationRef(location),
    shepherds: refsOf(
      data.assignments.filter((a) => a.flockId === flock.id && a.to === null),
      (a) => data.shepherds.get(a.shepherdId),
      shepherdRef,
    ),
    sheepCount: data.sheep.filter((sheep) => sheep.flockId === flock.id).length,
  };
}

function flockRef(flock: Flock): FlockRef {
  return { id: flock.id, name: flock.name, archived: flock.archivedAt !== null };
}

function locationRef(location: Location): LocationRef {
  return { id: location.id, name: location.name, archived: location.archivedAt !== null };
}

function shepherdRef(shepherd: Shepherd): ShepherdRef {
  return { id: shepherd.id, name: shepherd.name, archived: shepherd.archivedAt !== null };
}

function shepherdRefOf(shepherds: Map<ShepherdId, Shepherd>, id: ShepherdId): ShepherdRef {
  const shepherd = shepherds.get(id);
  return shepherd === undefined ? { id, name: "", archived: false } : shepherdRef(shepherd);
}

/** The refs of the records of the items, each one time, by name. */
function refsOf<Item, Record extends { id: string }, Ref extends { name: string }>(
  items: readonly Item[],
  recordOf: (item: Item) => Record | undefined,
  refOf: (record: Record) => Ref,
): Ref[] {
  const records = new Map<string, Record>();
  for (const item of items) {
    const record = recordOf(item);
    if (record !== undefined) records.set(record.id, record);
  }
  return [...records.values()].map(refOf).sort(byName);
}

const collator = new Intl.Collator("ru", { numeric: true });

function byName(a: { name: string }, b: { name: string }): number {
  return collator.compare(a.name, b.name);
}

/** By Tag in the natural order, the Sheep without a Tag last; then by name. */
function byTag(a: FlockSheep, b: FlockSheep): number {
  if (a.tag !== b.tag) {
    if (a.tag === null) return 1;
    if (b.tag === null) return -1;
    const byTagText = collator.compare(a.tag, b.tag);
    if (byTagText !== 0) return byTagText;
  }
  return collator.compare(a.name ?? "", b.name ?? "");
}

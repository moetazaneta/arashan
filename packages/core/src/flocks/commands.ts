import { authorize } from "../access/permissions";
import { type CommandName, recordFarmAudit, type TargetKind } from "../audit/audit";
import type { FarmCommandContext } from "../context";
import { type CalendarDate, dateAt, isCalendarDate } from "../dates";
import { DomainError, type ErrorCode } from "../errors";
import type { FlockId, LocationId, SheepId, ShepherdAssignmentId, ShepherdId } from "../ids";
import type { Sheep } from "../sheep/sheep";
import {
  type Flock,
  type Location,
  maxNameLength,
  maxNotesLength,
  maxPhoneLength,
  periodsOverlap,
  type Shepherd,
  type ShepherdAssignment,
} from "./flock";

// The commands of Flocks, Locations and Shepherds, and the moves of Sheep between Flocks. Each one
// checks the permission first and appends one audit entry for each record that it changes. A command
// that changes nothing writes nothing.

/** The most Sheep that one move can take: a bulk move of the Sheep table. */
export const maxSheepPerMove = 500;

// Locations.

/** The fields of a Location that a Member enters. An empty text is no value. */
export interface LocationInput {
  name: string;
  notes: string | null;
}

/** A Member makes a Location. Its name is unique in the Farm. */
export async function createLocation(
  ctx: FarmCommandContext,
  input: LocationInput,
): Promise<LocationId> {
  authorize(ctx.member, "location.create", { farmId: ctx.farm.id });
  const fields = validLocation(input);
  await requireFreeLocationName(ctx, fields.name, null);
  const locationId = await ctx.repos.locations.insert({ ...fields, archivedAt: null });
  await audit(ctx, "location.create", "Location", locationId);
  return locationId;
}

/** A Member changes the name or the notes of a Location. */
export async function updateLocation(
  ctx: FarmCommandContext,
  input: LocationInput & { locationId: LocationId },
): Promise<void> {
  authorize(ctx.member, "location.update", { farmId: ctx.farm.id });
  const location = await requireLocation(ctx, input.locationId);
  const fields = validLocation(input);
  await requireFreeLocationName(ctx, fields.name, location.id);
  if (location.name === fields.name && location.notes === fields.notes) return;
  await ctx.repos.locations.update(location.id, fields);
  await audit(ctx, "location.update", "Location", location.id);
}

/**
 * A Member archives a Location that the Farm does not use now. A Flock that is not Archived must
 * first go to another Location (`location.inUse`).
 */
export async function archiveLocation(
  ctx: FarmCommandContext,
  input: { locationId: LocationId },
): Promise<void> {
  authorize(ctx.member, "location.archive", { farmId: ctx.farm.id });
  const location = await requireLocation(ctx, input.locationId);
  if (location.archivedAt !== null) return;
  const flocks = await ctx.repos.flocks.list();
  if (flocks.some((flock) => flock.archivedAt === null && flock.locationId === location.id)) {
    throw new DomainError("location.inUse");
  }
  await ctx.repos.locations.update(location.id, { archivedAt: ctx.now() });
  await audit(ctx, "location.archive", "Location", location.id);
}

/** A Member takes a Location out of the archive: the forms show it again. */
export async function unarchiveLocation(
  ctx: FarmCommandContext,
  input: { locationId: LocationId },
): Promise<void> {
  authorize(ctx.member, "location.archive", { farmId: ctx.farm.id });
  const location = await requireLocation(ctx, input.locationId);
  if (location.archivedAt === null) return;
  await ctx.repos.locations.update(location.id, { archivedAt: null });
  await audit(ctx, "location.unarchive", "Location", location.id);
}

// Shepherds.

/** The fields of a Shepherd that a Member enters. An empty text is no value. */
export interface ShepherdInput {
  name: string;
  phone: string | null;
  notes: string | null;
}

/** A Member adds a Shepherd. Two Shepherds can have the same name. */
export async function createShepherd(
  ctx: FarmCommandContext,
  input: ShepherdInput,
): Promise<ShepherdId> {
  authorize(ctx.member, "shepherd.create", { farmId: ctx.farm.id });
  const shepherdId = await ctx.repos.shepherds.insert({
    ...validShepherd(input),
    archivedAt: null,
  });
  await audit(ctx, "shepherd.create", "Shepherd", shepherdId);
  return shepherdId;
}

/** A Member changes the name, the phone or the notes of a Shepherd. */
export async function updateShepherd(
  ctx: FarmCommandContext,
  input: ShepherdInput & { shepherdId: ShepherdId },
): Promise<void> {
  authorize(ctx.member, "shepherd.update", { farmId: ctx.farm.id });
  const shepherd = await requireShepherd(ctx, input.shepherdId);
  const fields = validShepherd(input);
  if (
    shepherd.name === fields.name &&
    shepherd.phone === fields.phone &&
    shepherd.notes === fields.notes
  ) {
    return;
  }
  await ctx.repos.shepherds.update(shepherd.id, fields);
  await audit(ctx, "shepherd.update", "Shepherd", shepherd.id);
}

/**
 * A Member archives a Shepherd, for example one who left. The Shepherd's open assignments end on the
 * date: the last day when the Shepherd herded the Flocks. The date is not in the future, and not
 * before the start of an open assignment (`flock.endDateInvalid`).
 */
export async function archiveShepherd(
  ctx: FarmCommandContext,
  input: { shepherdId: ShepherdId; date: CalendarDate },
): Promise<void> {
  authorize(ctx.member, "shepherd.archive", { farmId: ctx.farm.id });
  const shepherd = await requireShepherd(ctx, input.shepherdId);
  if (shepherd.archivedAt !== null) return;
  const ended = await endOpenAssignments(
    ctx,
    await ctx.repos.flocks.assignmentsOfShepherd(shepherd.id),
    input.date,
  );
  await ctx.repos.shepherds.update(shepherd.id, { archivedAt: ctx.now() });
  await audit(ctx, "shepherd.archive", "Shepherd", shepherd.id);
  for (const flockId of new Set(ended.map((assignment) => assignment.flockId))) {
    await audit(ctx, "shepherd.archive", "Flock", flockId);
  }
}

/** A Member takes a Shepherd out of the archive. The ended assignments stay ended. */
export async function unarchiveShepherd(
  ctx: FarmCommandContext,
  input: { shepherdId: ShepherdId },
): Promise<void> {
  authorize(ctx.member, "shepherd.archive", { farmId: ctx.farm.id });
  const shepherd = await requireShepherd(ctx, input.shepherdId);
  if (shepherd.archivedAt === null) return;
  await ctx.repos.shepherds.update(shepherd.id, { archivedAt: null });
  await audit(ctx, "shepherd.unarchive", "Shepherd", shepherd.id);
}

// Flocks.

/** The fields of a Flock that a Member enters. */
export interface FlockInput {
  name: string;
  /** Where the Flock stays, or null. */
  locationId: LocationId | null;
}

/** A Member makes a Flock, with no Sheep and no Shepherd. Its name is unique in the Farm. */
export async function createFlock(ctx: FarmCommandContext, input: FlockInput): Promise<FlockId> {
  authorize(ctx.member, "flock.create", { farmId: ctx.farm.id });
  const name = validName(input.name, "flock");
  await requireFreeFlockName(ctx, name, null);
  if (input.locationId !== null) await requireLocationInUse(ctx, input.locationId);
  const flockId = await ctx.repos.flocks.insert({
    name,
    locationId: input.locationId,
    archivedAt: null,
  });
  await audit(ctx, "flock.create", "Flock", flockId);
  return flockId;
}

/** A Member changes the name or the Location of a Flock. A new Location is not Archived. */
export async function updateFlock(
  ctx: FarmCommandContext,
  input: FlockInput & { flockId: FlockId },
): Promise<void> {
  authorize(ctx.member, "flock.update", { farmId: ctx.farm.id });
  const flock = await requireFlock(ctx, input.flockId);
  const name = validName(input.name, "flock");
  await requireFreeFlockName(ctx, name, flock.id);
  if (input.locationId !== null && input.locationId !== flock.locationId) {
    await requireLocationInUse(ctx, input.locationId);
  }
  if (flock.name === name && flock.locationId === input.locationId) return;
  await ctx.repos.flocks.update(flock.id, { name, locationId: input.locationId });
  await audit(ctx, "flock.update", "Flock", flock.id);
}

/**
 * A Member archives a Flock that the Farm does not use now. Its Sheep must first go to another Flock
 * or out of all Flocks (`flock.notEmpty`). Its open assignments end on the date, as when a Shepherd
 * is archived.
 */
export async function archiveFlock(
  ctx: FarmCommandContext,
  input: { flockId: FlockId; date: CalendarDate },
): Promise<void> {
  authorize(ctx.member, "flock.archive", { farmId: ctx.farm.id });
  const flock = await requireFlock(ctx, input.flockId);
  if (flock.archivedAt !== null) return;
  if ((await ctx.repos.sheep.listInFlock(flock.id)).length > 0) {
    throw new DomainError("flock.notEmpty");
  }
  const ended = await endOpenAssignments(
    ctx,
    await ctx.repos.flocks.assignmentsOfFlock(flock.id),
    input.date,
  );
  await ctx.repos.flocks.update(flock.id, { archivedAt: ctx.now() });
  await audit(ctx, "flock.archive", "Flock", flock.id);
  for (const shepherdId of new Set(ended.map((assignment) => assignment.shepherdId))) {
    await audit(ctx, "flock.archive", "Shepherd", shepherdId);
  }
}

/**
 * A Member takes a Flock out of the archive. Its ended assignments stay ended. If its Location is
 * Archived now, the Member first takes the Location out of the archive or gives the Flock another
 * one (`location.archived`).
 */
export async function unarchiveFlock(
  ctx: FarmCommandContext,
  input: { flockId: FlockId },
): Promise<void> {
  authorize(ctx.member, "flock.archive", { farmId: ctx.farm.id });
  const flock = await requireFlock(ctx, input.flockId);
  if (flock.archivedAt === null) return;
  if (flock.locationId !== null) await requireLocationInUse(ctx, flock.locationId);
  await ctx.repos.flocks.update(flock.id, { archivedAt: null });
  await audit(ctx, "flock.unarchive", "Flock", flock.id);
}

// The Shepherds of a Flock.

/** The days of an assignment: from a date, to a date or to now (null). Both days count. */
export interface AssignmentDates {
  from: CalendarDate;
  to: CalendarDate | null;
}

/**
 * A Member assigns a Shepherd to a Flock, from a date and to a date or to now. Neither date is in
 * the future. A Shepherd can herd more than one Flock, but the assignments of one Shepherd to one
 * Flock do not overlap. An assignment is part of the Flock and of the Shepherd: each command of an
 * assignment appends an audit entry for both.
 */
export async function assignShepherd(
  ctx: FarmCommandContext,
  input: AssignmentDates & { flockId: FlockId; shepherdId: ShepherdId },
): Promise<ShepherdAssignmentId> {
  authorize(ctx.member, "flock.assignShepherd", { farmId: ctx.farm.id });
  const flock = await requireFlock(ctx, input.flockId);
  if (flock.archivedAt !== null) throw new DomainError("flock.archived");
  const shepherd = await requireShepherd(ctx, input.shepherdId);
  if (shepherd.archivedAt !== null) throw new DomainError("shepherd.archived");
  const dates = validAssignmentDates(input, today(ctx));
  await requireNoOverlap(ctx, { flockId: flock.id, shepherdId: shepherd.id, ...dates }, null);
  const assignmentId = await ctx.repos.flocks.insertAssignment({
    flockId: flock.id,
    shepherdId: shepherd.id,
    ...dates,
  });
  await auditAssignment(ctx, "flock.assignShepherd", {
    flockId: flock.id,
    shepherdId: shepherd.id,
  });
  return assignmentId;
}

/**
 * A Member changes the dates of an assignment, for example to end it. An assignment of an Archived
 * Flock or an Archived Shepherd cannot go on to now.
 */
export async function updateShepherdAssignment(
  ctx: FarmCommandContext,
  input: AssignmentDates & { assignmentId: ShepherdAssignmentId },
): Promise<void> {
  authorize(ctx.member, "flock.assignShepherd", { farmId: ctx.farm.id });
  const assignment = await requireAssignment(ctx, input.assignmentId);
  const dates = validAssignmentDates(input, today(ctx));
  if (dates.to === null && assignment.to !== null) {
    const flock = await requireFlock(ctx, assignment.flockId);
    if (flock.archivedAt !== null) throw new DomainError("flock.archived");
    const shepherd = await requireShepherd(ctx, assignment.shepherdId);
    if (shepherd.archivedAt !== null) throw new DomainError("shepherd.archived");
  }
  await requireNoOverlap(ctx, { ...assignment, ...dates }, assignment.id);
  if (assignment.from === dates.from && assignment.to === dates.to) return;
  await ctx.repos.flocks.updateAssignment(assignment.id, dates);
  await auditAssignment(ctx, "flock.updateAssignment", assignment);
}

/** A Member removes an assignment made by mistake. It becomes Deleted (ADR 0005). */
export async function removeShepherdAssignment(
  ctx: FarmCommandContext,
  input: { assignmentId: ShepherdAssignmentId },
): Promise<void> {
  authorize(ctx.member, "flock.assignShepherd", { farmId: ctx.farm.id });
  const assignment = await requireAssignment(ctx, input.assignmentId);
  await ctx.repos.flocks.markAssignmentDeleted(assignment.id, ctx.now());
  await auditAssignment(ctx, "flock.removeAssignment", assignment);
}

// The moves of Sheep.

/**
 * A Member moves one Sheep or many Sheep into a Flock, or out of all Flocks (`flockId` is null), on a
 * date. It is one command: if one Sheep cannot move, no Sheep moves. A Sheep that is in the Flock
 * already stays as it is. Each Sheep that moves gets one audit entry. Gives the number of Sheep that
 * moved.
 */
export async function moveSheep(
  ctx: FarmCommandContext,
  input: { sheepIds: readonly SheepId[]; flockId: FlockId | null; date: CalendarDate },
): Promise<{ moved: number }> {
  authorize(ctx.member, "sheep.move", { farmId: ctx.farm.id });
  const sheepIds = [...new Set(input.sheepIds)];
  if (sheepIds.length > maxSheepPerMove) throw new DomainError("sheep.tooManyToMove");
  await requireTargetFlock(ctx, input.flockId);
  // All checks come before the first write.
  const moving: Sheep[] = [];
  for (const sheepId of sheepIds) {
    const sheep = await ctx.repos.sheep.get(sheepId);
    if (sheep === null || sheep.origin === "external") throw new DomainError("sheep.notFound");
    if (sheep.flockId === input.flockId) continue;
    await requireMove(ctx, sheep, input.date);
    moving.push(sheep);
  }
  for (const sheep of moving) {
    await writeFlockMove(ctx, sheep.id, input.flockId, input.date);
    await audit(ctx, "sheep.move", "Sheep", sheep.id);
  }
  return { moved: moving.length };
}

/**
 * Moves one Sheep into a Flock or out of all Flocks on a date, for a command of another slice: a
 * Lamb goes into the Flock of its Mother, and a Sheep leaves its Flock before it stops being Active.
 * It checks the rules of a move, as `moveSheep` does: the Sheep is Active (`sheep.notActive`), the
 * Flock exists and is not Archived, and the date is a real date, not in the future, not before the
 * birth date and not before the last move of the Sheep (`sheep.moveDateInvalid`). The command that
 * calls it checks the permission and appends its own audit entry. A move to the Flock that the Sheep
 * is in writes nothing. Gives true if the Sheep moved.
 */
export async function recordFlockMove(
  ctx: FarmCommandContext,
  sheep: Sheep,
  flockId: FlockId | null,
  date: CalendarDate,
): Promise<boolean> {
  if (sheep.flockId === flockId) return false;
  await requireTargetFlock(ctx, flockId);
  await requireMove(ctx, sheep, date);
  await writeFlockMove(ctx, sheep.id, flockId, date);
  return true;
}

/**
 * A Member undoes the last move of a Sheep, for a move made by mistake: the move becomes Deleted
 * (ADR 0005), and the Sheep goes back to the Flock it was in before, or out of all Flocks. That Flock
 * is not Archived (`flock.archived`).
 */
export async function undoFlockMove(
  ctx: FarmCommandContext,
  input: { sheepId: SheepId },
): Promise<void> {
  authorize(ctx.member, "sheep.move", { farmId: ctx.farm.id });
  const sheep = await ctx.repos.sheep.get(input.sheepId);
  if (sheep === null || sheep.origin === "external") throw new DomainError("sheep.notFound");
  if (sheep.status !== "active") throw new DomainError("sheep.notActive");
  const moves = await ctx.repos.sheep.flockMoves(sheep.id);
  const last = moves.at(-1);
  if (last === undefined) throw new DomainError("sheep.noMoveToUndo");
  const previous = moves.at(-2)?.flockId ?? null;
  await requireTargetFlock(ctx, previous);
  await ctx.repos.sheep.markFlockMoveDeleted(last.id, ctx.now());
  await ctx.repos.sheep.update(sheep.id, { flockId: previous });
  await audit(ctx, "sheep.undoMove", "Sheep", sheep.id);
}

/** The Flock of a move exists and is not Archived. No Flock (out of all Flocks) is always good. */
async function requireTargetFlock(ctx: FarmCommandContext, flockId: FlockId | null): Promise<void> {
  if (flockId === null) return;
  const flock = await requireFlock(ctx, flockId);
  if (flock.archivedAt !== null) throw new DomainError("flock.archived");
}

/** The Sheep is Active, and the date of its move is good. */
async function requireMove(
  ctx: FarmCommandContext,
  sheep: Sheep,
  date: CalendarDate,
): Promise<void> {
  if (sheep.status !== "active") throw new DomainError("sheep.notActive");
  if (!isCalendarDate(date)) throw new DomainError("sheep.dateInvalid");
  const lastMove = (await ctx.repos.sheep.flockMoves(sheep.id)).at(-1);
  if (
    date > today(ctx) ||
    (sheep.birthDate !== null && date < sheep.birthDate) ||
    (lastMove !== undefined && date < lastMove.date)
  ) {
    throw new DomainError("sheep.moveDateInvalid");
  }
}

async function writeFlockMove(
  ctx: FarmCommandContext,
  sheepId: SheepId,
  flockId: FlockId | null,
  date: CalendarDate,
): Promise<void> {
  await ctx.repos.sheep.insertFlockMove({ sheepId, flockId, date, at: ctx.now() });
  await ctx.repos.sheep.update(sheepId, { flockId });
}

// The rules that the commands share.

/** Today in the time zone of the Farm. */
function today(ctx: FarmCommandContext): CalendarDate {
  return dateAt(ctx.now(), ctx.farm.timeZone);
}

function audit(
  ctx: FarmCommandContext,
  command: CommandName,
  kind: TargetKind,
  id: string,
): Promise<void> {
  return recordFarmAudit(ctx, { command, target: { kind, id } });
}

/** The audit entries of a command of an assignment: one for the Flock and one for the Shepherd. */
async function auditAssignment(
  ctx: FarmCommandContext,
  command: CommandName,
  assignment: { flockId: FlockId; shepherdId: ShepherdId },
): Promise<void> {
  await audit(ctx, command, "Flock", assignment.flockId);
  await audit(ctx, command, "Shepherd", assignment.shepherdId);
}

async function requireLocation(ctx: FarmCommandContext, id: LocationId): Promise<Location> {
  const location = await ctx.repos.locations.get(id);
  if (location === null) throw new DomainError("location.notFound");
  return location;
}

/** The Location for a Flock: it exists and it is not Archived. */
async function requireLocationInUse(ctx: FarmCommandContext, id: LocationId): Promise<void> {
  const location = await requireLocation(ctx, id);
  if (location.archivedAt !== null) throw new DomainError("location.archived");
}

async function requireShepherd(ctx: FarmCommandContext, id: ShepherdId): Promise<Shepherd> {
  const shepherd = await ctx.repos.shepherds.get(id);
  if (shepherd === null) throw new DomainError("shepherd.notFound");
  return shepherd;
}

async function requireFlock(ctx: FarmCommandContext, id: FlockId): Promise<Flock> {
  const flock = await ctx.repos.flocks.get(id);
  if (flock === null) throw new DomainError("flock.notFound");
  return flock;
}

async function requireAssignment(
  ctx: FarmCommandContext,
  id: ShepherdAssignmentId,
): Promise<ShepherdAssignment> {
  const assignment = await ctx.repos.flocks.getAssignment(id);
  if (assignment === null) throw new DomainError("flock.assignmentNotFound");
  return assignment;
}

/** Throws `location.nameTaken` if another Location of the Farm, also an Archived one, has the name. */
async function requireFreeLocationName(
  ctx: FarmCommandContext,
  name: string,
  self: LocationId | null,
): Promise<void> {
  const same = await ctx.repos.locations.findByName(name);
  if (same.some((other) => other.id !== self)) throw new DomainError("location.nameTaken");
}

/** Throws `flock.nameTaken` if another Flock of the Farm, also an Archived one, has the name. */
async function requireFreeFlockName(
  ctx: FarmCommandContext,
  name: string,
  self: FlockId | null,
): Promise<void> {
  const same = await ctx.repos.flocks.findByName(name);
  if (same.some((other) => other.id !== self)) throw new DomainError("flock.nameTaken");
}

/** Throws `flock.assignmentOverlaps` if the Shepherd has another assignment to the Flock then. */
async function requireNoOverlap(
  ctx: FarmCommandContext,
  assignment: AssignmentDates & { flockId: FlockId; shepherdId: ShepherdId },
  self: ShepherdAssignmentId | null,
): Promise<void> {
  const others = await ctx.repos.flocks.assignmentsOfShepherd(assignment.shepherdId);
  const overlaps = others.some(
    (other) =>
      other.id !== self &&
      other.flockId === assignment.flockId &&
      periodsOverlap(other, assignment),
  );
  if (overlaps) throw new DomainError("flock.assignmentOverlaps");
}

/**
 * Ends the open assignments on the date: their last day. The date is not in the future and not
 * before the start of one of them (`flock.endDateInvalid`). Gives the assignments that it ended.
 */
async function endOpenAssignments(
  ctx: FarmCommandContext,
  assignments: readonly ShepherdAssignment[],
  date: CalendarDate,
): Promise<ShepherdAssignment[]> {
  const open = assignments.filter((assignment) => assignment.to === null);
  if (
    !isCalendarDate(date) ||
    date > today(ctx) ||
    open.some((assignment) => date < assignment.from)
  ) {
    throw new DomainError("flock.endDateInvalid");
  }
  for (const assignment of open) {
    await ctx.repos.flocks.updateAssignment(assignment.id, { from: assignment.from, to: date });
  }
  return open;
}

/** Real dates, `from` not after `to`, and neither in the future. */
function validAssignmentDates(dates: AssignmentDates, today: CalendarDate): AssignmentDates {
  const valid = (date: CalendarDate) => isCalendarDate(date) && date <= today;
  if (!valid(dates.from) || (dates.to !== null && (!valid(dates.to) || dates.to < dates.from))) {
    throw new DomainError("flock.assignmentDatesInvalid");
  }
  return { from: dates.from, to: dates.to };
}

function validLocation(input: LocationInput) {
  return {
    name: validName(input.name, "location"),
    notes: optionalText(input.notes, maxNotesLength, "location.notesTooLong"),
  };
}

function validShepherd(input: ShepherdInput) {
  return {
    name: validName(input.name, "shepherd"),
    phone: optionalText(input.phone, maxPhoneLength, "shepherd.phoneTooLong"),
    notes: optionalText(input.notes, maxNotesLength, "shepherd.notesTooLong"),
  };
}

/** The name with the spaces trimmed and the inner spaces as one, or the error of the kind. */
function validName(name: string, kind: "flock" | "location" | "shepherd"): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed === "") throw new DomainError(`${kind}.nameRequired`);
  if (trimmed.length > maxNameLength) throw new DomainError(`${kind}.nameTooLong`);
  return trimmed;
}

/** The trimmed text, or null if it is empty. Throws the code if the text is too long. */
function optionalText(text: string | null, maxLength: number, code: ErrorCode): string | null {
  const trimmed = text?.trim() ?? "";
  if (trimmed === "") return null;
  if (trimmed.length > maxLength) throw new DomainError(code);
  return trimmed;
}

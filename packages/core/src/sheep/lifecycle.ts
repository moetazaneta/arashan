import { authorize } from "../access/permissions";
import { type CommandName, recordFarmAudit } from "../audit/audit";
import type { FarmCommandContext } from "../context";
import { type CalendarDate, dateAt, isCalendarDate } from "../dates";
import { DomainError } from "../errors";
import { recordFlockMove } from "../flocks/commands";
import { lastLambingDate } from "../lambings/lambing";
import type { SheepId } from "../ids";
import { requireOwner } from "./commands";
import {
  type ExitStatus,
  exitStatuses,
  maxStatusReasonLength,
  type Sheep,
  type SheepStatus,
  type StatusChange,
} from "./sheep";

/** A Status that an Active Sheep can get: all but Active. */
type LeftStatus = Exclude<SheepStatus, "active">;

// The life of a Sheep on the Farm: it stops being Active when it is Slaughtered, Dead or Lost, and a
// Lost Sheep can come back. Each change of the Status is an event with a date (`StatusChange`), and a
// wrong one is undone. Slaughtered and Dead are final: only the undo of the event makes such a Sheep
// Active again. A Sheep that stops being Active leaves its Flock on the date of the change.

/** The most Sheep that one change of the Status can take: a bulk action of the Sheep table. */
export const maxSheepPerStatusChange = 500;

/** A change of the Status to Slaughtered, Dead or Lost. */
export interface ExitInput {
  status: ExitStatus;
  date: CalendarDate;
  /** Why, in the words of the Member. An empty text is no reason. */
  reason: string | null;
}

/**
 * A Member changes the Status of one Sheep or many Active Sheep to Slaughtered, Dead or Lost, on a
 * date, with an optional reason. It is one command: if one Sheep cannot change, no Sheep changes.
 * Each Sheep leaves its Flock on that date and gets one audit entry. Gives the number of Sheep.
 */
export async function changeSheepStatus(
  ctx: FarmCommandContext,
  input: ExitInput & { sheepIds: readonly SheepId[] },
): Promise<{ changed: number }> {
  authorize(ctx.member, "sheep.changeStatus", { farmId: ctx.farm.id });
  const sheepIds = [...new Set(input.sheepIds)];
  if (sheepIds.length > maxSheepPerStatusChange) {
    throw new DomainError("sheep.tooManyToChangeStatus");
  }
  const reason = validReason(input.reason);
  // All checks come before the first write.
  const changing: Sheep[] = [];
  for (const sheepId of sheepIds) {
    const sheep = await requireSheep(ctx, sheepId);
    await requireExit(ctx, sheep, input.date);
    changing.push(sheep);
  }
  for (const sheep of changing) {
    await writeExit(ctx, sheep, { status: input.status, date: input.date, reason });
    await recordFarmAudit(ctx, {
      command: exitCommands[input.status],
      target: { kind: "Sheep", id: sheep.id },
    });
  }
  return { changed: changing.length };
}

/**
 * The Status of an Active Sheep changes, for a command of another slice: for example, a Sale makes
 * its Sheep Sold. It checks the rules, as `changeSheepStatus` does: the Sheep is Active
 * (`sheep.notActive`), and the date is a real date, not in the future and not before the last event
 * of the Sheep (`sheep.statusDateInvalid`). The Sheep leaves its Flock on that date. The command that
 * calls it checks the permission and appends its own audit entry.
 */
export async function recordStatusChange(
  ctx: FarmCommandContext,
  sheep: Sheep,
  change: { status: LeftStatus; date: CalendarDate; reason: string | null },
): Promise<void> {
  await requireExit(ctx, sheep, change.date);
  await writeExit(ctx, sheep, { ...change, reason: validReason(change.reason) });
}

/**
 * A Member records that a Lost Sheep came back: it is Active again from the date, in no Flock. The
 * date is not in the future, and not before the loss, the last move or the last change of the Owner.
 * Its Owner must be a Member now (`sheep.ownerNotMember`).
 */
export async function markSheepFound(
  ctx: FarmCommandContext,
  input: { sheepId: SheepId; date: CalendarDate; reason: string | null },
): Promise<void> {
  authorize(ctx.member, "sheep.changeStatus", { farmId: ctx.farm.id });
  const sheep = await requireSheep(ctx, input.sheepId);
  if (sheep.status !== "lost") throw new DomainError("sheep.notLost");
  const reason = validReason(input.reason);
  const date = validDate(input.date);
  const [changes, moves, owners] = await Promise.all([
    ctx.repos.sheep.statusChanges(sheep.id),
    ctx.repos.sheep.flockMoves(sheep.id),
    ctx.repos.sheep.ownerChanges(sheep.id),
  ]);
  const before = [changes.at(-1)?.date, moves.at(-1)?.date, owners.at(-1)?.date];
  if (date > today(ctx) || before.some((other) => other !== undefined && date < other)) {
    throw new DomainError("sheep.statusDateInvalid");
  }
  if (sheep.ownerId !== null) await requireOwner(ctx, sheep.ownerId);
  await ctx.repos.sheep.insertStatusChange({
    sheepId: sheep.id,
    from: "lost",
    to: "active",
    date,
    reason,
    flockMoveId: null,
    at: ctx.now(),
  });
  await ctx.repos.sheep.update(sheep.id, { status: "active" });
  await recordFarmAudit(ctx, {
    command: "sheep.markFound",
    target: { kind: "Sheep", id: sheep.id },
  });
}

/**
 * A Member undoes the last change of the Status of a Sheep, for a change made by mistake. The change
 * becomes Deleted (ADR 0005), and the Sheep gets the Status from before it.
 *
 * - A Sheep that becomes Active again goes back to the Flock that it left with the change, if that
 *   Flock is not Archived now; else it stays in no Flock. Its Owner must be a Member now.
 * - A Sheep that becomes Lost again was in no Flock since the loss: the moves after it was found are
 *   undone first (`sheep.movedAfterFound`).
 */
export async function undoSheepStatusChange(
  ctx: FarmCommandContext,
  input: { sheepId: SheepId },
): Promise<void> {
  authorize(ctx.member, "sheep.changeStatus", { farmId: ctx.farm.id });
  const sheep = await requireSheep(ctx, input.sheepId);
  const last = (await ctx.repos.sheep.statusChanges(sheep.id)).at(-1);
  if (last === undefined || last.to !== sheep.status || !undoable(last)) {
    throw new DomainError("sheep.noStatusChangeToUndo");
  }
  if (last.from === "active") {
    if (sheep.ownerId !== null) await requireOwner(ctx, sheep.ownerId);
    await returnToFlock(ctx, sheep, last);
  } else {
    // The Sheep was in no Flock while it was Lost: the moves after it was found must go first.
    const moves = await ctx.repos.sheep.flockMoves(sheep.id);
    if (moves.some((move) => move.at > last.at)) throw new DomainError("sheep.movedAfterFound");
  }
  await ctx.repos.sheep.markStatusChangeDeleted(last.id, ctx.now());
  await ctx.repos.sheep.update(sheep.id, { status: last.from });
  await recordFarmAudit(ctx, {
    command: "sheep.undoStatusChange",
    target: { kind: "Sheep", id: sheep.id },
  });
}

/** The audit command of each Status that a Member gives with `changeSheepStatus`. */
const exitCommands = {
  slaughtered: "sheep.markSlaughtered",
  dead: "sheep.markDead",
  lost: "sheep.markLost",
} as const satisfies Record<ExitStatus, CommandName>;

/**
 * True for a change that `undoSheepStatusChange` undoes: a change of this slice. A change of another
 * slice, such as a Sale, is undone with its own event.
 */
function undoable(change: StatusChange): boolean {
  if (change.from === "active") return (exitStatuses as readonly string[]).includes(change.to);
  return change.from === "lost" && change.to === "active";
}

/**
 * The Sheep is Active, and the date of its change is good: a real date, not in the future, and not
 * before its birth date, its last move, its last change of the Owner or its last change of the
 * Status. Thus the history of the Sheep stays in the order of the dates.
 */
async function requireExit(ctx: FarmCommandContext, sheep: Sheep, date: CalendarDate) {
  if (sheep.status !== "active") throw new DomainError("sheep.notActive");
  validDate(date);
  const [moves, owners, changes, lambing] = await Promise.all([
    ctx.repos.sheep.flockMoves(sheep.id),
    ctx.repos.sheep.ownerChanges(sheep.id),
    ctx.repos.sheep.statusChanges(sheep.id),
    lastLambingDate(ctx.repos.lambings, sheep.id),
  ]);
  const before = [
    sheep.birthDate,
    moves.at(-1)?.date,
    owners.at(-1)?.date,
    changes.at(-1)?.date,
    lambing,
  ];
  if (date > today(ctx) || before.some((other) => other != null && date < other)) {
    throw new DomainError("sheep.statusDateInvalid");
  }
}

/** The Sheep leaves its Flock on the date, and gets the new Status with its event. */
async function writeExit(
  ctx: FarmCommandContext,
  sheep: Sheep,
  change: { status: LeftStatus; date: CalendarDate; reason: string | null },
): Promise<void> {
  let flockMoveId: StatusChange["flockMoveId"] = null;
  if (await recordFlockMove(ctx, sheep, null, change.date)) {
    flockMoveId = (await ctx.repos.sheep.flockMoves(sheep.id)).at(-1)?.id ?? null;
  }
  await ctx.repos.sheep.insertStatusChange({
    sheepId: sheep.id,
    from: "active",
    to: change.status,
    date: change.date,
    reason: change.reason,
    flockMoveId,
    at: ctx.now(),
  });
  await ctx.repos.sheep.update(sheep.id, { status: change.status });
}

/**
 * Undoes the move out of all Flocks of a change, if it is still the last move of the Sheep: the move
 * becomes Deleted, and the Sheep is in its Flock again. If that Flock is Archived now, the move stays,
 * and the Sheep stays in no Flock.
 */
async function returnToFlock(
  ctx: FarmCommandContext,
  sheep: Sheep,
  change: StatusChange,
): Promise<void> {
  if (change.flockMoveId === null) return;
  const moves = await ctx.repos.sheep.flockMoves(sheep.id);
  if (moves.at(-1)?.id !== change.flockMoveId) return;
  const previous = moves.at(-2)?.flockId ?? null;
  if (previous === null) return;
  const flock = await ctx.repos.flocks.get(previous);
  if (flock === null || flock.archivedAt !== null) return;
  await ctx.repos.sheep.markFlockMoveDeleted(change.flockMoveId, ctx.now());
  await ctx.repos.sheep.update(sheep.id, { flockId: previous });
}

/** The Sheep of the Farm, or `sheep.notFound`. A Deleted Sheep and an External Sheep are not found. */
async function requireSheep(ctx: FarmCommandContext, id: SheepId): Promise<Sheep> {
  const sheep = await ctx.repos.sheep.get(id);
  if (sheep === null || sheep.origin === "external") throw new DomainError("sheep.notFound");
  return sheep;
}

/** Today in the time zone of the Farm. */
function today(ctx: FarmCommandContext): CalendarDate {
  return dateAt(ctx.now(), ctx.farm.timeZone);
}

function validDate(date: string): CalendarDate {
  if (!isCalendarDate(date)) throw new DomainError("sheep.dateInvalid");
  return date;
}

/** The trimmed reason, or null if it is empty. */
function validReason(reason: string | null): string | null {
  const trimmed = reason?.trim() ?? "";
  if (trimmed === "") return null;
  if (trimmed.length > maxStatusReasonLength) throw new DomainError("sheep.reasonTooLong");
  return trimmed;
}

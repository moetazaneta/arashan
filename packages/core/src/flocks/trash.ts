import type { CalendarDate } from "../dates";
import type { ShepherdAssignmentId, ShepherdId } from "../ids";
import type { TrashType } from "../trash/trash";
import { restoreShepherdAssignment } from "./commands";
import type { Flock, Shepherd } from "./flock";
import { type FlockRef, flockRefOf, type ShepherdRef } from "./queries";

/** A removed assignment of a Shepherd as the Trash shows it. */
export interface TrashShepherdAssignment {
  flock: FlockRef;
  shepherd: ShepherdRef;
  from: CalendarDate;
  /** The last day, or null for an assignment that went on. */
  to: CalendarDate | null;
}

/** The assignments of Shepherds to Flocks that a Member removed. */
export const shepherdAssignmentTrash: TrashType<"shepherdAssignment", TrashShepherdAssignment> = {
  async list(ctx) {
    const assignments = await ctx.repos.flocks.listDeletedAssignments();
    if (assignments.length === 0) return [];
    const flocks = new Map<Flock["id"], Flock>();
    for (const flock of await ctx.repos.flocks.list()) flocks.set(flock.id, flock);
    const shepherds = new Map<ShepherdId, Shepherd>();
    for (const shepherd of await ctx.repos.shepherds.list()) shepherds.set(shepherd.id, shepherd);
    return assignments.map((assignment) => {
      const shepherd = shepherds.get(assignment.shepherdId);
      return {
        kind: "shepherdAssignment",
        id: assignment.id,
        deletedAt: assignment.deletedAt,
        record: {
          flock: flockRefOf(flocks, assignment.flockId),
          shepherd: {
            id: assignment.shepherdId,
            name: shepherd?.name ?? "",
            archived: shepherd !== undefined && shepherd.archivedAt !== null,
          },
          from: assignment.from,
          to: assignment.to,
        },
      };
    });
  },
  restore: (ctx, id) => restoreShepherdAssignment(ctx, id as ShepherdAssignmentId),
};

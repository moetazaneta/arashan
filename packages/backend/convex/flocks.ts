import {
  archiveFlock,
  assignShepherd as assignShepherdToFlock,
  createFlock,
  type FlockId,
  getFlock,
  getSheepResponsible,
  listFlocks,
  type LocationId,
  moveSheep as moveSheepToFlock,
  removeShepherdAssignment,
  type SheepId,
  type ShepherdAssignmentId,
  type ShepherdId,
  unarchiveFlock,
  undoFlockMove,
  updateFlock,
  updateShepherdAssignment,
} from "@arashan/core";
import { v } from "convex/values";

import { farmCommand, farmQuery } from "./lib/functions";

// The Flocks of a Farm, the assignments of their Shepherds, and the moves of Sheep between Flocks.
// The ids are strings, not `v.id(…)`: the core gets its own ids, and an unknown id is a domain
// error. A date is "YYYY-MM-DD".

/** The fields of the form of a Flock. */
const fields = { name: v.string(), locationId: v.union(v.string(), v.null()) };
/** The days of an assignment: the last day is null while it goes on. */
const dates = { from: v.string(), to: v.union(v.string(), v.null()) };

/** The Flocks of the Farm, also the Archived ones, by name. */
export const list = farmQuery({
  args: {},
  handler: (ctx) => listFlocks(ctx),
});

/** The card of a Flock, or null if the Farm has no such Flock. */
export const get = farmQuery({
  args: { flockId: v.string() },
  handler: (ctx, args) => getFlock(ctx, { flockId: args.flockId as FlockId }),
});

/** Who was responsible for a Sheep on a date: the Flocks that had it and their Shepherds. */
export const responsible = farmQuery({
  args: { sheepId: v.string(), date: v.string() },
  handler: (ctx, args) =>
    getSheepResponsible(ctx, { sheepId: args.sheepId as SheepId, date: args.date }),
});

/** A Member makes a Flock, and gets its id. */
export const create = farmCommand({
  args: fields,
  handler: (ctx, args) =>
    createFlock(ctx, { name: args.name, locationId: args.locationId as LocationId | null }),
});

/** A Member changes the name or the Location of a Flock. */
export const update = farmCommand({
  args: { flockId: v.string(), ...fields },
  handler: (ctx, args) =>
    updateFlock(ctx, {
      flockId: args.flockId as FlockId,
      name: args.name,
      locationId: args.locationId as LocationId | null,
    }),
});

/** A Member archives a Flock with no Sheep. Its open assignments end on the date. */
export const archive = farmCommand({
  args: { flockId: v.string(), date: v.string() },
  handler: (ctx, args) => archiveFlock(ctx, { flockId: args.flockId as FlockId, date: args.date }),
});

/** A Member takes a Flock out of the archive. */
export const unarchive = farmCommand({
  args: { flockId: v.string() },
  handler: (ctx, args) => unarchiveFlock(ctx, { flockId: args.flockId as FlockId }),
});

/** A Member assigns a Shepherd to a Flock, and gets the id of the assignment. */
export const assignShepherd = farmCommand({
  args: { flockId: v.string(), shepherdId: v.string(), ...dates },
  handler: (ctx, args) =>
    assignShepherdToFlock(ctx, {
      ...args,
      flockId: args.flockId as FlockId,
      shepherdId: args.shepherdId as ShepherdId,
    }),
});

/** A Member changes the dates of an assignment, for example to end it. */
export const updateAssignment = farmCommand({
  args: { assignmentId: v.string(), ...dates },
  handler: (ctx, args) =>
    updateShepherdAssignment(ctx, {
      ...args,
      assignmentId: args.assignmentId as ShepherdAssignmentId,
    }),
});

/** A Member removes an assignment made by mistake: it becomes Deleted. */
export const removeAssignment = farmCommand({
  args: { assignmentId: v.string() },
  handler: (ctx, args) =>
    removeShepherdAssignment(ctx, { assignmentId: args.assignmentId as ShepherdAssignmentId }),
});

/**
 * A Member moves Sheep into a Flock, or out of all Flocks (`flockId` null), on a date: one command
 * for all of them. Gives the number of Sheep that moved.
 */
export const moveSheep = farmCommand({
  args: { sheepIds: v.array(v.string()), flockId: v.union(v.string(), v.null()), date: v.string() },
  handler: (ctx, args) =>
    moveSheepToFlock(ctx, {
      sheepIds: args.sheepIds as SheepId[],
      flockId: args.flockId as FlockId | null,
      date: args.date,
    }),
});

/** A Member undoes the last move of a Sheep, made by mistake. */
export const undoMove = farmCommand({
  args: { sheepId: v.string() },
  handler: (ctx, args) => undoFlockMove(ctx, { sheepId: args.sheepId as SheepId }),
});

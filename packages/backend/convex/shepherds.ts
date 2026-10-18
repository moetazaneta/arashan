import {
  archiveShepherd,
  createShepherd,
  listShepherds,
  type ShepherdId,
  unarchiveShepherd,
  updateShepherd,
} from "@arashan/core";
import { v } from "convex/values";

import { farmCommand, farmQuery } from "./lib/functions";

// The Shepherds of a Farm: hired people who herd the Flocks. A Shepherd is not a User.

/** A text that the Member can leave empty. */
const optionalText = v.union(v.string(), v.null());
/** The fields of the form of a Shepherd. */
const fields = { name: v.string(), phone: optionalText, notes: optionalText };

/** The Shepherds of the Farm, also the Archived ones, by name. */
export const list = farmQuery({
  args: {},
  handler: (ctx) => listShepherds(ctx),
});

/** A Member adds a Shepherd, and gets the id. */
export const create = farmCommand({
  args: fields,
  handler: (ctx, args) => createShepherd(ctx, args),
});

/** A Member changes the name, the phone or the notes of a Shepherd. */
export const update = farmCommand({
  args: { shepherdId: v.string(), ...fields },
  handler: (ctx, args) =>
    updateShepherd(ctx, { ...args, shepherdId: args.shepherdId as ShepherdId }),
});

/** A Member archives a Shepherd. The open assignments end on the date "YYYY-MM-DD". */
export const archive = farmCommand({
  args: { shepherdId: v.string(), date: v.string() },
  handler: (ctx, args) =>
    archiveShepherd(ctx, { shepherdId: args.shepherdId as ShepherdId, date: args.date }),
});

/** A Member takes a Shepherd out of the archive. */
export const unarchive = farmCommand({
  args: { shepherdId: v.string() },
  handler: (ctx, args) => unarchiveShepherd(ctx, { shepherdId: args.shepherdId as ShepherdId }),
});

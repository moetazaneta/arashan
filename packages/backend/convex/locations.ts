import {
  archiveLocation,
  createLocation,
  listLocations,
  type LocationId,
  unarchiveLocation,
  updateLocation,
} from "@arashan/core";
import { v } from "convex/values";

import { farmCommand, farmQuery } from "./lib/functions";

// The Locations of a Farm: a pasture, a sheepfold, a yard. The ids are strings, not `v.id(…)`: the
// core gets its own ids, and an unknown id is a domain error.

/** The fields of the form of a Location. */
const fields = { name: v.string(), notes: v.union(v.string(), v.null()) };

/** The Locations of the Farm, also the Archived ones, by name. */
export const list = farmQuery({
  args: {},
  handler: (ctx) => listLocations(ctx),
});

/** A Member makes a Location, and gets its id. */
export const create = farmCommand({
  args: fields,
  handler: (ctx, args) => createLocation(ctx, args),
});

/** A Member changes the name or the notes of a Location. */
export const update = farmCommand({
  args: { locationId: v.string(), ...fields },
  handler: (ctx, args) =>
    updateLocation(ctx, { ...args, locationId: args.locationId as LocationId }),
});

/** A Member archives a Location that no Flock uses now. */
export const archive = farmCommand({
  args: { locationId: v.string() },
  handler: (ctx, args) => archiveLocation(ctx, { locationId: args.locationId as LocationId }),
});

/** A Member takes a Location out of the archive. */
export const unarchive = farmCommand({
  args: { locationId: v.string() },
  handler: (ctx, args) => unarchiveLocation(ctx, { locationId: args.locationId as LocationId }),
});

import {
  getLambingDefaults,
  listLambings,
  type MembershipId,
  recordLambing,
  type SheepId,
} from "@arashan/core";
import { v } from "convex/values";

import { farmCommand, farmQuery } from "./lib/functions";

// The Lambings of a Farm. The ids are strings, not `v.id(…)`: the core gets its own ids, and an
// unknown id is a domain error. A date is "YYYY-MM-DD".

/** The defaults of the form of a Lambing for the Mother and the date: the Owner and the Flock. */
export const defaults = farmQuery({
  args: { motherId: v.string(), date: v.string() },
  handler: (ctx, args) =>
    getLambingDefaults(ctx, { motherId: args.motherId as SheepId, date: args.date }),
});

/** The Lambings of an Ewe, the newest first, for her card. */
export const listOfMother = farmQuery({
  args: { motherId: v.string() },
  handler: (ctx, args) => listLambings(ctx, { motherId: args.motherId as SheepId }),
});

/**
 * A Member records a Lambing: its live Lambs become Sheep. The Member gets the ids of the Lambing
 * and of its Lambs. An Owner of null is the default: the Owner of the Mother on the date.
 */
export const record = farmCommand({
  args: {
    motherId: v.string(),
    fatherId: v.union(v.string(), v.null()),
    date: v.string(),
    lambs: v.array(
      v.object({
        sex: v.union(v.literal("ram"), v.literal("ewe")),
        tag: v.union(v.string(), v.null()),
        ownerId: v.union(v.string(), v.null()),
      }),
    ),
    stillborn: v.number(),
  },
  handler: (ctx, args) =>
    recordLambing(ctx, {
      motherId: args.motherId as SheepId,
      fatherId: args.fatherId as SheepId | null,
      date: args.date,
      lambs: args.lambs.map((lamb) => ({ ...lamb, ownerId: lamb.ownerId as MembershipId | null })),
      stillborn: args.stillborn,
    }),
});

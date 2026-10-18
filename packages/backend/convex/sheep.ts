import {
  changeSheepOwner,
  deleteSheep,
  getSheep,
  getSheepHistory,
  listSheep,
  listSheepOwners,
  type MembershipId,
  registerSheep,
  type SheepId,
  updateSheep,
} from "@arashan/core";
import { v } from "convex/values";

import { farmCommand, farmQuery } from "./lib/functions";

// The Sheep registry of a Farm. The ids of Sheep and Memberships are strings, not `v.id(…)`: the
// core gets its own ids, and an unknown id is a domain error.

const sex = v.union(v.literal("ram"), v.literal("ewe"));
/** The Origin of a Sheep that a Member registers: an External Sheep comes with the pedigree. */
const registeredOrigin = v.union(v.literal("born"), v.literal("bought"));
/** A text that the Member can leave empty. */
const optionalText = v.union(v.string(), v.null());

/** The fields of the form of a Sheep. A date is "YYYY-MM-DD". */
const details = {
  tag: optionalText,
  name: optionalText,
  sex,
  birthDate: optionalText,
  notes: optionalText,
  weight: v.union(v.object({ kg: v.number(), date: v.string() }), v.null()),
};

/** The Sheep of the Farm for the table «Бараны», without the Deleted ones. */
export const list = farmQuery({
  args: {},
  handler: (ctx) => listSheep(ctx),
});

/** The card of a Sheep with the history of its Owners, or null if it is Deleted or not found. */
export const get = farmQuery({
  args: { sheepId: v.string() },
  handler: (ctx, args) => getSheep(ctx, { sheepId: args.sheepId as SheepId }),
});

/** Who changed a Sheep and when, the newest first: the tab «История» of the card. */
export const history = farmQuery({
  args: { sheepId: v.string() },
  handler: (ctx, args) => getSheepHistory(ctx, { sheepId: args.sheepId as SheepId }),
});

/** The Members who can own a Sheep now: the choices of the Owner in the forms. */
export const owners = farmQuery({
  args: {},
  handler: (ctx) => listSheepOwners(ctx),
});

/** A Member registers a Sheep, and gets its id. */
export const register = farmCommand({
  args: {
    ...details,
    ownerId: v.string(),
    origin: registeredOrigin,
    initialEntry: v.boolean(),
  },
  handler: (ctx, args) => registerSheep(ctx, { ...args, ownerId: args.ownerId as MembershipId }),
});

/** A Member changes the fields of a Sheep. The Origin changes only for an Initial entry. */
export const update = farmCommand({
  args: { sheepId: v.string(), ...details, origin: v.optional(registeredOrigin) },
  handler: (ctx, args) => updateSheep(ctx, { ...args, sheepId: args.sheepId as SheepId }),
});

/** A Member gives an Active Sheep to another Member, on a date "YYYY-MM-DD". */
export const changeOwner = farmCommand({
  args: { sheepId: v.string(), ownerId: v.string(), date: v.string() },
  handler: (ctx, args) =>
    changeSheepOwner(ctx, {
      sheepId: args.sheepId as SheepId,
      ownerId: args.ownerId as MembershipId,
      date: args.date,
    }),
});

/**
 * A Member deletes a Sheep that was registered by mistake: it becomes Deleted (ADR 0005). The name
 * is not `delete`, because that is a reserved word.
 */
export const markDeleted = farmCommand({
  args: { sheepId: v.string() },
  handler: (ctx, args) => deleteSheep(ctx, { sheepId: args.sheepId as SheepId }),
});

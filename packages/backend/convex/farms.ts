import {
  createFarm,
  type FarmId,
  getFarm,
  inviteFarmAdmin,
  listFarms,
  updateFarmSettings,
} from "@arashan/core";
import { v } from "convex/values";

import { command, farmCommand, farmQuery, query } from "./lib/functions";

const settings = {
  currency: v.string(),
  timeZone: v.string(),
  lambAgeMonths: v.number(),
};

/** The Operator's list of all Farms: only the names and whether a Member joined. */
export const list = query({
  args: {},
  handler: (ctx) => listFarms(ctx),
});

/** The Operator makes a Farm, and gets the invite link of its first Admin. */
export const create = command({
  args: { name: v.string(), ...settings },
  handler: (ctx, args) => createFarm(ctx, args),
});

/** The Operator makes a new invite link of the first Admin of a Farm with no Member. */
export const inviteAdmin = command({
  // A string, not `v.id("farms")`: the core gets its own ids, and an unknown id is a domain error.
  args: { farmId: v.string() },
  handler: (ctx, args) => inviteFarmAdmin(ctx, { farmId: args.farmId as FarmId }),
});

/** The Farm of the request, with its settings. */
export const get = farmQuery({
  args: {},
  handler: (ctx) => getFarm(ctx),
});

/** An Admin changes the settings of the Farm. */
export const updateSettings = farmCommand({
  args: settings,
  handler: (ctx, args) => updateFarmSettings(ctx, args),
});

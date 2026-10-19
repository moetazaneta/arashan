import {
  suggestUsage as coreSuggestUsage,
  getStockForecast,
  setResourceNorms,
  recordAdjustment,
  archiveResource,
  cancelResourceEvent,
  createResource,
  type FlockId,
  getResource,
  listResources,
  type ResourceEventId,
  type ResourceId,
  recordRestock,
  unarchiveResource,
  updateResource,
  recordUsage,
} from "@arashan/core";
import { v } from "convex/values";

import { farmCommand, farmQuery } from "./lib/functions";

// The Resources of a Farm and their events. The ids are strings, not `v.id(…)`: the core gets its
// own ids, and an unknown id is a domain error. A date is "YYYY-MM-DD", a quantity an integer of
// thousandths of the unit, and a price an integer of hundredths of the currency unit.

/** The fields of the form of a Resource. */
const fields = { name: v.string(), unit: v.string() };

/** The Resources of the Farm with their Stock, also the Archived ones, by name. */
export const list = farmQuery({
  args: {},
  handler: (ctx) => listResources(ctx),
});

/** The card of a Resource: its Stock and its events, the newest first. */
export const get = farmQuery({
  args: { resourceId: v.string() },
  handler: (ctx, args) => getResource(ctx, { resourceId: args.resourceId as ResourceId }),
});

/** A Member adds a Resource, and gets its id. */
export const create = farmCommand({
  args: fields,
  handler: (ctx, args) => createResource(ctx, args),
});

/** A Member changes the name or the unit of a Resource. */
export const update = farmCommand({
  args: { resourceId: v.string(), ...fields },
  handler: (ctx, args) =>
    updateResource(ctx, { ...args, resourceId: args.resourceId as ResourceId }),
});

/** A Member archives a Resource. */
export const archive = farmCommand({
  args: { resourceId: v.string() },
  handler: (ctx, args) => archiveResource(ctx, { resourceId: args.resourceId as ResourceId }),
});

/** A Member takes a Resource out of the archive. */
export const unarchive = farmCommand({
  args: { resourceId: v.string() },
  handler: (ctx, args) => unarchiveResource(ctx, { resourceId: args.resourceId as ResourceId }),
});

/** A Member records a Restock, with a price or without one, and gets its id. */
export const restock = farmCommand({
  args: {
    resourceId: v.string(),
    date: v.string(),
    quantity: v.number(),
    price: v.union(v.number(), v.null()),
  },
  handler: (ctx, args) =>
    recordRestock(ctx, { ...args, resourceId: args.resourceId as ResourceId }),
});

/** A Member records a Usage of a Resource by a Flock, and gets its id. */
export const use = farmCommand({
  args: { resourceId: v.string(), date: v.string(), quantity: v.number(), flockId: v.string() },
  handler: (ctx, args) =>
    recordUsage(ctx, {
      ...args,
      resourceId: args.resourceId as ResourceId,
      flockId: args.flockId as FlockId,
    }),
});

/** A Member records an Adjustment after a count, and gets its id. */
export const adjust = farmCommand({
  args: { resourceId: v.string(), date: v.string(), counted: v.number(), reason: v.string() },
  handler: (ctx, args) =>
    recordAdjustment(ctx, { ...args, resourceId: args.resourceId as ResourceId }),
});

/** A Member cancels an event made by mistake. */
export const cancelEvent = farmCommand({
  args: { eventId: v.string() },
  handler: (ctx, args) => cancelResourceEvent(ctx, { eventId: args.eventId as ResourceEventId }),
});

/** The quantity suggested for a Usage by the Norms, the Flock and the date. */
export const suggestUsage = farmQuery({
  args: { resourceId: v.string(), flockId: v.string(), date: v.string() },
  handler: (ctx, args) =>
    coreSuggestUsage(ctx, {
      ...args,
      resourceId: args.resourceId as ResourceId,
      flockId: args.flockId as FlockId,
    }),
});

/** How long each Resource will last for the Farm and for each Flock. */
export const forecast = farmQuery({
  args: { date: v.string() },
  handler: (ctx, args) => getStockForecast(ctx, args),
});

/** A Member sets the Norms of a Resource. */
export const setNorms = farmCommand({
  args: {
    resourceId: v.string(),
    norms: v.object({ ram: v.number(), ewe: v.number(), lamb: v.number() }),
  },
  handler: (ctx, args) =>
    setResourceNorms(ctx, { ...args, resourceId: args.resourceId as ResourceId }),
});

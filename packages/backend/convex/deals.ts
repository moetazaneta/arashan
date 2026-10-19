import {
  buySheep,
  cancelDeal,
  changeDealPrice,
  type DealId,
  type FlockId,
  getDeal,
  listDeals,
  type MembershipId,
  sellSheep,
  type SheepId,
} from "@arashan/core";
import { v } from "convex/values";

import { farmCommand, farmQuery } from "./lib/functions";

// The Sales and the Purchases of Sheep. The ids are strings, not `v.id(…)`: the core gets its own
// ids, and an unknown id is a domain error. A date is "YYYY-MM-DD", and a price is an integer of
// hundredths of the currency unit of the Farm.

const kind = v.union(v.literal("sale"), v.literal("purchase"));
/** A text that the Member can leave empty. */
const optionalText = v.union(v.string(), v.null());

/** The Sales and the Purchases of the Farm, or the deals of one kind, the newest first. */
export const list = farmQuery({
  args: { kind: v.union(kind, v.null()) },
  handler: (ctx, args) => listDeals(ctx, args),
});

/** The card of a deal, or null if it is cancelled or the Farm has no such deal. */
export const get = farmQuery({
  args: { dealId: v.string() },
  handler: (ctx, args) => getDeal(ctx, { dealId: args.dealId as DealId }),
});

/** A Member sells Active Sheep for one total price, and gets the id of the Sale. */
export const sell = farmCommand({
  args: { sheepIds: v.array(v.string()), date: v.string(), price: v.number() },
  handler: (ctx, args) => sellSheep(ctx, { ...args, sheepIds: args.sheepIds as SheepId[] }),
});

/** A Member records the Purchase of new Sheep, and gets the id of the Purchase. */
export const buy = farmCommand({
  args: {
    sheep: v.array(
      v.object({
        tag: optionalText,
        name: optionalText,
        sex: v.union(v.literal("ram"), v.literal("ewe")),
        birthDate: optionalText,
        notes: optionalText,
        ownerId: v.string(),
      }),
    ),
    date: v.string(),
    price: v.number(),
    flockId: v.union(v.string(), v.null()),
  },
  handler: (ctx, args) =>
    buySheep(ctx, {
      ...args,
      sheep: args.sheep.map((row) => ({ ...row, ownerId: row.ownerId as MembershipId })),
      flockId: args.flockId as FlockId | null,
    }),
});

/** A Member changes the price of a deal: the amount of its Automatic record. */
export const changePrice = farmCommand({
  args: { dealId: v.string(), price: v.number() },
  handler: (ctx, args) =>
    changeDealPrice(ctx, { dealId: args.dealId as DealId, price: args.price }),
});

/** A Member cancels a deal made by mistake, with its Automatic record. */
export const cancel = farmCommand({
  args: { dealId: v.string() },
  handler: (ctx, args) => cancelDeal(ctx, { dealId: args.dealId as DealId }),
});

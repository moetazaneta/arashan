import { getHeadCountReport, getMoneyReport } from "@arashan/core";
import { v } from "convex/values";

import { farmQuery } from "./lib/functions";

// The reports of a Farm. A date is "YYYY-MM-DD"; the core checks it.

/**
 * The head count of the Sheep by Status, Owner, Flock, Location and group. The date says which Sheep
 * are Lambs: the client gives today in the time zone of the Farm.
 */
export const headCount = farmQuery({
  args: { date: v.string() },
  handler: (ctx, args) => getHeadCountReport(ctx, args),
});

/** The Incomes minus the Expenses of a period, by category. A null limit is no limit. */
export const money = farmQuery({
  args: { from: v.union(v.string(), v.null()), to: v.union(v.string(), v.null()) },
  handler: (ctx, args) => getMoneyReport(ctx, args),
});

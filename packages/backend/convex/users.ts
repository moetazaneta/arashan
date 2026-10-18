import { getViewer, registerUser, setOperator as setOperatorCommand } from "@arashan/core";
import { v } from "convex/values";

import { command, query, systemCommand } from "./lib/functions";

/** The User who is logged in and the User's Farms, or null before `register`. */
export const viewer = query({
  args: {},
  handler: (ctx) => getViewer(ctx),
});

/** Makes the User at the first log-in, and keeps the username up to date. The client calls it. */
export const register = command({
  args: {},
  handler: (ctx) => registerUser(ctx),
});

/**
 * Makes a User the Operator, or takes the flag away. Only the CLI can run it, with the Clerk user id
 * of the person (Clerk dashboard → Users):
 * `vp -C packages/backend exec convex run users:setOperator '{"clerkUserId": "user_…"}'`.
 */
export const setOperator = systemCommand({
  args: { clerkUserId: v.string(), isOperator: v.optional(v.boolean()) },
  handler: (ctx, args) =>
    setOperatorCommand(ctx, {
      providerUserId: args.clerkUserId,
      isOperator: args.isOperator ?? true,
    }),
});

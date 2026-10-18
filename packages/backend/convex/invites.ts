import { acceptInvite, previewInvite } from "@arashan/core";
import { v } from "convex/values";

import { command, query } from "./lib/functions";

/** The Farm and the Role that an invite link offers to the User who opened it. */
export const preview = query({
  args: { token: v.string() },
  handler: (ctx, args) => previewInvite(ctx, args),
});

/** The User who opened the invite link becomes a Member of its Farm. */
export const accept = command({
  args: { token: v.string() },
  handler: (ctx, args) => acceptInvite(ctx, args),
});

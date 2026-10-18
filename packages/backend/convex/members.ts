import {
  changeMemberRole,
  inviteMember,
  listMembers,
  type MembershipId,
  finishMemberPassword,
  type PasswordResetId,
  removeMember,
  requestMemberPassword,
} from "@arashan/core";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { type ClerkPasswordResult, setClerkPassword } from "./lib/clerk";
import {
  farmAction,
  farmCommand,
  farmQuery,
  internalFarmCommand,
  systemCommand,
} from "./lib/functions";

// An Admin manages the Members of the Farm. The ids of Memberships are strings, not
// `v.id("memberships")`: the core gets its own ids, and an unknown id is a domain error.

const role = v.union(v.literal("admin"), v.literal("editor"));

/** The Members of the Farm, also the removed ones, for an Admin. */
export const list = farmQuery({
  args: {},
  handler: (ctx) => listMembers(ctx),
});

/** An Admin makes a one-time invite link for a new Editor. */
export const invite = farmCommand({
  args: {},
  handler: (ctx) => inviteMember(ctx),
});

/** An Admin changes the Role of a Member. */
export const changeRole = farmCommand({
  args: { membershipId: v.string(), role },
  handler: (ctx, args) =>
    changeMemberRole(ctx, { membershipId: args.membershipId as MembershipId, role: args.role }),
});

/** An Admin removes a Member from the Farm: the Membership becomes Archived. */
export const remove = farmCommand({
  args: { membershipId: v.string() },
  handler: (ctx, args) => removeMember(ctx, { membershipId: args.membershipId as MembershipId }),
});

/** The first step of `setPassword`: the rules, and a pending reset with its audit entry. */
export const requestPassword = internalFarmCommand({
  args: { membershipId: v.string(), password: v.string() },
  handler: (ctx, args) =>
    requestMemberPassword(ctx, {
      membershipId: args.membershipId as MembershipId,
      password: args.password,
    }),
});

/** The last step of `setPassword`: the outcome of the call to Clerk, with its audit entry. */
export const finishPassword = systemCommand({
  args: {
    passwordResetId: v.string(),
    outcome: v.union(v.literal("done"), v.literal("failed"), v.literal("unknown")),
  },
  handler: (ctx, args) =>
    finishMemberPassword(ctx, {
      passwordResetId: args.passwordResetId as PasswordResetId,
      outcome: args.outcome,
    }),
});

/**
 * An Admin sets a new password for a Member, through the Clerk Backend API. Clerk ends the
 * Member's sessions. The pending reset is written before the call, in one transaction with the
 * rules, and blocks the account changes of the Member until the call ends (`requestMemberPassword`).
 * The outcome is written after the call, whatever it is: an unknown one keeps the block.
 */
export const setPassword = farmAction({
  args: { membershipId: v.string(), password: v.string() },
  // The return type breaks the cycle of the inferred types of this module and `internal`.
  handler: async (ctx, { farmId, membershipId, password }): Promise<void> => {
    const { passwordResetId, providerUserId } = await ctx.runMutation(
      internal.members.requestPassword,
      { farmId, membershipId, password },
    );
    const result = await setClerkPassword(providerUserId, password).catch(
      (error: unknown): ClerkPasswordResult => ({
        outcome: "unknown",
        error: error instanceof Error ? error : new Error(String(error)),
      }),
    );
    await ctx.runMutation(internal.members.finishPassword, {
      passwordResetId,
      outcome: result.outcome,
    });
    if (result.outcome !== "done") throw result.error;
  },
});

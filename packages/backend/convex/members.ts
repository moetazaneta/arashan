import {
  changeMemberRole,
  inviteMember,
  listMembers,
  type MembershipId,
  prepareMemberPassword,
  recordMemberPassword,
  removeMember,
} from "@arashan/core";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { setClerkPassword } from "./lib/clerk";
import {
  farmAction,
  farmCommand,
  farmQuery,
  internalFarmCommand,
  internalFarmQuery,
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

/** The rules of a new password, and the Clerk user id of the Member. Only `setPassword` calls it. */
export const passwordTarget = internalFarmQuery({
  args: { membershipId: v.string(), password: v.string() },
  handler: (ctx, args) =>
    prepareMemberPassword(ctx, {
      membershipId: args.membershipId as MembershipId,
      password: args.password,
    }),
});

/** The audit entry of a new password. Only `setPassword` calls it, after Clerk set the password. */
export const recordPassword = internalFarmCommand({
  args: { membershipId: v.string() },
  handler: (ctx, args) =>
    recordMemberPassword(ctx, { membershipId: args.membershipId as MembershipId }),
});

/**
 * An Admin sets a new password for a Member, through the Clerk Backend API. Clerk ends the
 * Member's sessions. The audit entry comes after Clerk set the password, so that the history never
 * shows a password that was not set.
 */
export const setPassword = farmAction({
  args: { membershipId: v.string(), password: v.string() },
  // The return type breaks the cycle of the inferred types of this module and `internal`.
  handler: async (ctx, { farmId, membershipId, password }): Promise<void> => {
    const { providerUserId } = await ctx.runQuery(internal.members.passwordTarget, {
      farmId,
      membershipId,
      password,
    });
    await setClerkPassword(providerUserId, password);
    await ctx.runMutation(internal.members.recordPassword, { farmId, membershipId });
  },
});

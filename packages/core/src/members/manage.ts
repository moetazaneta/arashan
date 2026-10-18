import { authorize } from "../access/permissions";
import { recordAudit, recordFarmAudit } from "../audit/audit";
import type { FarmCommandContext, FarmQueryContext, SystemContext } from "../context";
import { DomainError } from "../errors";
import type { MembershipId, PasswordResetId, UserId } from "../ids";
import { issueInvite, type NewInvite } from "./commands";
import type { Membership, Role } from "./membership";

// An Admin manages the Members of the Farm: invites Editors, changes Roles, removes Members, and sets
// a new password for a Member who cannot log in. A Farm always keeps at least one Admin.

/** A Member of the Farm, as the Admin's list «Участники» shows it. */
export interface MemberSummary {
  membershipId: MembershipId;
  userId: UserId;
  username: string;
  role: Role;
  /** When an Admin removed the Member, or null for a Member now. */
  archivedAt: number | null;
  /** True if an Admin can set a new password for the Member (see `requestMemberPassword`). */
  canSetPassword: boolean;
}

/** The shortest and the longest password that an Admin can set. */
export const minPasswordLength = 8;
export const maxPasswordLength = 72;

/**
 * The Members of the Farm, for an Admin: the Members now by username, then the removed ones, the
 * last removed first.
 */
export async function listMembers(ctx: FarmQueryContext): Promise<MemberSummary[]> {
  authorize(ctx.member, "member.list", { farmId: ctx.farm.id });
  const memberships = await ctx.repos.memberships.list();
  const members = await Promise.all(
    memberships.map(async (membership): Promise<MemberSummary> => {
      const user = await ctx.repos.users.get(membership.userId);
      return {
        membershipId: membership.id,
        userId: membership.userId,
        username: user?.username ?? "",
        role: membership.role,
        archivedAt: membership.archivedAt ?? null,
        canSetPassword:
          membership.archivedAt === undefined && (await passwordAllowed(ctx, membership)),
      };
    }),
  );
  return members.sort((a, b) => {
    if (a.archivedAt === null && b.archivedAt === null) {
      return a.username.localeCompare(b.username);
    }
    if (a.archivedAt === null) return -1;
    if (b.archivedAt === null) return 1;
    return b.archivedAt - a.archivedAt;
  });
}

/**
 * An Admin makes a one-time invite link for a new Editor, valid for 7 days. The links of a Farm are
 * independent: a new one does not stop the older ones, so that an Admin can invite many people.
 */
export async function inviteMember(ctx: FarmCommandContext): Promise<NewInvite> {
  authorize(ctx.member, "member.invite", { farmId: ctx.farm.id });
  const { inviteId, token, expiresAt } = await issueInvite(
    ctx,
    (invite) => ctx.repos.invites.insert(invite),
    {
      role: "editor",
      createdBy: ctx.member.userId,
    },
  );
  await recordFarmAudit(ctx, {
    command: "member.invite",
    target: { kind: "Invite", id: inviteId },
  });
  return { token, expiresAt };
}

/** An Admin changes the Role of a Member. The last Admin of the Farm stays an Admin. */
export async function changeMemberRole(
  ctx: FarmCommandContext,
  input: { membershipId: MembershipId; role: Role },
): Promise<void> {
  authorize(ctx.member, "member.changeRole", { farmId: ctx.farm.id });
  const membership = await activeMembership(ctx, input.membershipId);
  if (membership.role === input.role) return;
  if (membership.role === "admin") await requireOtherAdmin(ctx, membership);
  await ctx.repos.memberships.setRole(membership.id, input.role);
  await recordFarmAudit(ctx, {
    command: "member.changeRole",
    target: { kind: "Membership", id: membership.id },
  });
}

/**
 * An Admin removes a Member: the Membership becomes Archived, and the User cannot open the Farm. The
 * Member stays in the history and in the old records. The last Admin of the Farm cannot be removed.
 */
export async function removeMember(
  ctx: FarmCommandContext,
  input: { membershipId: MembershipId },
): Promise<void> {
  authorize(ctx.member, "member.remove", { farmId: ctx.farm.id });
  const membership = await activeMembership(ctx, input.membershipId);
  if (membership.role === "admin") await requireOtherAdmin(ctx, membership);
  await ctx.repos.memberships.archive(membership.id, ctx.now());
  await recordFarmAudit(ctx, {
    command: "member.remove",
    target: { kind: "Membership", id: membership.id },
  });
}

/**
 * The first step of a new password for a Member: checks the rules, and writes a pending
 * `PasswordReset`. The backend then asks the identity provider to set the password, and
 * `finishMemberPassword` writes the outcome.
 *
 * An Admin sets the password of another Member of the Farm (ADR 0003), for example of a Member who
 * has no email and forgot the password. The account of a User is the same in all Farms, so an Admin
 * of one Farm must not take the account of a Member of another Farm (now or before) or of the Operator:
 * for them it throws `member.passwordNotAllowed`, and also for the Admin's own account. While the
 * reset is pending, the User cannot join another Farm or become the Operator (see
 * `requireNoPendingPasswordReset`), so the rule still holds when the provider sets the password.
 */
export async function requestMemberPassword(
  ctx: FarmCommandContext,
  input: { membershipId: MembershipId; password: string },
): Promise<{ passwordResetId: PasswordResetId; providerUserId: string }> {
  authorize(ctx.member, "member.setPassword", { farmId: ctx.farm.id });
  const membership = await activeMembership(ctx, input.membershipId);
  if (!(await passwordAllowed(ctx, membership))) {
    throw new DomainError("member.passwordNotAllowed");
  }
  const { length } = input.password;
  if (length < minPasswordLength || length > maxPasswordLength || input.password.trim() === "") {
    throw new DomainError("member.passwordInvalid");
  }
  const providerUserId = await ctx.repos.users.providerUserId(membership.userId);
  if (providerUserId === null) throw new DomainError("member.notFound");
  const passwordResetId = await ctx.repos.passwordResets.insert({
    membershipId: membership.id,
    userId: membership.userId,
    actorId: ctx.member.userId,
    createdAt: ctx.now(),
  });
  await recordFarmAudit(ctx, {
    command: "member.requestPassword",
    target: { kind: "Membership", id: membership.id },
  });
  return { passwordResetId, providerUserId };
}

/**
 * The last step of a new password: the outcome of the call to the identity provider, with its audit
 * entry. Only the backend calls it, after the call: it checks no permission again, because the
 * password is already set (or not), and the history must show it whatever happened in the meantime.
 * A reset that is not pending stays as it is.
 */
export async function finishMemberPassword(
  ctx: SystemContext,
  input: { passwordResetId: PasswordResetId; outcome: "done" | "failed" },
): Promise<void> {
  const reset = await ctx.repos.passwordResets.get(input.passwordResetId);
  if (reset === null || reset.status !== "pending") return;
  await ctx.repos.passwordResets.finish(reset.id, input.outcome);
  await recordAudit(ctx, {
    actorId: reset.actorId,
    farmId: reset.farmId,
    command: input.outcome === "done" ? "member.setPassword" : "member.setPasswordFailed",
    target: { kind: "Membership", id: reset.membershipId },
  });
}

/** The Membership of the Farm with the id, if it is not Archived; else `member.notFound`. */
async function activeMembership(
  ctx: FarmQueryContext | FarmCommandContext,
  id: MembershipId,
): Promise<Membership> {
  const membership = await ctx.repos.memberships.get(id);
  if (membership === null || membership.archivedAt !== undefined) {
    throw new DomainError("member.notFound");
  }
  return membership;
}

/** Throws `member.lastAdmin` if the Admin is the only Admin of the Farm. */
async function requireOtherAdmin(ctx: FarmCommandContext, admin: Membership): Promise<void> {
  const memberships = await ctx.repos.memberships.list();
  const otherAdmin = memberships.some(
    (m) => m.id !== admin.id && m.role === "admin" && m.archivedAt === undefined,
  );
  if (!otherAdmin) throw new DomainError("member.lastAdmin");
}

/**
 * True if an Admin can set the password of the Member: not the Admin's own, not the Operator's, and
 * not of a User who is or was a Member of another Farm too. A removed Member of another Farm counts,
 * because that Farm can invite the User again.
 */
async function passwordAllowed(ctx: FarmQueryContext, membership: Membership): Promise<boolean> {
  if (membership.userId === ctx.member.userId) return false;
  const user = await ctx.repos.users.get(membership.userId);
  if (user === null || user.isOperator) return false;
  return (await ctx.repos.users.countFarms(membership.userId)) === 1;
}

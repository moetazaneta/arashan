import { requireUser } from "../access/session";
import { recordAudit } from "../audit/audit";
import type { CommandContext, QueryContext } from "../context";
import { DomainError } from "../errors";
import type { FarmId, InviteId, UserId } from "../ids";
import { requireNoPendingPasswordReset } from "./password-reset";
import { type Invite, type InviteDraft, inviteLifetimeMs, type Tokens } from "./invite";
import type { Role } from "./membership";

/** A new invite link: the token goes into the URL, and is shown only once. */
export interface NewInvite {
  token: string;
  expiresAt: number;
}

/**
 * Makes a one-time invite link: `insert` writes the Invite to its Farm. The caller writes the audit
 * entry of its command, with the id of the Invite.
 */
export async function issueInvite(
  ctx: { tokens: Tokens; now(): number },
  insert: (invite: InviteDraft) => Promise<InviteId>,
  input: { role: Role; createdBy: UserId },
): Promise<NewInvite & { inviteId: InviteId }> {
  const token = ctx.tokens.newToken();
  const expiresAt = ctx.now() + inviteLifetimeMs;
  const inviteId = await insert({
    role: input.role,
    tokenHash: await ctx.tokens.hash(token),
    expiresAt,
    createdBy: input.createdBy,
  });
  return { inviteId, token, expiresAt };
}

/**
 * The Invite of the token, if the User who makes the request can use it now. Throws
 * `invite.notFound` for an unknown link, `invite.used`, `invite.expired` (also for a link that a
 * newer one replaced: for the User, both only stopped working), and `invite.alreadyMember` if the
 * User is already a Member of the Farm.
 */
async function usableInvite(ctx: QueryContext | CommandContext, token: string) {
  const user = await requireUser(ctx);
  const invite = await ctx.repos.invites.findByTokenHash(await ctx.tokens.hash(token));
  const farm = invite === null ? null : await ctx.repos.farms.get(invite.farmId);
  if (invite === null || farm === null) throw new DomainError("invite.notFound");
  if (invite.used !== undefined) throw new DomainError("invite.used");
  if (invite.revokedAt !== undefined || ctx.now() >= invite.expiresAt) {
    throw new DomainError("invite.expired");
  }
  const membership = await ctx.repos.memberships.find(user.id, invite.farmId);
  if (membership !== null && membership.archivedAt === undefined) {
    throw new DomainError("invite.alreadyMember");
  }
  return { user, invite, farm, membership };
}

/** What an invite link offers: the Farm and the Role. The same errors as `acceptInvite`. */
export async function previewInvite(
  ctx: QueryContext,
  input: { token: string },
): Promise<{ farmName: string; role: Role; expiresAt: number }> {
  const { invite, farm } = await usableInvite(ctx, input.token);
  return { farmName: farm.name, role: invite.role, expiresAt: invite.expiresAt };
}

/**
 * The User who opened the invite link becomes a Member of its Farm, with the Role of the Invite.
 * The link works only once. A removed Member who joins again gets the old Membership back, so that
 * a User has one Membership in a Farm and its history stays in one place.
 */
export async function acceptInvite(
  ctx: CommandContext,
  input: { token: string },
): Promise<{ farmId: FarmId }> {
  const { user, invite, membership } = await usableInvite(ctx, input.token);
  await requireNoPendingPasswordReset(ctx, user.id);
  await ctx.repos.invites.markUsed(invite.id, { at: ctx.now(), by: user.id });
  let membershipId = membership?.id;
  if (membershipId === undefined) {
    membershipId = await ctx.repos.memberships.insert({
      farmId: invite.farmId,
      userId: user.id,
      role: invite.role,
    });
  } else {
    await ctx.repos.memberships.restore(membershipId, invite.role);
  }
  await recordAudit(ctx, {
    actorId: user.id,
    farmId: invite.farmId,
    command: "invite.accept",
    target: { kind: "Membership", id: membershipId },
  });
  return { farmId: invite.farmId };
}

/** Revokes the open invite links of the Farm, so that only a newer link works. */
export async function revokeOpenInvites(ctx: CommandContext, farmId: FarmId): Promise<void> {
  const open: Invite[] = await ctx.repos.invites.listOpen(farmId);
  for (const invite of open) await ctx.repos.invites.markRevoked(invite.id, ctx.now());
}

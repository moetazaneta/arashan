import { requireUser } from "../access/session";
import { recordAudit } from "../audit/audit";
import type { CommandContext, QueryContext } from "../context";
import { DomainError } from "../errors";
import type { FarmId, UserId } from "../ids";
import { type Invite, inviteLifetimeMs } from "./invite";
import type { Role } from "./membership";

/** A new invite link: the token goes into the URL, and is shown only once. */
export interface NewInvite {
  token: string;
  expiresAt: number;
}

/** Makes a one-time invite link to the Farm. The caller writes the audit entry of its command. */
export async function issueInvite(
  ctx: CommandContext,
  input: { farmId: FarmId; role: Role; createdBy: UserId },
): Promise<NewInvite> {
  const token = ctx.tokens.newToken();
  const expiresAt = ctx.now() + inviteLifetimeMs;
  await ctx.repos.invites.insert({
    farmId: input.farmId,
    role: input.role,
    tokenHash: await ctx.tokens.hash(token),
    expiresAt,
    createdBy: input.createdBy,
  });
  return { token, expiresAt };
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
  if ((await ctx.repos.memberships.find(user.id, invite.farmId)) !== null) {
    throw new DomainError("invite.alreadyMember");
  }
  return { user, invite, farm };
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
 * The link works only once.
 */
export async function acceptInvite(
  ctx: CommandContext,
  input: { token: string },
): Promise<{ farmId: FarmId }> {
  const { user, invite } = await usableInvite(ctx, input.token);
  await ctx.repos.invites.markUsed(invite.id, { at: ctx.now(), by: user.id });
  const membershipId = await ctx.repos.memberships.insert({
    farmId: invite.farmId,
    userId: user.id,
    role: invite.role,
  });
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

import { recordAudit } from "../audit/audit";
import type { CommandContext, QueryContext, SystemContext } from "../context";
import { DomainError } from "../errors";
import type { FarmId, UserId } from "../ids";
import { requireNoPendingPasswordReset } from "../members/password-reset";
import type { Role } from "../members/membership";
import type { User } from "./user";

/** The User who is logged in, and the Farms of which the User is a Member. */
export interface Viewer {
  user: User;
  /** The Farms of the User, by name. */
  farms: { id: FarmId; name: string; role: Role }[];
}

/**
 * The User who makes the request and the User's Farms, or null if nobody is logged in or the app has
 * no User for the person yet (`registerUser` makes it).
 */
export async function getViewer(ctx: QueryContext): Promise<Viewer | null> {
  if (ctx.identity === null) return null;
  const user = await ctx.repos.users.findByIdentity(ctx.identity.key);
  if (user === null) return null;
  const farms: Viewer["farms"] = [];
  for (const membership of await ctx.repos.memberships.listForUser(user.id)) {
    const farm = await ctx.repos.farms.get(membership.farmId);
    if (farm !== null) farms.push({ id: farm.id, name: farm.name, role: membership.role });
  }
  farms.sort((a, b) => a.name.localeCompare(b.name));
  return { user, farms };
}

/**
 * Makes the User at the first log-in of a person, and keeps the username the same as at the
 * identity provider at each later log-in. It writes nothing if nothing changed.
 */
export async function registerUser(ctx: CommandContext): Promise<UserId> {
  if (ctx.identity === null) throw new DomainError("auth.signedOut");
  const username = ctx.identity.username?.trim() ?? "";
  if (username === "") throw new DomainError("user.usernameMissing");

  const user = await ctx.repos.users.findByIdentity(ctx.identity.key);
  if (user === null) {
    const id = await ctx.repos.users.insert({
      identityKey: ctx.identity.key,
      providerUserId: ctx.identity.providerUserId,
      username,
    });
    await recordAudit(ctx, {
      actorId: id,
      farmId: null,
      command: "user.register",
      target: { kind: "User", id },
    });
    return id;
  }
  if (user.username !== username) {
    await ctx.repos.users.updateUsername(user.id, username);
    await recordAudit(ctx, {
      actorId: user.id,
      farmId: null,
      command: "user.updateUsername",
      target: { kind: "User", id: user.id },
    });
  }
  return user.id;
}

/**
 * Makes a User the Operator, or takes the flag away, and gives the User. Only the CLI runs it: the
 * Operator is not a Role in a Farm, and no screen gives it. The CLI names the User by the id at the
 * identity provider, not by the username: the app copies a username only at a log-in, so a stored
 * username can belong to another person now, and the flag must never go to the wrong person.
 */
export async function setOperator(
  ctx: SystemContext,
  input: { providerUserId: string; isOperator: boolean },
): Promise<{ userId: UserId; username: string }> {
  const user = await ctx.repos.users.findByProviderUserId(input.providerUserId.trim());
  if (user === null) throw new DomainError("user.notFound");
  if (user.isOperator !== input.isOperator) {
    if (input.isOperator) await requireNoPendingPasswordReset(ctx, user.id);
    await ctx.repos.users.setOperator(user.id, input.isOperator);
    await recordAudit(ctx, {
      actorId: null,
      farmId: null,
      command: "user.setOperator",
      target: { kind: "User", id: user.id },
    });
  }
  return { userId: user.id, username: user.username };
}

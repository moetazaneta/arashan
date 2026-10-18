import type { QueryContext } from "../context";
import { DomainError } from "../errors";
import type { Farm } from "../farms/farm";
import type { FarmId } from "../ids";
import type { User } from "../users/user";
import type { Member } from "./permissions";

/**
 * The User who makes the request. Throws `auth.signedOut` if nobody is logged in, and
 * `user.notRegistered` if the person is logged in but the app has no User for them yet.
 */
export async function requireUser(ctx: Pick<QueryContext, "identity" | "repos">): Promise<User> {
  if (ctx.identity === null) throw new DomainError("auth.signedOut");
  const user = await ctx.repos.users.findByIdentity(ctx.identity.key);
  if (user === null) throw new DomainError("user.notRegistered");
  return user;
}

/** The Operator who makes the request. Throws `auth.operatorOnly` for any other User. */
export async function requireOperator(
  ctx: Pick<QueryContext, "identity" | "repos">,
): Promise<User> {
  const user = await requireUser(ctx);
  if (!user.isOperator) throw new DomainError("auth.operatorOnly");
  return user;
}

/**
 * The Member who makes a request to the Farm, and the Farm. Each request of a Farm comes through
 * here. Throws `farm.notMember` if the User is not a Member of the Farm, if an Admin removed the
 * User from it, or if the Farm does not exist: the error is the same, so a request tells nothing about the Farms of others. The Operator is
 * no exception.
 */
export async function enterFarm(
  ctx: Pick<QueryContext, "identity" | "repos">,
  farmId: FarmId,
): Promise<{ member: Member; farm: Farm }> {
  const user = await requireUser(ctx);
  const found = await ctx.repos.memberships.find(user.id, farmId);
  // A removed Member has an Archived Membership, which gives no access.
  const membership = found?.archivedAt === undefined ? found : null;
  const farm = membership === null ? null : await ctx.repos.farms.get(farmId);
  if (membership === null || farm === null) throw new DomainError("farm.notMember");
  return {
    member: { membershipId: membership.id, userId: user.id, farmId, role: membership.role },
    farm,
  };
}

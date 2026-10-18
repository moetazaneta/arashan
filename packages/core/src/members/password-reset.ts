import { DomainError } from "../errors";
import type { FarmId, MembershipId, PasswordResetId, UserId } from "../ids";

/**
 * An unfinished reset blocks the account changes of its User for this time. A reset is unfinished
 * when nobody knows if the identity provider set the password: it is `pending` (the call runs, or
 * the action stopped during it) or `unknown` (the call timed out, or the provider failed). The
 * provider can still set the password after such an answer, so the block lasts much longer than any
 * call. A normal reset finishes in seconds and blocks nothing after that.
 */
export const passwordResetLifetimeMs = 24 * 60 * 60 * 1000;

/**
 * An Admin's request to set a new password for a Member, through the identity provider. The request
 * is written before the call to the provider, so that the account of the User cannot change in the
 * meantime (see `requestMemberPassword`), and so that the audit log shows each attempt.
 */
/** What the identity provider did with a new password. */
export type PasswordResetOutcome = "done" | "failed" | "unknown";

export interface PasswordReset {
  id: PasswordResetId;
  farmId: FarmId;
  /** The Membership of the Member who gets the new password. */
  membershipId: MembershipId;
  /** The User who gets the new password. */
  userId: UserId;
  /** The Admin who asked for it. */
  actorId: UserId;
  createdAt: number;
  /**
   * `pending` until the identity provider answers. Then `done` (it set the password), `failed` (it
   * refused, and changed nothing), or `unknown` (no clear answer: it can still set the password).
   */
  status: "pending" | PasswordResetOutcome;
}

/** Reads and finishes the password resets of all Farms. Each method hides the Deleted ones. */
export interface PasswordResetRepository {
  get(id: PasswordResetId): Promise<PasswordReset | null>;
  /** The resets of the User, in all Farms, that are `pending` or `unknown`. */
  listUnfinished(userId: UserId): Promise<PasswordReset[]>;
  finish(id: PasswordResetId, outcome: PasswordResetOutcome): Promise<void>;
}

/** Makes the password resets of one Farm. The backend binds it to the Farm (`FarmRepositories`). */
export interface FarmPasswordResetRepository {
  insert(reset: Omit<PasswordReset, "id" | "farmId" | "status">): Promise<PasswordResetId>;
}

/**
 * Throws `user.passwordResetPending` if an Admin is setting a new password for the User now, or set
 * one with an unknown outcome less than `passwordResetLifetimeMs` ago. A
 * command that lets the User into another Farm, or makes the User the Operator, calls it first: else
 * the Admin of one Farm could get the password of an account that has more access.
 */
export async function requireNoPendingPasswordReset(
  ctx: { repos: { passwordResets: PasswordResetRepository }; now(): number },
  userId: UserId,
): Promise<void> {
  const since = ctx.now() - passwordResetLifetimeMs;
  const unfinished = await ctx.repos.passwordResets.listUnfinished(userId);
  if (unfinished.some((reset) => reset.createdAt > since)) {
    throw new DomainError("user.passwordResetPending");
  }
}

import { DomainError } from "../errors";
import type { FarmId, MembershipId, PasswordResetId, UserId } from "../ids";

/**
 * A pending reset ends after this time, also if nobody finished it (for example, the action that
 * called the identity provider stopped). The backend gives the call to the provider a much shorter
 * time, so a reset that is still pending blocks the account changes of the User for the whole call.
 */
export const passwordResetLifetimeMs = 2 * 60 * 1000;

/**
 * An Admin's request to set a new password for a Member, through the identity provider. The request
 * is written before the call to the provider, so that the account of the User cannot change in the
 * meantime (see `requestMemberPassword`), and so that the audit log shows each attempt.
 */
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
  /** `pending` until the identity provider answers: then `done`, or `failed`. */
  status: "pending" | "done" | "failed";
}

/** Reads and finishes the password resets of all Farms. Each method hides the Deleted ones. */
export interface PasswordResetRepository {
  get(id: PasswordResetId): Promise<PasswordReset | null>;
  /** True if the User has a reset that is pending and was made after `since`. */
  hasPending(userId: UserId, since: number): Promise<boolean>;
  finish(id: PasswordResetId, status: "done" | "failed"): Promise<void>;
}

/** Makes the password resets of one Farm. The backend binds it to the Farm (`FarmRepositories`). */
export interface FarmPasswordResetRepository {
  insert(reset: Omit<PasswordReset, "id" | "farmId" | "status">): Promise<PasswordResetId>;
}

/**
 * Throws `user.passwordResetPending` if an Admin is setting a new password for the User now. A
 * command that lets the User into another Farm, or makes the User the Operator, calls it first: else
 * the Admin of one Farm could get the password of an account that has more access.
 */
export async function requireNoPendingPasswordReset(
  ctx: { repos: { passwordResets: PasswordResetRepository }; now(): number },
  userId: UserId,
): Promise<void> {
  if (await ctx.repos.passwordResets.hasPending(userId, ctx.now() - passwordResetLifetimeMs)) {
    throw new DomainError("user.passwordResetPending");
  }
}

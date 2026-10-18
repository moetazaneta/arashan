import { DomainError } from "../errors";
import type { FarmId, MembershipId, UserId } from "../ids";
import type { Role } from "../members/membership";

/** A User who acts in one Farm, with the Role of the User's Membership in it. */
export interface Member {
  membershipId: MembershipId;
  userId: UserId;
  farmId: FarmId;
  role: Role;
}

/**
 * The permission matrix: the Roles that can do each action. An Admin manages the Farm and its
 * Members; an Editor does all other work. A new action adds its row here, and the tests of the matrix
 * check each row.
 */
export const permissions = {
  /** See the Farm and its settings. */
  "farm.view": ["admin", "editor"],
  /** Change the currency, the time zone and the lamb age of the Farm. */
  "farm.updateSettings": ["admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Action = keyof typeof permissions;

/** Anything that belongs to one Farm: the Farm itself, or one of its records. */
export interface Target {
  farmId: FarmId;
}

/**
 * True if the Member can do the action to the target. A Member never acts on a record of another
 * Farm, whatever the Role.
 */
export function can(actor: Member, action: Action, target: Target): boolean {
  if (actor.farmId !== target.farmId) return false;
  return (permissions[action] as readonly Role[]).includes(actor.role);
}

/** Throws `access.denied` if the Member cannot do the action to the target. */
export function authorize(actor: Member, action: Action, target: Target): void {
  if (!can(actor, action, target)) throw new DomainError("access.denied");
}

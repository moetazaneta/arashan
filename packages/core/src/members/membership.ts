import type { FarmId, MembershipId, UserId } from "../ids";

/** What a Member can do in a Farm. The permission matrix is in `access/permissions.ts`. */
export const roles = ["admin", "editor"] as const;
export type Role = (typeof roles)[number];

/** A User's access to one Farm, with one Role. */
export interface Membership {
  id: MembershipId;
  farmId: FarmId;
  userId: UserId;
  role: Role;
}

/** Reads Memberships. Each method hides Deleted Memberships (ADR 0005). */
export interface MembershipReader {
  /** The Membership of the User in the Farm, or null if the User is not a Member of it. */
  find(userId: UserId, farmId: FarmId): Promise<Membership | null>;
  /** The Memberships of the User, in all Farms. */
  listForUser(userId: UserId): Promise<Membership[]>;
  /** True if the Farm has at least one Member. */
  hasMembers(farmId: FarmId): Promise<boolean>;
}

/** Reads and writes Memberships. Nothing erases a Membership. */
export interface MembershipRepository extends MembershipReader {
  insert(membership: Omit<Membership, "id">): Promise<MembershipId>;
}

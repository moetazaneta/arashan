import type { FarmId, MembershipId, UserId } from "../ids";
import type { User } from "../users/user";

/** What a Member can do in a Farm. The permission matrix is in `access/permissions.ts`. */
export const roles = ["admin", "editor"] as const;
export type Role = (typeof roles)[number];

/**
 * A User's access to one Farm, with one Role. A User has at most one Membership in a Farm. When an
 * Admin removes the Member, the Membership becomes Archived: it gives no access, but the history and
 * the old records of the Farm still show the Member.
 */
export interface Membership {
  id: MembershipId;
  farmId: FarmId;
  userId: UserId;
  role: Role;
  /** When an Admin removed the Member, in milliseconds since the Unix epoch. */
  archivedAt?: number;
}

/** Reads Memberships. Each method hides Deleted Memberships (ADR 0005). */
export interface MembershipReader {
  /**
   * The Membership of the User in the Farm, also an Archived one, or null if the User was never a
   * Member of it.
   */
  find(userId: UserId, farmId: FarmId): Promise<Membership | null>;
  /** The Memberships of the User in all Farms, without the Archived ones. */
  listForUser(userId: UserId): Promise<Membership[]>;
  /** True if the Farm has at least one Member: a Membership that is not Archived. */
  hasMembers(farmId: FarmId): Promise<boolean>;
}

/** Reads and writes Memberships. Nothing erases a Membership. */
export interface MembershipRepository extends MembershipReader {
  insert(membership: Omit<Membership, "id" | "archivedAt">): Promise<MembershipId>;
  /** Makes an Archived Membership active again, with the Role. */
  restore(id: MembershipId, role: Role): Promise<void>;
}

/**
 * Reads the Memberships of one Farm. The backend binds it to the Farm (`FarmReaders` in
 * context.ts), so it never gives a Membership of another Farm. Each method hides Deleted
 * Memberships and shows the Archived ones.
 */
export interface FarmMembershipReader {
  /** All Memberships of the Farm, also the Archived ones. */
  list(): Promise<Membership[]>;
  /** The Membership of the Farm with this id, or null, also for a Membership of another Farm. */
  get(id: MembershipId): Promise<Membership | null>;
}

/** Reads and writes the Memberships of one Farm. */
export interface FarmMembershipRepository extends FarmMembershipReader {
  setRole(id: MembershipId, role: Role): Promise<void>;
  /** Makes the Membership Archived: the Member is removed from the Farm. */
  archive(id: MembershipId, archivedAt: number): Promise<void>;
}

/** What a request of one Farm reads about the Users of its Memberships. */
export interface MemberUserReader {
  /** The User, or null if there is none or it is Deleted. */
  get(id: UserId): Promise<User | null>;
  /** The id of the User at the identity provider, or null if there is no such User. */
  providerUserId(id: UserId): Promise<string | null>;
  /** The number of Farms of which the User is or was a Member: also the Archived Memberships. */
  countFarms(id: UserId): Promise<number>;
}

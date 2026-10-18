import type { FarmId, InviteId, UserId } from "../ids";
import type { Role } from "./membership";

/** An invite link is valid for 7 days after it is made. */
export const inviteLifetimeMs = 7 * 24 * 60 * 60 * 1000;

/**
 * A one-time invite link to a Farm. The link carries a random token; the app keeps only the hash of
 * the token, so the link cannot be read back from the database.
 */
export interface Invite {
  id: InviteId;
  farmId: FarmId;
  /** The Role that the new Member gets. */
  role: Role;
  tokenHash: string;
  /** After this time, in milliseconds since the Unix epoch, the link does not work. */
  expiresAt: number;
  /** The User who made the link. */
  createdBy: UserId;
  /** When a User used the link, and who. A used link does not work again. */
  used?: { at: number; by: UserId };
  /** When a newer link replaced this one. A revoked link does not work. */
  revokedAt?: number;
}

/** Reads Invites. Each method hides Deleted Invites (ADR 0005). */
export interface InviteReader {
  /** The Invite with this token hash, or null if there is none. */
  findByTokenHash(tokenHash: string): Promise<Invite | null>;
  /** The Invites of the Farm that are not used and not revoked, also the expired ones. */
  listOpen(farmId: FarmId): Promise<Invite[]>;
}

/** Reads and writes Invites. Nothing erases an Invite. */
export interface InviteRepository extends InviteReader {
  insert(invite: Omit<Invite, "id" | "used" | "revokedAt">): Promise<InviteId>;
  markUsed(id: InviteId, used: { at: number; by: UserId }): Promise<void>;
  markRevoked(id: InviteId, revokedAt: number): Promise<void>;
}

/** The fields of a new Invite that its maker gives. */
export type InviteDraft = Omit<Invite, "id" | "farmId" | "used" | "revokedAt">;

/** Makes the Invites of one Farm. The backend binds it to the Farm (`FarmRepositories`). */
export interface FarmInviteRepository {
  insert(invite: InviteDraft): Promise<InviteId>;
}

/** Makes the random tokens of invite links, and their hashes. The backend gives a real one. */
export interface Tokens {
  /** A new random token that nobody can guess, safe in a URL. */
  newToken(): string;
  /** The hash of a token, as the database keeps it. */
  hash(token: string): Promise<string>;
}

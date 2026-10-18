import type { UserId } from "../ids";

/**
 * What the identity provider says about the person who makes a request (ADR 0003). The core never
 * sees a password or a token.
 */
export interface Identity {
  /** A stable key of the person, unique across identity providers. One key belongs to one User. */
  key: string;
  /** The id of the person at the identity provider, for the calls to its API. */
  providerUserId: string;
  /** The username at the identity provider, or null if the provider gave none. */
  username: string | null;
}

/** A person who has an account and can log in to the app. */
export interface User {
  id: UserId;
  username: string;
  /** The Operator runs the app for all Farms and makes the Farms. It is not a Role in a Farm. */
  isOperator: boolean;
}

/** Reads Users. Each method hides Deleted Users (ADR 0005). */
export interface UserReader {
  /** The User, or null if there is none or it is Deleted. */
  get(id: UserId): Promise<User | null>;
  /** The User of this identity key, or null if the person never logged in. */
  findByIdentity(identityKey: string): Promise<User | null>;
  /**
   * The Users with this exact username. The app copies the username at each log-in, so two Users
   * can have the same old username until the next log-in of one of them.
   */
  listByUsername(username: string): Promise<User[]>;
}

/** Reads and writes Users. Nothing erases a User. */
export interface UserRepository extends UserReader {
  insert(user: { identityKey: string; providerUserId: string; username: string }): Promise<UserId>;
  updateUsername(id: UserId, username: string): Promise<void>;
  /** Only `setOperator`, a command of the CLI, changes the flag. */
  setOperator(id: UserId, isOperator: boolean): Promise<void>;
}

import type { Member } from "./access/permissions";
import type { AuditLog } from "./audit/audit";
import type { Farm, FarmReader, FarmRepository, FarmSettings } from "./farms/farm";
import type { InviteReader, InviteRepository, Tokens } from "./members/invite";
import type { MembershipReader, MembershipRepository } from "./members/membership";
import type { Identity, UserReader, UserRepository } from "./users/user";

/** The repositories that a query gets: they only read. */
export interface Readers {
  users: UserReader;
  farms: FarmReader;
  memberships: MembershipReader;
  invites: InviteReader;
}

/** The repositories that a command gets: they read and write, and the audit log. */
export interface Repositories {
  users: UserRepository;
  farms: FarmRepository;
  memberships: MembershipRepository;
  invites: InviteRepository;
  audit: AuditLog;
}

/** What a query gets from the backend. */
export interface QueryContext {
  /** The person who makes the request, or null if nobody is logged in. */
  identity: Identity | null;
  repos: Readers;
  /** The time now, in milliseconds since the Unix epoch. */
  now(): number;
  tokens: Pick<Tokens, "hash">;
}

/** What a command gets from the backend. */
export interface CommandContext {
  /** The person who makes the request, or null if nobody is logged in. */
  identity: Identity | null;
  repos: Repositories;
  /** The time now, in milliseconds since the Unix epoch. */
  now(): number;
  tokens: Tokens;
}

/**
 * The repositories of a request to one Farm. The backend binds each one to the Farm after
 * `enterFarm`, so that a read or a write never reaches a record of another Farm, and no method takes
 * the id of the Farm. A slice with records of a Farm (Sheep, Flocks…) adds its repository here.
 */
export interface FarmRepositories {
  /** The Farm of the request itself. */
  farm: { updateSettings(settings: FarmSettings): Promise<void> };
  audit: AuditLog;
}

/**
 * What a query of one Farm gets: the Member who makes the request and the Farm. Only `enterFarm`
 * makes them, after it checks the Membership, so a function that takes this context cannot skip the
 * check.
 */
export interface FarmQueryContext {
  member: Member;
  farm: Farm;
  now(): number;
}

/** What a command of one Farm gets. See `FarmQueryContext` and `FarmRepositories`. */
export interface FarmCommandContext {
  member: Member;
  farm: Farm;
  repos: FarmRepositories;
  now(): number;
}

/**
 * What a command of the CLI gets: an internal function that no client can call. It has no identity,
 * and its audit entries have no actor.
 */
export interface SystemContext {
  system: true;
  repos: Repositories;
  now(): number;
}

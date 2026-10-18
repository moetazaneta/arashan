import type { Member } from "./access/permissions";
import type { AuditLog, FarmAuditReader } from "./audit/audit";
import type { Farm, FarmReader, FarmRepository, FarmSettings } from "./farms/farm";
import type {
  FarmInviteRepository,
  InviteReader,
  InviteRepository,
  Tokens,
} from "./members/invite";
import type {
  FarmPasswordResetRepository,
  PasswordResetRepository,
} from "./members/password-reset";
import type {
  FarmMembershipReader,
  FarmMembershipRepository,
  MemberUserReader,
  MembershipReader,
  MembershipRepository,
} from "./members/membership";
import type {
  FarmFlockReader,
  FarmFlockRepository,
  FarmLocationReader,
  FarmLocationRepository,
  FarmShepherdReader,
  FarmShepherdRepository,
} from "./flocks/flock";
import type { FarmSheepReader, FarmSheepRepository } from "./sheep/sheep";
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
  passwordResets: PasswordResetRepository;
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
 * The readers of a query of one Farm. The backend binds each one to the Farm after `enterFarm`, so
 * that a read never reaches a record of another Farm, and no method takes the id of the Farm. A
 * slice with records of a Farm (Sheep, Flocks…) adds its reader here.
 */
export interface FarmReaders {
  memberships: FarmMembershipReader;
  users: MemberUserReader;
  sheep: FarmSheepReader;
  flocks: FarmFlockReader;
  locations: FarmLocationReader;
  shepherds: FarmShepherdReader;
  /** The audit log of the Farm, for the history of a record. */
  history: FarmAuditReader;
}

/**
 * The repositories of a command of one Farm, bound to the Farm as `FarmReaders` are. A slice with
 * records of a Farm adds its repository here.
 */
export interface FarmRepositories {
  /** The Farm of the request itself. */
  farm: { updateSettings(settings: FarmSettings): Promise<void> };
  memberships: FarmMembershipRepository;
  users: MemberUserReader;
  invites: FarmInviteRepository;
  sheep: FarmSheepRepository;
  flocks: FarmFlockRepository;
  locations: FarmLocationRepository;
  shepherds: FarmShepherdRepository;
  history: FarmAuditReader;
  passwordResets: FarmPasswordResetRepository;
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
  repos: FarmReaders;
  now(): number;
}

/** What a command of one Farm gets. See `FarmQueryContext` and `FarmRepositories`. */
export interface FarmCommandContext {
  member: Member;
  farm: Farm;
  repos: FarmRepositories;
  now(): number;
  tokens: Tokens;
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

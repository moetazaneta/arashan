// The public API of the core. The backend and the client import only from here.
export {
  authorize,
  can,
  permissions,
  type Action,
  type Member,
  type Target,
} from "./access/permissions";
export { enterFarm, requireOperator, requireUser } from "./access/session";
export { getAppVersion } from "./app/version";
export type { AuditEntry, AuditLog, CommandName, TargetKind } from "./audit/audit";
export type {
  CommandContext,
  FarmCommandContext,
  FarmQueryContext,
  FarmRepositories,
  QueryContext,
  Readers,
  Repositories,
  SystemContext,
} from "./context";
export { DomainError, errorCodes, isErrorCode, type ErrorCode } from "./errors";
export {
  createFarm,
  getFarm,
  inviteFarmAdmin,
  listFarms,
  updateFarmSettings,
  type FarmSummary,
} from "./farms/commands";
export {
  defaultLambAgeMonths,
  maxLambAgeMonths,
  minLambAgeMonths,
  type Farm,
  type FarmReader,
  type FarmRepository,
  type FarmSettings,
} from "./farms/farm";
export type { FarmId, Id, InviteId, MembershipId, UserId } from "./ids";
export { acceptInvite, previewInvite, type NewInvite } from "./members/commands";
export {
  inviteLifetimeMs,
  type Invite,
  type InviteReader,
  type InviteRepository,
  type Tokens,
} from "./members/invite";
export {
  roles,
  type Membership,
  type MembershipReader,
  type MembershipRepository,
  type Role,
} from "./members/membership";
export { getViewer, registerUser, setOperator, type Viewer } from "./users/commands";
export type { Identity, User, UserReader, UserRepository } from "./users/user";

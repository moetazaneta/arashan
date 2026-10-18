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
  FarmReaders,
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
export type { FarmId, Id, InviteId, MembershipId, PasswordResetId, UserId } from "./ids";
export { acceptInvite, previewInvite, type NewInvite } from "./members/commands";
export {
  inviteLifetimeMs,
  type FarmInviteRepository,
  type Invite,
  type InviteDraft,
  type InviteReader,
  type InviteRepository,
  type Tokens,
} from "./members/invite";
export {
  changeMemberRole,
  inviteMember,
  listMembers,
  maxPasswordLength,
  minPasswordLength,
  finishMemberPassword,
  removeMember,
  requestMemberPassword,
  type MemberSummary,
} from "./members/manage";
export {
  passwordResetLifetimeMs,
  type FarmPasswordResetRepository,
  type PasswordReset,
  type PasswordResetOutcome,
  type PasswordResetRepository,
} from "./members/password-reset";
export {
  roles,
  type FarmMembershipReader,
  type FarmMembershipRepository,
  type MemberUserReader,
  type Membership,
  type MembershipReader,
  type MembershipRepository,
  type Role,
} from "./members/membership";
export { getViewer, registerUser, setOperator, type Viewer } from "./users/commands";
export type { Identity, User, UserReader, UserRepository } from "./users/user";

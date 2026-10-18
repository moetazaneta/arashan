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
export type { AuditEntry, AuditLog, CommandName, FarmAuditReader, TargetKind } from "./audit/audit";
export {
  arashanBreedId,
  breedNameKey,
  maxBreedNameLength,
  type Breed,
  type FarmBreedReader,
  type FarmBreedRepository,
} from "./breeds/breed";
export {
  addBreed,
  deleteBreed,
  listBreeds,
  renameBreed,
  setBreedArchived,
  type BreedRow,
} from "./breeds/commands";
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
export { addMonths, dateAt, isCalendarDate, type CalendarDate } from "./dates";
export type { FileReader, FileStorage, StoredFile } from "./files/files";
export type {
  BreedId,
  FarmId,
  FileId,
  Id,
  InviteId,
  MembershipId,
  OwnerChangeId,
  PasswordResetId,
  SheepId,
  UserId,
} from "./ids";
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
export {
  arashanShare,
  compositionOf,
  isPureArashan,
  manualLimit,
  wholeShare,
  type BreedComposition,
  type BreedShare,
} from "./pedigree/composition";
export {
  cachedLookup,
  compositions,
  knownParents,
  requireParents,
  type PedigreeSheep,
  type SheepLookup,
} from "./pedigree/pedigree";
export {
  changeSheepOwner,
  deleteSheep,
  registerExternalSheep,
  registerSheep,
  requestPassportScanUpload,
  requireNotParent,
  requireOwner,
  updateSheep,
  type ExternalSheepRegistration,
  type PedigreeDetails,
  type RegisteredOrigin,
  type SheepDetails,
  type SheepRegistration,
  type SheepUpdate,
} from "./sheep/commands";
export {
  getSheep,
  getSheepHistory,
  getSheepPedigree,
  listParentOptions,
  listSheep,
  listSheepOwners,
  pedigreeDepth,
  type OwnerOption,
  type OwnerPeriod,
  type OwnerRef,
  type ParentOption,
  type PassportView,
  type PedigreeNode,
  type SheepCard,
  type SheepHistoryEntry,
  type SheepRef,
  type SheepRow,
} from "./sheep/queries";
export {
  grades,
  isLamb,
  isOnFarm,
  maxPassportNumberLength,
  maxScanBytes,
  maxSheepNameLength,
  maxSheepNotesLength,
  maxTagLength,
  maxWeightKg,
  origins,
  scanContentTypes,
  sexes,
  sheepStatuses,
  tagKey,
  withLamb,
  type FarmSheepReader,
  type FarmSheepRepository,
  type Grade,
  type Grading,
  type Origin,
  type OwnerChange,
  type Passport,
  type Sex,
  type Sheep,
  type SheepFields,
  type SheepStatus,
  type Weighing,
} from "./sheep/sheep";
export { getViewer, registerUser, setOperator, type Viewer } from "./users/commands";
export type { Identity, User, UserReader, UserRepository } from "./users/user";

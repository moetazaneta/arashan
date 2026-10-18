// The public API of the client: the only way for a view to get data (ADR 0006).
export { useAppVersion } from "./app";
export {
  useAddBreed,
  useBreeds,
  useDeleteBreed,
  useRenameBreed,
  useSetBreedArchived,
} from "./breeds";
export { ClientProvider, createClient, type Client, type Locale } from "./client";
export { toDomainError } from "./errors";
export {
  useCreateFarm,
  useFarm,
  useInviteFarmAdmin,
  useOperatorFarms,
  useUpdateFarmSettings,
} from "./farms";
export {
  useArchiveFlock,
  useArchiveLocation,
  useArchiveShepherd,
  useAssignShepherd,
  useCreateFlock,
  useCreateLocation,
  useCreateShepherd,
  useFlock,
  useFlocks,
  useLocations,
  useMoveSheep,
  useRemoveShepherdAssignment,
  useSheepResponsible,
  useShepherds,
  useUnarchiveFlock,
  useUnarchiveLocation,
  useUnarchiveShepherd,
  useUndoFlockMove,
  useUpdateFlock,
  useUpdateLocation,
  useUpdateShepherd,
  useUpdateShepherdAssignment,
} from "./flocks";
export { useAcceptInvite, useInvite } from "./invites";
export {
  useChangeMemberRole,
  useInviteMember,
  useMembers,
  useRemoveMember,
  useSetMemberPassword,
} from "./members";
export { SignInForm, useSession, useSignOut } from "./session";
export type { Session } from "./session-state";
export {
  useChangeSheepOwner,
  useDeleteSheep,
  useParentOptions,
  useRegisterExternalSheep,
  useRegisterSheep,
  useSheep,
  useSheepHistory,
  useSheepList,
  useSheepOwners,
  useSheepPedigree,
  useUpdateSheep,
  useUploadPassportScan,
  type SheepCardData,
  type SheepListItem,
} from "./sheep";

// The values of the core that the views need. A view imports only the types of the core.
export {
  arashanBreedId,
  arashanShare,
  compositionOf,
  dateAt,
  defaultLambAgeMonths,
  grades,
  inviteLifetimeMs,
  isPureArashan,
  knownParents,
  manualLimit,
  maxBreedNameLength,
  maxLambAgeMonths,
  maxPassportNumberLength,
  maxNameLength,
  maxNotesLength,
  maxPasswordLength,
  maxScanBytes,
  maxPhoneLength,
  maxSheepNameLength,
  maxSheepNotesLength,
  maxTagLength,
  maxSheepPerMove,
  maxWeightKg,
  minLambAgeMonths,
  minPasswordLength,
  pedigreeDepth,
  scanContentTypes,
  sexes,
  wholeShare,
} from "@arashan/core";

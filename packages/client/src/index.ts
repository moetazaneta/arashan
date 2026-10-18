// The public API of the client: the only way for a view to get data (ADR 0006).
export { useAppVersion } from "./app";
export { ClientProvider, createClient, type Client, type Locale } from "./client";
export { toDomainError } from "./errors";
export {
  useCreateFarm,
  useFarm,
  useInviteFarmAdmin,
  useOperatorFarms,
  useUpdateFarmSettings,
} from "./farms";
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
  useRegisterSheep,
  useSheep,
  useSheepHistory,
  useSheepList,
  useSheepOwners,
  useUpdateSheep,
  type SheepCardData,
  type SheepListItem,
} from "./sheep";

// The values of the core that the views need. A view imports only the types of the core.
export {
  dateAt,
  defaultLambAgeMonths,
  inviteLifetimeMs,
  maxLambAgeMonths,
  maxPasswordLength,
  maxSheepNameLength,
  maxSheepNotesLength,
  maxTagLength,
  maxWeightKg,
  minLambAgeMonths,
  minPasswordLength,
  sexes,
} from "@arashan/core";

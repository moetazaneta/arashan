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
export { SignInForm, useSession, useSignOut } from "./session";
export type { Session } from "./session-state";

// The values of the core that the views need. A view imports only the types of the core.
export {
  defaultLambAgeMonths,
  inviteLifetimeMs,
  maxLambAgeMonths,
  minLambAgeMonths,
} from "@arashan/core";

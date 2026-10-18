import { api } from "@arashan/backend/api";
import { SignIn, useAuth, useClerk } from "@clerk/react";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConvexAuth } from "convex/react";

import { useRegistration } from "./client";
import { type Session, sessionState } from "./session-state";

/** The state of the session in the app. See `Session`. */
export function useSession(): Session {
  const convex = useConvexAuth();
  const clerk = useAuth();
  const registration = useRegistration();
  const viewer = useQuery(convexQuery(api.users.viewer, convex.isAuthenticated ? {} : "skip"));
  return sessionState({ clerk, convex, registration, viewer });
}

/** Logs out, and forgets the data of the session, so that the next person on the laptop sees none. */
export function useSignOut(): () => Promise<void> {
  const clerk = useClerk();
  const queryClient = useQueryClient();
  return async () => {
    await clerk.signOut();
    queryClient.clear();
  };
}

/**
 * The Clerk form to log in or to make an account: a username and a password, and an optional email
 * (ADR 0003). Its text is Clerk's, in the language of `ClientProvider`. After the log-in, the app
 * stays on the same URL, so that an invite link still works.
 */
export function SignInForm() {
  const here = window.location.pathname + window.location.search;
  return <SignIn routing="hash" withSignUp forceRedirectUrl={here} signUpForceRedirectUrl={here} />;
}

import type { Viewer } from "@arashan/core";

import { toDomainError } from "./errors";

/**
 * The state of the session in the app:
 *
 * - `loading`: the client does not know yet whether somebody is logged in.
 * - `signedOut`: nobody is logged in. The view shows the sign-in form.
 * - `registering`: somebody is logged in, and the backend makes or reads the User.
 * - `failed`: the backend refused the person, for example a token without a username. `error` is a
 *   DomainError when the backend gave a code.
 * - `ready`: the User and the User's Farms.
 */
export type Session =
  | { status: "loading" | "signedOut" | "registering" }
  | { status: "failed"; error: unknown }
  | { status: "ready"; viewer: Viewer };

/** The state of the call to `users.register` for the person who is logged in now. */
export type Registration =
  | { status: "idle" | "pending" | "done" }
  | { status: "failed"; error: unknown };

/** The session, from the state of Clerk, of the Convex auth, of the registration and of the viewer. */
export function sessionState(input: {
  clerk: { isLoaded: boolean; isSignedIn: boolean | undefined };
  convex: { isLoading: boolean; isAuthenticated: boolean };
  registration: Registration;
  viewer: { data: Viewer | null | undefined; error: unknown };
}): Session {
  const { clerk, convex, registration, viewer } = input;
  if (convex.isLoading || !clerk.isLoaded) return { status: "loading" };
  if (!convex.isAuthenticated) {
    // Logged in to Clerk, but the backend refused the token: the backend has a wrong issuer.
    return clerk.isSignedIn === true
      ? { status: "failed", error: new Error("The backend refused the Clerk token.") }
      : { status: "signedOut" };
  }
  if (registration.status === "failed") {
    return { status: "failed", error: toDomainError(registration.error) ?? registration.error };
  }
  if (viewer.error !== null && viewer.error !== undefined) {
    return { status: "failed", error: toDomainError(viewer.error) ?? viewer.error };
  }
  if (viewer.data === undefined || viewer.data === null) return { status: "registering" };
  return { status: "ready", viewer: viewer.data };
}

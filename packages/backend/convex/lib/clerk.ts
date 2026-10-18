import { DomainError } from "@arashan/core";

// The calls to the Clerk Backend API (ADR 0003). They need the secret key of the Clerk instance in
// the variable `CLERK_SECRET_KEY` of the Convex deployment (docs/environment.md). Only an action can
// call them: a query or a mutation cannot use the network.

const clerkApi = "https://api.clerk.com/v1";

/**
 * The longest wait for Clerk. It must be much shorter than `passwordResetLifetimeMs` of the core: a
 * pending reset blocks the account changes of the User only for that time.
 */
const clerkTimeoutMs = 20_000;

/**
 * What Clerk did with a new password. `failed` and `unknown` carry the error for the client: a
 * `member.passwordRejected` DomainError if Clerk refused the password itself.
 */
export type ClerkPasswordResult =
  | { outcome: "done" }
  | { outcome: "failed" | "unknown"; error: Error };

/**
 * Sets a new password for the Clerk user, and ends all the user's sessions, so that the new password
 * is the only way in. The result is `done` for an answer 2xx, and `failed` for an answer 4xx: Clerk
 * refused the request and changed nothing, for example for a password in a known data breach. With
 * no answer (a timeout, a network error) or an answer 5xx, the result is `unknown`: Clerk can still
 * set the password.
 */
export async function setClerkPassword(
  clerkUserId: string,
  password: string,
): Promise<ClerkPasswordResult> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (secretKey === undefined || secretKey === "") {
    return {
      outcome: "failed",
      error: new Error("CLERK_SECRET_KEY is not set on this Convex deployment."),
    };
  }
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), clerkTimeoutMs);
  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(`${clerkApi}/users/${encodeURIComponent(clerkUserId)}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ password, sign_out_of_other_sessions: true }),
      signal: abort.signal,
    });
  } catch (error) {
    return { outcome: "unknown", error: asError(error) };
  } finally {
    clearTimeout(timer);
  }
  if (response.ok) return { outcome: "done" };
  const httpError = new Error(
    `The Clerk Backend API did not set the password: HTTP ${response.status}.`,
  );
  if (response.status >= 500) return { outcome: "unknown", error: httpError };
  if (passwordError(await response.json().catch(() => null))) {
    return { outcome: "failed", error: new DomainError("member.passwordRejected") };
  }
  return { outcome: "failed", error: httpError };
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/** True if Clerk refused the password itself: its error codes start with `form_password`. */
function passwordError(body: unknown): boolean {
  if (typeof body !== "object" || body === null || !("errors" in body)) return false;
  const { errors } = body;
  return (
    Array.isArray(errors) &&
    errors.some(
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string" &&
        error.code.startsWith("form_password"),
    )
  );
}

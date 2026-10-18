import type { AuthConfig } from "convex/server";

// Convex accepts the session tokens of Clerk (ADR 0003). The Clerk Convex integration gives the
// tokens the audience "convex". Each deployment needs CLERK_JWT_ISSUER_DOMAIN: see
// docs/environment.md.
export default {
  providers: [{ domain: process.env.CLERK_JWT_ISSUER_DOMAIN!, applicationID: "convex" }],
} satisfies AuthConfig;

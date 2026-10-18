/// <reference types="vite-plus/client" />

import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";

import { api, internal } from "./_generated/api";
import schema from "./schema";

// The modules of this directory, for convex-test. Convex skips this file: it skips each file name with
// more than one dot.
export const modules = import.meta.glob(["./**/*.*s", "!./**/*.test.*s"]);

export type Test = ReturnType<typeof setup>;

export function setup() {
  return convexTest(schema, modules);
}

/**
 * A person logged in with Clerk, who already has a User. The identity carries the claims that the
 * Clerk session token carries (docs/environment.md).
 */
export async function logIn(t: Test, username: string, options: { operator?: boolean } = {}) {
  const user = t.withIdentity({
    issuer: "https://clerk.test",
    subject: `user_${username}`,
    preferredUsername: username,
  });
  await user.mutation(api.users.register, {});
  if (options.operator === true) await t.mutation(internal.users.setOperator, { username });
  return user;
}

export const settings = { currency: "KGS", timeZone: "Asia/Bishkek", lambAgeMonths: 4 };

/** A Farm that the Operator made, with the token of the invite link of its first Admin. */
export async function makeFarm(t: Test, name = "Арашан") {
  const operator = await logIn(t, "operator", { operator: true });
  const { farmId, invite } = await operator.mutation(api.farms.create, { name, ...settings });
  return { operator, farmId, token: invite.token };
}

/** The code of the domain error that a call failed with, or the error itself if it is not one. */
export async function errorCode(call: Promise<unknown>): Promise<unknown> {
  const error = await call.then(
    () => null,
    (e: unknown) => e,
  );
  return error instanceof ConvexError ? (error.data as { code: string }).code : error;
}

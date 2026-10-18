import { describe, expect, test } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import { errorCode, logIn, setup } from "./test.setup";

describe("users", () => {
  test("register makes the User from the Clerk identity, with an audit entry", async () => {
    const t = setup();
    const person = t.withIdentity({
      issuer: "https://clerk.test",
      subject: "user_2abc",
      preferredUsername: "aibek",
    });

    expect(await person.query(api.users.viewer, {})).toBeNull();
    const id = await person.mutation(api.users.register, {});

    expect(await person.query(api.users.viewer, {})).toEqual({
      user: { id, username: "aibek", isOperator: false },
      farms: [],
    });
    const rows = await t.run(async (ctx) => ({
      users: await ctx.db.query("users").collect(),
      audit: await ctx.db.query("auditLog").collect(),
    }));
    expect(rows.users).toMatchObject([
      { identityKey: "https://clerk.test|user_2abc", providerUserId: "user_2abc" },
    ]);
    expect(rows.audit).toMatchObject([
      { actorId: id, farmId: null, command: "user.register", targetKind: "User", targetId: id },
    ]);
  });

  test("a second log-in makes no second User", async () => {
    const t = setup();
    await logIn(t, "aibek");
    await logIn(t, "aibek");

    expect(await t.run((ctx) => ctx.db.query("users").collect())).toHaveLength(1);
  });

  test("nobody gets no viewer, and cannot register", async () => {
    const t = setup();

    expect(await t.query(api.users.viewer, {})).toBeNull();
    expect(await errorCode(t.mutation(api.users.register, {}))).toBe("auth.signedOut");
  });

  test("a token without a username claim is a domain error", async () => {
    const t = setup();
    const person = t.withIdentity({ subject: "user_2abc" });

    expect(await errorCode(person.mutation(api.users.register, {}))).toBe("user.usernameMissing");
  });

  test("the CLI makes a User the Operator, with an audit entry that has no actor", async () => {
    const t = setup();
    const aibek = await logIn(t, "aibek");

    const { userId, username } = await t.mutation(internal.users.setOperator, {
      clerkUserId: "user_aibek",
    });

    expect(username).toBe("aibek");

    expect(await aibek.query(api.users.viewer, {})).toMatchObject({
      user: { id: userId, isOperator: true },
    });
    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit.at(-1)).toMatchObject({
      actorId: null,
      command: "user.setOperator",
      targetId: userId,
    });

    await t.mutation(internal.users.setOperator, { clerkUserId: "user_aibek", isOperator: false });
    expect(await aibek.query(api.users.viewer, {})).toMatchObject({
      user: { isOperator: false },
    });
  });

  test("the CLI rejects a Clerk user id that never logged in", async () => {
    const t = setup();

    expect(
      await errorCode(t.mutation(internal.users.setOperator, { clerkUserId: "user_nobody" })),
    ).toBe("user.notFound");
  });
});

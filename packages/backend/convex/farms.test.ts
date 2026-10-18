import { describe, expect, test } from "vite-plus/test";

import { api } from "./_generated/api";
import { errorCode, logIn, makeFarm, settings, setup } from "./test.setup";

describe("farms", () => {
  test("the Operator makes a Farm; the database keeps only the hash of the invite token", async () => {
    const t = setup();

    const { farmId, token } = await makeFarm(t);

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const invites = await t.run((ctx) => ctx.db.query("invites").collect());
    expect(invites).toMatchObject([{ farmId, role: "admin", tokenHash: expect.any(String) }]);
    expect(invites[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(invites)).not.toContain(token);
  });

  test("only the Operator makes a Farm and sees the list", async () => {
    const t = setup();
    const aibek = await logIn(t, "aibek");

    expect(await errorCode(aibek.mutation(api.farms.create, { name: "Моя", ...settings }))).toBe(
      "auth.operatorOnly",
    );
    expect(await errorCode(aibek.query(api.farms.list, {}))).toBe("auth.operatorOnly");
  });

  test("the Operator's list shows no settings of a Farm", async () => {
    const t = setup();
    const { operator, farmId } = await makeFarm(t);

    expect(await operator.query(api.farms.list, {})).toEqual([
      { id: farmId, name: "Арашан", createdAt: expect.any(Number), hasMembers: false },
    ]);
  });

  test("a request to a Farm of which the User is not a Member fails with a domain error", async () => {
    const t = setup();
    const { operator, farmId } = await makeFarm(t);
    const stranger = await logIn(t, "stranger");

    expect(await errorCode(operator.query(api.farms.get, { farmId }))).toBe("farm.notMember");
    expect(await errorCode(stranger.query(api.farms.get, { farmId }))).toBe("farm.notMember");
    expect(
      await errorCode(stranger.mutation(api.farms.updateSettings, { farmId, ...settings })),
    ).toBe("farm.notMember");
    expect(await errorCode(stranger.query(api.farms.get, { farmId: "not-an-id" }))).toBe(
      "farm.notMember",
    );
    expect(await errorCode(t.query(api.farms.get, { farmId }))).toBe("auth.signedOut");
  });

  test("the first Admin sees and changes the settings, with an audit entry", async () => {
    const t = setup();
    const { farmId, token } = await makeFarm(t);
    const admin = await logIn(t, "admin");
    await admin.mutation(api.invites.accept, { token });

    await admin.mutation(api.farms.updateSettings, {
      farmId,
      currency: "usd",
      timeZone: "Europe/Moscow",
      lambAgeMonths: 6,
    });

    expect(await admin.query(api.farms.get, { farmId })).toMatchObject({
      id: farmId,
      name: "Арашан",
      currency: "USD",
      timeZone: "Europe/Moscow",
      lambAgeMonths: 6,
    });
    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit.at(-1)).toMatchObject({
      farmId,
      command: "farm.updateSettings",
      targetKind: "Farm",
      targetId: farmId,
    });
  });

  test("an Editor sees the settings but cannot change them", async () => {
    const t = setup();
    const { farmId } = await makeFarm(t);
    const editor = await logIn(t, "editor");
    await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_deletedAt_providerUserId", (q) =>
          q.eq("deletedAt", undefined).eq("providerUserId", "user_editor"),
        )
        .unique();
      await ctx.db.insert("memberships", {
        farmId: ctx.db.normalizeId("farms", farmId)!,
        userId: user!._id,
        role: "editor",
      });
    });

    expect(await editor.query(api.farms.get, { farmId })).toMatchObject({ lambAgeMonths: 4 });
    expect(
      await errorCode(
        editor.mutation(api.farms.updateSettings, { farmId, ...settings, lambAgeMonths: 6 }),
      ),
    ).toBe("access.denied");
  });

  test("a new Admin link works, and the older one stops", async () => {
    const t = setup();
    const { operator, farmId, token: first } = await makeFarm(t);

    const second = await operator.mutation(api.farms.inviteAdmin, { farmId });

    const admin = await logIn(t, "admin");
    expect(await errorCode(admin.mutation(api.invites.accept, { token: first }))).toBe(
      "invite.expired",
    );
    await expect(admin.mutation(api.invites.accept, { token: second.token })).resolves.toEqual({
      farmId,
    });
    expect(await errorCode(operator.mutation(api.farms.inviteAdmin, { farmId }))).toBe(
      "farm.hasMembers",
    );
  });
});

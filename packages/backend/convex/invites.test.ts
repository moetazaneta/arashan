import { describe, expect, test } from "vite-plus/test";

import { api } from "./_generated/api";
import { errorCode, logIn, makeFarm, setup } from "./test.setup";

describe("invites", () => {
  test("the User who opens the first invite link becomes the Admin of the Farm", async () => {
    const t = setup();
    const { farmId, token } = await makeFarm(t);
    const aibek = await logIn(t, "aibek");

    expect(await aibek.query(api.invites.preview, { token })).toMatchObject({
      farmName: "Арашан",
      role: "admin",
    });
    await expect(aibek.mutation(api.invites.accept, { token })).resolves.toEqual({ farmId });

    expect(await aibek.query(api.users.viewer, {})).toMatchObject({
      farms: [{ id: farmId, name: "Арашан", role: "admin" }],
    });
  });

  test("a link works one time only", async () => {
    const t = setup();
    const { token } = await makeFarm(t);
    await (await logIn(t, "first")).mutation(api.invites.accept, { token });
    const second = await logIn(t, "second");

    expect(await errorCode(second.query(api.invites.preview, { token }))).toBe("invite.used");
    expect(await errorCode(second.mutation(api.invites.accept, { token }))).toBe("invite.used");
  });

  test("a link stops after its time", async () => {
    const t = setup();
    const { token } = await makeFarm(t);
    await t.run(async (ctx) => {
      const invite = (await ctx.db.query("invites").first())!;
      await ctx.db.patch(invite._id, { expiresAt: Date.now() - 1 });
    });

    expect(await errorCode((await logIn(t, "aibek")).mutation(api.invites.accept, { token }))).toBe(
      "invite.expired",
    );
  });

  test("a made-up token, and a request from nobody, are domain errors", async () => {
    const t = setup();
    const { token } = await makeFarm(t);

    expect(
      await errorCode((await logIn(t, "aibek")).query(api.invites.preview, { token: "made-up" })),
    ).toBe("invite.notFound");
    expect(await errorCode(t.query(api.invites.preview, { token }))).toBe("auth.signedOut");
  });

  test("each command of the slice writes an audit entry", async () => {
    const t = setup();
    const { operator, farmId, token } = await makeFarm(t);
    await operator.mutation(api.farms.inviteAdmin, { farmId });
    const newToken = (await operator.mutation(api.farms.inviteAdmin, { farmId })).token;
    const admin = await logIn(t, "admin");
    await admin.mutation(api.invites.accept, { token: newToken });
    await admin.mutation(api.farms.updateSettings, {
      farmId,
      currency: "KGS",
      timeZone: "Asia/Bishkek",
      lambAgeMonths: 5,
    });
    expect(token).not.toBe(newToken);

    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit.map((entry) => entry.command)).toEqual([
      "user.register",
      "user.setOperator",
      "farm.create",
      "farm.inviteAdmin",
      "farm.inviteAdmin",
      "user.register",
      "invite.accept",
      "farm.updateSettings",
    ]);
  });
});

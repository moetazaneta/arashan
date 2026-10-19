import { describe, expect, test } from "vite-plus/test";

import type { FarmId } from "../ids";
import { acceptInvite } from "../members/commands";
import { inviteLifetimeMs } from "../members/invite";
import { createMoneyRecord, deleteMoneyRecord } from "../money/commands";
import { InMemoryStore } from "../testing/in-memory";
import { createFarm, getFarm, inviteFarmAdmin, listFarms, updateFarmSettings } from "./commands";

const settings = { currency: "KGS", timeZone: "Asia/Bishkek", lambAgeMonths: 4 };

describe("createFarm", () => {
  test("the Operator makes a Farm and gets a one-time invite link for its first Admin", async () => {
    const store = new InMemoryStore();
    const operator = store.addUser("operator", { operator: true });

    const { farmId, invite } = await createFarm(operator, {
      name: "  Арашан  ",
      currency: "kgs",
      timeZone: "asia/bishkek",
      lambAgeMonths: 4,
    });

    expect(store.farms).toEqual([
      {
        id: farmId,
        name: "Арашан",
        currency: "KGS",
        timeZone: "Asia/Bishkek",
        lambAgeMonths: 4,
        createdAt: store.time,
      },
    ]);
    expect(invite).toEqual({ token: "token-1", expiresAt: store.time + inviteLifetimeMs });
    expect(store.invites).toMatchObject([
      { farmId, role: "admin", tokenHash: "hash(token-1)", createdBy: store.users[0]?.id },
    ]);
    expect(store.audit[0]).toEqual({
      at: store.time,
      actorId: store.users[0]?.id,
      farmId,
      command: "farm.create",
      target: { kind: "Farm", id: farmId },
    });
    // The default lists of Expense categories and Income categories, one entry for each category.
    expect(store.moneyCategories.filter((c) => c.farmId === farmId)).toHaveLength(11);
    expect(store.audit.slice(1).map((entry) => entry.command)).toEqual(
      Array(11).fill("moneyCategory.create"),
    );
  });

  test("only the Operator can make a Farm", async () => {
    const store = new InMemoryStore();

    await expect(
      createFarm(store.addUser("someone"), { name: "Арашан", ...settings }),
    ).rejects.toMatchObject({ code: "auth.operatorOnly" });
    expect(store.farms).toEqual([]);
  });

  test.each([
    [{ name: "  " }, "farm.nameRequired"],
    [{ currency: "XYZ1" }, "farm.currencyInvalid"],
    [{ currency: "" }, "farm.currencyInvalid"],
    [{ timeZone: "Mars/Olympus" }, "farm.timeZoneInvalid"],
    [{ timeZone: "+06:00" }, "farm.timeZoneInvalid"],
    [{ lambAgeMonths: 0 }, "farm.lambAgeInvalid"],
    [{ lambAgeMonths: 13 }, "farm.lambAgeInvalid"],
    [{ lambAgeMonths: 4.5 }, "farm.lambAgeInvalid"],
  ])("rejects %o with %s", async (change, code) => {
    const store = new InMemoryStore();
    const operator = store.addUser("operator", { operator: true });

    await expect(
      createFarm(operator, { name: "Арашан", ...settings, ...change }),
    ).rejects.toMatchObject({ code });
    expect(store.farms).toEqual([]);
  });

  test("accepts UTC, and a lamb age of 1 and of 12 months", async () => {
    const store = new InMemoryStore();
    const operator = store.addUser("operator", { operator: true });

    for (const change of [{ timeZone: "UTC" }, { lambAgeMonths: 1 }, { lambAgeMonths: 12 }]) {
      await expect(
        createFarm(operator, { name: "Арашан", ...settings, ...change }),
      ).resolves.toBeDefined();
    }
  });
});

describe("listFarms", () => {
  test("gives the Operator the name and the state of each Farm, the newest first", async () => {
    const store = new InMemoryStore();
    const operator = store.addUser("operator", { operator: true });
    const first = await createFarm(operator, { name: "Первая", ...settings });
    store.time += 1000;
    const second = await createFarm(operator, { name: "Вторая", ...settings });
    await acceptInvite(store.addUser("admin"), { token: first.invite.token });

    expect(await listFarms(operator)).toEqual([
      { id: second.farmId, name: "Вторая", createdAt: store.time, hasMembers: false },
      { id: first.farmId, name: "Первая", createdAt: store.time - 1000, hasMembers: true },
    ]);
  });

  test("only the Operator sees the list", async () => {
    const store = new InMemoryStore();

    await expect(listFarms(store.addUser("someone"))).rejects.toMatchObject({
      code: "auth.operatorOnly",
    });
  });
});

describe("inviteFarmAdmin", () => {
  test("makes a new link, and the older link stops working as if it expired", async () => {
    const store = new InMemoryStore();
    const operator = store.addUser("operator", { operator: true });
    const { farmId, invite: first } = await createFarm(operator, { name: "Арашан", ...settings });

    const second = await inviteFarmAdmin(operator, { farmId });

    const admin = store.addUser("admin");
    await expect(acceptInvite(admin, { token: first.token })).rejects.toMatchObject({
      code: "invite.expired",
    });
    await expect(acceptInvite(admin, { token: second.token })).resolves.toEqual({ farmId });
    expect(
      store.audit
        .map((entry) => entry.command)
        .filter((command) => command !== "moneyCategory.create"),
    ).toEqual(["farm.create", "farm.inviteAdmin", "invite.accept"]);
  });

  test("rejects a Farm that already has a Member", async () => {
    const store = new InMemoryStore();
    const operator = store.addUser("operator", { operator: true });
    const { farmId, invite } = await createFarm(operator, { name: "Арашан", ...settings });
    await acceptInvite(store.addUser("admin"), { token: invite.token });

    await expect(inviteFarmAdmin(operator, { farmId })).rejects.toMatchObject({
      code: "farm.hasMembers",
    });
  });

  test("rejects an unknown Farm, and a User who is not the Operator", async () => {
    const store = new InMemoryStore();
    const operator = store.addUser("operator", { operator: true });
    const { farmId } = await createFarm(operator, { name: "Арашан", ...settings });

    await expect(
      inviteFarmAdmin(operator, { farmId: "farm-missing" as FarmId }),
    ).rejects.toMatchObject({ code: "farm.notFound" });
    await expect(inviteFarmAdmin(store.addUser("someone"), { farmId })).rejects.toMatchObject({
      code: "auth.operatorOnly",
    });
  });
});

describe("the settings of a Farm", () => {
  async function setup() {
    const store = new InMemoryStore();
    const operator = store.addUser("operator", { operator: true });
    const { farmId } = await createFarm(operator, { name: "Арашан", ...settings });
    const admin = store.addMember("admin", farmId, "admin");
    const editor = store.addMember("editor", farmId, "editor");
    return { store, farmId, admin, editor };
  }

  test("a Member sees the settings", async () => {
    const { store, farmId, editor } = await setup();

    expect(getFarm(await store.farmContext(editor, farmId))).toMatchObject({
      id: farmId,
      name: "Арашан",
      ...settings,
    });
  });

  test("an Admin changes them, with an audit entry", async () => {
    const { store, farmId, admin } = await setup();
    const ctx = await store.farmContext(admin, farmId);

    await updateFarmSettings(ctx, {
      currency: "usd",
      timeZone: "Europe/Moscow",
      lambAgeMonths: 6,
    });

    expect(store.farms[0]).toMatchObject({
      currency: "USD",
      timeZone: "Europe/Moscow",
      lambAgeMonths: 6,
    });
    expect(store.audit.at(-1)).toEqual({
      at: store.time,
      actorId: ctx.member.userId,
      farmId,
      command: "farm.updateSettings",
      target: { kind: "Farm", id: farmId },
    });
  });

  test("an Editor cannot change them", async () => {
    const { store, farmId, editor } = await setup();

    await expect(
      updateFarmSettings(await store.farmContext(editor, farmId), {
        ...settings,
        lambAgeMonths: 6,
      }),
    ).rejects.toMatchObject({ code: "access.denied" });
    expect(store.farms[0]?.lambAgeMonths).toBe(4);
  });

  test("the currency stays once the Farm has an Expense or an Income, also a Deleted one", async () => {
    const { store, farmId, admin } = await setup();
    const ctx = await store.farmContext(admin, farmId);
    const recordId = await createMoneyRecord(ctx, {
      kind: "expense",
      date: "2026-10-01",
      amount: 100,
      categoryId: store.moneyCategories.find((c) => c.key === "shearing")!.id,
      scope: { kind: "farm" },
      shepherdId: null,
      notes: null,
    });
    await deleteMoneyRecord(ctx, { recordId });

    await expect(updateFarmSettings(ctx, { ...settings, currency: "USD" })).rejects.toMatchObject({
      code: "farm.currencyLocked",
    });
    // The other settings still change.
    await updateFarmSettings(ctx, { ...settings, currency: "kgs", lambAgeMonths: 6 });
    expect(store.farms[0]).toMatchObject({ currency: "KGS", lambAgeMonths: 6 });
  });

  test("invalid settings change nothing", async () => {
    const { store, farmId, admin } = await setup();

    await expect(
      updateFarmSettings(await store.farmContext(admin, farmId), { ...settings, currency: "XYZ1" }),
    ).rejects.toMatchObject({ code: "farm.currencyInvalid" });
    expect(store.farms[0]?.currency).toBe("KGS");
  });
});

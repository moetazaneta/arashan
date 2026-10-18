import type { FunctionArgs } from "convex/server";
import { describe, expect, test } from "vite-plus/test";

import { api } from "./_generated/api";
import { errorCode, farmWithEditor, logIn, setup, type Test } from "./test.setup";

/** A Ram Born on the Farm, with only the fields that a Sheep must have. */
const ram: Omit<FunctionArgs<typeof api.sheep.register>, "farmId" | "ownerId"> = {
  tag: null,
  name: null,
  sex: "ram",
  birthDate: "2025-03-01",
  notes: null,
  weight: null,
  origin: "born",
  initialEntry: false,
};

/** The form of the same Ram with no change, for `sheep.update`. */
const unchanged: Omit<FunctionArgs<typeof api.sheep.update>, "farmId" | "sheepId"> = {
  tag: null,
  name: null,
  sex: "ram",
  birthDate: "2025-03-01",
  notes: null,
  weight: null,
};

/** A Farm with an Admin and an Editor, and a function that registers a Sheep of the Admin. */
async function registry(t: Test, name?: string) {
  const farm = await farmWithEditor(t, name);
  const adminId = await farm.membershipId(`admin${name ?? ""}`);
  const editorId = await farm.membershipId(`editor${name ?? ""}`);
  const register = (fields: Partial<typeof ram> & { ownerId?: string } = {}, as = farm.admin) =>
    as.mutation(api.sheep.register, { farmId: farm.farmId, ...ram, ownerId: adminId, ...fields });
  return { ...farm, adminId, editorId, register };
}

async function sheepRow(t: Test, sheepId: string) {
  return t.run((ctx) => ctx.db.get(ctx.db.normalizeId("sheep", sheepId)!));
}

async function sheepAudit(t: Test) {
  const rows = await t.run((ctx) => ctx.db.query("auditLog").collect());
  return rows.filter((row) => row.targetKind === "Sheep");
}

describe("sheep", () => {
  test("a registered Sheep comes back from the list, with null for each absent field", async () => {
    const t = setup();
    const { admin, farmId, adminId, register } = await registry(t);

    const tagged = await register({ tag: "  A  12 ", name: " Борька " });
    const weighed = await register({ notes: "Хромает", weight: { kg: 42.5, date: "2025-09-01" } });

    expect(await admin.query(api.sheep.list, { farmId })).toEqual([
      {
        id: tagged,
        tag: "A 12",
        name: "Борька",
        sex: "ram",
        birthDate: "2025-03-01",
        origin: "born",
        initialEntry: false,
        status: "active",
        owner: { id: adminId, name: "admin" },
        flock: null,
        weight: null,
        notes: null,
        registeredAt: expect.any(Number),
      },
      {
        id: weighed,
        tag: null,
        name: null,
        sex: "ram",
        birthDate: "2025-03-01",
        origin: "born",
        initialEntry: false,
        status: "active",
        owner: { id: adminId, name: "admin" },
        flock: null,
        weight: { kg: 42.5, date: "2025-09-01" },
        notes: "Хромает",
        registeredAt: expect.any(Number),
      },
    ]);
    const row = await sheepRow(t, weighed);
    expect(row).toMatchObject({ farmId, weightKg: 42.5, weighedOn: "2025-09-01" });
    expect(row?.tag).toBeUndefined();
    expect(row?.tagKey).toBeUndefined();
    expect(row?.name).toBeUndefined();
    expect(await sheepRow(t, tagged)).toMatchObject({ tag: "A 12", tagKey: "a 12" });
  });

  test("an Initial entry can be Bought, with no birth date; then its Origin can change", async () => {
    const t = setup();
    const { admin, farmId, register } = await registry(t);

    expect(await errorCode(register({ origin: "bought" }))).toBe("sheep.purchaseRequired");
    const sheepId = await register({ origin: "bought", initialEntry: true, birthDate: null });
    expect(await admin.query(api.sheep.get, { farmId, sheepId })).toMatchObject({
      origin: "bought",
      initialEntry: true,
      birthDate: null,
    });

    await admin.mutation(api.sheep.update, {
      farmId,
      sheepId,
      ...unchanged,
      birthDate: null,
      origin: "born",
    });

    expect(await admin.query(api.sheep.get, { farmId, sheepId })).toMatchObject({
      origin: "born",
    });
  });

  test("a Tag is taken whatever its case, and with Cyrillic letters that look Latin", async () => {
    const t = setup();
    const { admin, farmId, register } = await registry(t);
    const other = await registry(t, "Другая");
    await register({ tag: "A-12" });
    const second = await register({ tag: "B-7" });

    for (const tag of ["a-12", "а-12", " А-12 "]) {
      expect(await errorCode(register({ tag }))).toBe("sheep.tagTaken");
    }
    expect(
      await errorCode(
        admin.mutation(api.sheep.update, { farmId, sheepId: second, ...unchanged, tag: "А-12" }),
      ),
    ).toBe("sheep.tagTaken");
    // Another Farm has its own Tags.
    expect(await other.register({ tag: "A-12" })).toEqual(expect.any(String));
  });

  test("a Sheep with its Tag cleared has no Tag and no key, and the Tag is free", async () => {
    const t = setup();
    const { admin, farmId, register } = await registry(t);
    const sheepId = await register({ tag: "A-12", name: "Борька" });

    await admin.mutation(api.sheep.update, { farmId, sheepId, ...unchanged, name: "Борька" });

    const row = await sheepRow(t, sheepId);
    expect(row).toMatchObject({ name: "Борька" });
    expect(row?.tag).toBeUndefined();
    expect(row?.tagKey).toBeUndefined();
    expect(await admin.query(api.sheep.get, { farmId, sheepId })).toMatchObject({ tag: null });
    expect(await register({ tag: "a-12" })).toEqual(expect.any(String));
  });

  test("a Sheep of another Farm, or a made-up id, is not found", async () => {
    const t = setup();
    const { admin, farmId, adminId } = await registry(t);
    const other = await registry(t, "Другая");
    const stranger = await other.register({ tag: "A-12" });

    for (const sheepId of [stranger, "not-an-id"]) {
      expect(await admin.query(api.sheep.get, { farmId, sheepId })).toBeNull();
      expect(await errorCode(admin.query(api.sheep.history, { farmId, sheepId }))).toBe(
        "sheep.notFound",
      );
      expect(
        await errorCode(admin.mutation(api.sheep.update, { farmId, sheepId, ...unchanged })),
      ).toBe("sheep.notFound");
      expect(
        await errorCode(
          admin.mutation(api.sheep.changeOwner, {
            farmId,
            sheepId,
            ownerId: adminId,
            date: "2026-01-15",
          }),
        ),
      ).toBe("sheep.notFound");
      expect(await errorCode(admin.mutation(api.sheep.markDeleted, { farmId, sheepId }))).toBe(
        "sheep.notFound",
      );
    }
    expect(
      await other.admin.query(api.sheep.get, { farmId: other.farmId, sheepId: stranger }),
    ).toMatchObject({ tag: "A-12" });
  });

  test("a User who is not a Member of the Farm sees and registers no Sheep", async () => {
    const t = setup();
    const { farmId, adminId } = await registry(t);
    const stranger = await logIn(t, "stranger");

    expect(await errorCode(stranger.query(api.sheep.list, { farmId }))).toBe("farm.notMember");
    expect(
      await errorCode(stranger.mutation(api.sheep.register, { farmId, ...ram, ownerId: adminId })),
    ).toBe("farm.notMember");
  });

  test("an Editor registers a Sheep of the own, and the Owners are the Members", async () => {
    const t = setup();
    const { editor, farmId, adminId, editorId, register } = await registry(t);

    const sheepId = await register({ ownerId: editorId }, editor);

    expect(await editor.query(api.sheep.get, { farmId, sheepId })).toMatchObject({
      owner: { id: editorId, name: "editor" },
      owners: [{ owner: { id: editorId, name: "editor" }, since: null }],
    });
    expect(await editor.query(api.sheep.owners, { farmId })).toEqual([
      { id: adminId, name: "admin", isMe: false },
      { id: editorId, name: "editor", isMe: true },
    ]);
  });

  test("a new Owner gets a row of the change, and the card shows the Owners, newest first", async () => {
    const t = setup();
    const { admin, farmId, adminId, editorId, register } = await registry(t);
    const sheepId = await register();

    await admin.mutation(api.sheep.changeOwner, {
      farmId,
      sheepId,
      ownerId: editorId,
      date: "2026-01-15",
    });

    expect(await t.run((ctx) => ctx.db.query("sheepOwnerChanges").collect())).toMatchObject([
      {
        farmId,
        sheepId,
        previousOwnerId: adminId,
        ownerId: editorId,
        date: "2026-01-15",
        at: expect.any(Number),
      },
    ]);
    expect(await admin.query(api.sheep.get, { farmId, sheepId })).toMatchObject({
      owner: { id: editorId, name: "editor" },
      owners: [
        { owner: { id: editorId, name: "editor" }, since: "2026-01-15" },
        { owner: { id: adminId, name: "admin" }, since: null },
      ],
    });
  });

  test("a Deleted Sheep leaves the list and its card, keeps its row, and frees its Tag", async () => {
    const t = setup();
    const { admin, farmId, register } = await registry(t);
    const sheepId = await register({ tag: "A-12" });

    await admin.mutation(api.sheep.markDeleted, { farmId, sheepId });

    expect(await admin.query(api.sheep.list, { farmId })).toEqual([]);
    expect(await admin.query(api.sheep.get, { farmId, sheepId })).toBeNull();
    expect(await sheepRow(t, sheepId)).toMatchObject({
      tag: "A-12",
      deletedAt: expect.any(Number),
    });
    expect(await register({ tag: "A-12" })).toEqual(expect.any(String));
  });

  test("each change appends one audit entry, and the history shows them, newest first", async () => {
    const t = setup();
    const { admin, editor, farmId, editorId, register } = await registry(t);
    const sheepId = await register();
    await editor.mutation(api.sheep.update, { farmId, sheepId, ...unchanged, name: "Борька" });
    await admin.mutation(api.sheep.changeOwner, {
      farmId,
      sheepId,
      ownerId: editorId,
      date: "2026-01-15",
    });

    // The same fields again change nothing, so they append no entry.
    await editor.mutation(api.sheep.update, { farmId, sheepId, ...unchanged, name: " Борька " });

    expect(
      (await sheepAudit(t)).map(({ farmId, command, targetKind, targetId }) => [
        farmId,
        command,
        targetKind,
        targetId,
      ]),
    ).toEqual([
      [farmId, "sheep.register", "Sheep", sheepId],
      [farmId, "sheep.update", "Sheep", sheepId],
      [farmId, "sheep.changeOwner", "Sheep", sheepId],
    ]);
    const history = await admin.query(api.sheep.history, { farmId, sheepId });
    expect(history).toEqual([
      {
        at: expect.any(Number),
        actor: { id: expect.any(String), name: "admin" },
        command: "sheep.changeOwner",
      },
      {
        at: expect.any(Number),
        actor: { id: expect.any(String), name: "editor" },
        command: "sheep.update",
      },
      {
        at: expect.any(Number),
        actor: { id: expect.any(String), name: "admin" },
        command: "sheep.register",
      },
    ]);

    await admin.mutation(api.sheep.markDeleted, { farmId, sheepId });
    expect((await sheepAudit(t)).at(-1)).toMatchObject({
      command: "sheep.delete",
      targetId: sheepId,
    });
  });

  test("the history of a Sheep shows no entry of another Farm with the same target", async () => {
    const t = setup();
    const { admin, farmId, register } = await registry(t);
    const other = await registry(t, "Другая");
    const sheepId = await register();
    await t.run((ctx) =>
      ctx.db.insert("auditLog", {
        at: Date.now(),
        actorId: null,
        farmId: ctx.db.normalizeId("farms", other.farmId),
        command: "sheep.update",
        targetKind: "Sheep",
        targetId: sheepId,
      }),
    );

    expect(await admin.query(api.sheep.history, { farmId, sheepId })).toMatchObject([
      { command: "sheep.register" },
    ]);
  });

  test("a Member who owns an Active Sheep cannot be removed", async () => {
    const t = setup();
    const { admin, farmId, adminId, editorId, register } = await registry(t);
    const sheepId = await register({ ownerId: editorId });

    expect(
      await errorCode(admin.mutation(api.members.remove, { farmId, membershipId: editorId })),
    ).toBe("member.ownsActiveSheep");

    await admin.mutation(api.sheep.changeOwner, {
      farmId,
      sheepId,
      ownerId: adminId,
      date: "2026-01-15",
    });
    await admin.mutation(api.members.remove, { farmId, membershipId: editorId });

    expect(await admin.query(api.sheep.owners, { farmId })).toEqual([
      { id: adminId, name: "admin", isMe: true },
    ]);
  });
});

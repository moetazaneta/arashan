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

/** The parts by hand of a Sheep with no known parents that is 100 percent Arashan. */
const pureArashan = [{ breedId: "arashan", share: 1_000_000 }];

/** An External Ram with only the fields that it must have, for `sheep.registerExternal`. */
const external: Omit<FunctionArgs<typeof api.sheep.registerExternal>, "farmId"> = {
  tag: null,
  name: null,
  sex: "ram",
  birthDate: null,
  notes: null,
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
  test("pedigree and Passport fields survive Flock moves, and Flock fields survive Sheep edits", async () => {
    const t = setup();
    const { admin, farmId, register } = await registry(t);
    const fatherId = await admin.mutation(api.sheep.registerExternal, {
      farmId,
      ...external,
      manualBreeds: pureArashan,
    });
    const sheepId = await register({
      fatherId,
      manualBreeds: [{ breedId: "arashan", share: 500_000 }],
      passport: { number: "P-7", issueDate: "2025-04-01", scanId: null },
      grade: { grade: "elite", date: "2025-04-01" },
    });
    const flockId = await admin.mutation(api.flocks.create, {
      farmId,
      name: "North",
      locationId: null,
    });
    await admin.mutation(api.flocks.moveSheep, {
      farmId,
      sheepIds: [sheepId],
      flockId,
      date: "2025-06-01",
    });
    await admin.mutation(api.sheep.update, { farmId, sheepId, ...unchanged, name: "Ram" });

    expect(await admin.query(api.sheep.get, { farmId, sheepId })).toMatchObject({
      name: "Ram",
      father: { id: fatherId },
      composition: { breeds: [{ breedId: "arashan", share: 1_000_000 }], unknown: 0 },
      passport: { number: "P-7", issueDate: "2025-04-01", scan: null },
      grade: { grade: "elite", date: "2025-04-01" },
      flock: { id: flockId },
      flocks: [{ flock: { id: flockId }, from: "2025-06-01", to: null }],
    });
    expect(await sheepRow(t, sheepId)).toMatchObject({
      fatherId,
      flockId,
      passportNumber: "P-7",
      grade: "elite",
    });
    expect(
      await errorCode(
        admin.mutation(api.flocks.moveSheep, {
          farmId,
          sheepIds: [fatherId],
          flockId,
          date: "2025-06-01",
        }),
      ),
    ).toBe("sheep.notFound");
    expect((await sheepRow(t, fatherId))?.flockId).toBeUndefined();
  });

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
        composition: { breeds: [], unknown: 1_000_000 },
        grade: null,
        hasPassport: false,
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
        composition: { breeds: [], unknown: 1_000_000 },
        grade: null,
        hasPassport: false,
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

describe("pedigree", () => {
  test("the parents, the parts by hand, the Passport and the Grade come back with the composition", async () => {
    const t = setup();
    const { admin, farmId, register } = await registry(t);
    const breedId = await admin.mutation(api.breeds.add, { farmId, name: "Гиссарская" });
    const motherId = await register({
      tag: "1",
      sex: "ewe",
      birthDate: "2020-03-01",
      manualBreeds: pureArashan,
    });
    const fatherId = await admin.mutation(api.sheep.registerExternal, {
      farmId,
      ...external,
      name: "Султан",
      manualBreeds: pureArashan,
    });

    const pureId = await register({
      tag: "2",
      motherId,
      fatherId,
      passport: { number: " KG 123 ", issueDate: "2025-04-01", scanId: null },
      grade: { grade: "elite", date: "2025-06-01" },
    });
    // With one known parent, the parts by hand come out of the half of the unknown Father.
    const mixedId = await register({
      tag: "3",
      motherId,
      manualBreeds: [{ breedId, share: 250_000 }],
    });

    const pure = { breeds: [{ breedId: "arashan", share: 1_000_000 }], unknown: 0 };
    const mixed = {
      breeds: [
        { breedId: "arashan", share: 500_000 },
        { breedId, share: 250_000 },
      ],
      unknown: 250_000,
    };
    expect(await admin.query(api.sheep.get, { farmId, sheepId: pureId })).toMatchObject({
      composition: pure,
      mother: { id: motherId, tag: "1", sex: "ewe", origin: "born" },
      father: { id: fatherId, name: "Султан", sex: "ram", origin: "external" },
      manualBreeds: [],
      passport: { number: "KG 123", issueDate: "2025-04-01", scan: null },
      hasPassport: true,
      grade: { grade: "elite", date: "2025-06-01" },
    });
    expect(await admin.query(api.sheep.get, { farmId, sheepId: mixedId })).toMatchObject({
      composition: mixed,
      father: null,
      manualBreeds: [{ breedId, share: 250_000 }],
      passport: null,
      hasPassport: false,
      grade: null,
    });
    expect(
      (await admin.query(api.sheep.list, { farmId })).map((row) => [row.id, row.composition]),
    ).toEqual([
      [motherId, pure],
      [pureId, pure],
      [mixedId, mixed],
    ]);

    const pureRow = await sheepRow(t, pureId);
    expect(pureRow).toMatchObject({
      motherId,
      fatherId,
      passportNumber: "KG 123",
      passportIssuedOn: "2025-04-01",
      grade: "elite",
      gradedOn: "2025-06-01",
    });
    expect(pureRow?.manualBreeds).toBeUndefined();
    expect(pureRow?.passportScanId).toBeUndefined();
    const mixedRow = await sheepRow(t, mixedId);
    expect(mixedRow).toMatchObject({ motherId, manualBreeds: [{ breedId, share: 250_000 }] });
    for (const column of ["fatherId", "passportNumber", "passportIssuedOn", "grade", "gradedOn"]) {
      expect(mixedRow).not.toHaveProperty(column);
    }
    expect(await sheepRow(t, motherId)).toMatchObject({ manualBreeds: pureArashan });
  });

  test("an update keeps the fields of the pedigree that it does not get, and null clears them", async () => {
    const t = setup();
    const { admin, farmId, register } = await registry(t);
    const motherId = await register({ sex: "ewe", birthDate: "2020-03-01" });
    const sheepId = await register({
      motherId,
      manualBreeds: [{ breedId: "arashan", share: 250_000 }],
      grade: { grade: "first", date: "2025-06-01" },
    });

    await admin.mutation(api.sheep.update, { farmId, sheepId, ...unchanged, name: "Борька" });
    expect(await sheepRow(t, sheepId)).toMatchObject({
      name: "Борька",
      motherId,
      manualBreeds: [{ breedId: "arashan", share: 250_000 }],
      grade: "first",
      gradedOn: "2025-06-01",
    });

    await admin.mutation(api.sheep.update, {
      farmId,
      sheepId,
      ...unchanged,
      name: "Борька",
      motherId: null,
      manualBreeds: [],
      grade: null,
    });
    const row = await sheepRow(t, sheepId);
    for (const column of ["motherId", "manualBreeds", "grade", "gradedOn"]) {
      expect(row).not.toHaveProperty(column);
    }
  });

  test("the children of a Sheep come through the indexes, so a parent cannot be deleted", async () => {
    const t = setup();
    const { admin, farmId, register } = await registry(t);
    const other = await registry(t, "Другая");
    const motherId = await register({ sex: "ewe", birthDate: "2020-03-01" });
    const fatherId = await register({ birthDate: "2020-03-01" });
    const first = await register({ tag: "1", motherId, fatherId });
    const second = await register({ tag: "2", fatherId });

    const children = async (sheepId: string) =>
      (await admin.query(api.sheep.get, { farmId, sheepId }))?.children.map((child) => child.id);
    expect(await children(motherId)).toEqual([first]);
    expect(await children(fatherId)).toEqual([first, second]);
    for (const sheepId of [motherId, fatherId]) {
      expect(await errorCode(admin.mutation(api.sheep.markDeleted, { farmId, sheepId }))).toBe(
        "sheep.isParent",
      );
    }

    // A Deleted child is not a child any more.
    await admin.mutation(api.sheep.markDeleted, { farmId, sheepId: first });
    await admin.mutation(api.sheep.markDeleted, { farmId, sheepId: motherId });
    expect(await children(fatherId)).toEqual([second]);
    // A Sheep of another Farm is no parent.
    expect(await errorCode(other.register({ fatherId }))).toBe("pedigree.parentNotFound");
  });

  test("an External Sheep has a card and is a parent to choose, but is not in the list", async () => {
    const t = setup();
    const { admin, farmId, register } = await registry(t);

    const sheepId = await admin.mutation(api.sheep.registerExternal, {
      farmId,
      ...external,
      tag: "A-12",
      sex: "ewe",
      manualBreeds: pureArashan,
    });

    const row = await sheepRow(t, sheepId);
    expect(row).toMatchObject({ tag: "A-12", origin: "external", status: "active" });
    expect(row).not.toHaveProperty("tagKey");
    expect(row).not.toHaveProperty("ownerId");
    expect(await admin.query(api.sheep.list, { farmId })).toEqual([]);
    expect(await admin.query(api.sheep.parentOptions, { farmId })).toEqual([
      {
        id: sheepId,
        tag: "A-12",
        name: null,
        sex: "ewe",
        origin: "external",
        birthDate: null,
        status: "active",
        composition: { breeds: [{ breedId: "arashan", share: 1_000_000 }], unknown: 0 },
      },
    ]);
    expect(await admin.query(api.sheep.get, { farmId, sheepId })).toMatchObject({
      origin: "external",
      owner: null,
      owners: [],
    });
    // Its Tag does not make the Tag of a Sheep of the Farm taken.
    expect(await register({ tag: "A-12" })).toEqual(expect.any(String));
    expect((await sheepAudit(t)).map((entry) => [entry.command, entry.targetId])).toEqual([
      ["sheep.registerExternal", sheepId],
      ["sheep.register", expect.any(String)],
    ]);
  });

  test("the pedigree tree shows three generations of ancestors", async () => {
    const t = setup();
    const { admin, farmId, register } = await registry(t);
    // Four generations of Ewes, each one the Mother of the next.
    const ewes: string[] = [];
    for (const year of [2016, 2017, 2018, 2020]) {
      ewes.push(
        await register({ sex: "ewe", birthDate: `${year}-03-01`, motherId: ewes.at(-1) ?? null }),
      );
    }
    const sheepId = await register({ motherId: ewes.at(-1)! });

    const tree = await admin.query(api.sheep.pedigree, { farmId, sheepId });

    expect(tree).toMatchObject({
      id: sheepId,
      father: null,
      mother: {
        id: ewes[3],
        father: null,
        mother: { id: ewes[2], father: null, mother: { id: ewes[1] } },
      },
    });
    // The great-grandmother is the last generation: the tree does not show her Mother.
    expect(tree?.mother?.mother?.mother).not.toHaveProperty("mother");
    expect(await admin.query(api.sheep.pedigree, { farmId, sheepId: "not-an-id" })).toBeNull();
  });
});

describe("the scan of a Passport", () => {
  /** The Passport of a Sheep with the scan. */
  const passport = (scanId: string) => ({ number: "KG 1", issueDate: "2025-04-01", scanId });

  test("the client uploads the scan to a URL of the storage, and the card links to it", async () => {
    const t = setup();
    const { editor, farmId, register } = await registry(t);

    expect(await editor.mutation(api.sheep.passportUploadUrl, { farmId })).toMatch(/^https:\/\//);
    // convex-test stores no type of the file, so the core checks only the size.
    const scanId = await t.run((ctx) => ctx.storage.store(new Blob(["скан"])));
    const sheepId = await register({ manualBreeds: pureArashan, passport: passport(scanId) });

    expect(await sheepRow(t, sheepId)).toMatchObject({ passportScanId: scanId });
    expect((await editor.query(api.sheep.get, { farmId, sheepId }))?.passport).toEqual({
      number: "KG 1",
      issueDate: "2025-04-01",
      scan: { id: scanId, url: expect.stringMatching(/^https:\/\//) },
    });
  });

  test("a file larger than 10 MB, or an id that is no file, is no scan", async () => {
    const t = setup();
    const { register } = await registry(t);
    const tooLarge = await t.run((ctx) =>
      ctx.storage.store(new Blob([new Uint8Array(10 * 1024 * 1024 + 1)])),
    );
    const sheepId = await register();

    for (const scanId of [tooLarge, sheepId, "not-a-file"]) {
      expect(
        await errorCode(register({ manualBreeds: pureArashan, passport: passport(scanId) })),
      ).toBe("passport.scanInvalid");
    }
  });
});

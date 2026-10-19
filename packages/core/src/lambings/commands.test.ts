import { describe, expect, test } from "vite-plus/test";

import { addBreed } from "../breeds/commands";
import { arashanBreedId } from "../breeds/breed";
import type { CommandContext } from "../context";
import { createFarm } from "../farms/commands";
import { archiveFlock, createFlock, moveSheep } from "../flocks/commands";
import type { MembershipId, SheepId } from "../ids";
import { wholeShare } from "../pedigree/composition";
import {
  changeSheepOwner,
  deleteSheep,
  registerExternalSheep,
  registerSheep,
  type SheepRegistration,
} from "../sheep/commands";
import { getSheep, getSheepHistory } from "../sheep/queries";
import { InMemoryStore } from "../testing/in-memory";
import { type LambingInput, recordLambing } from "./commands";
import { maxLambs, maxStillborn } from "./lambing";

const settings = { currency: "KGS", timeZone: "Asia/Bishkek", lambAgeMonths: 4 };

/**
 * A Farm with an Admin and an Editor, and an Ewe of the Editor born on 2023-03-01 with the Tag "M-1".
 * The time is 2026-10-18 18:00 in Bishkek, the time zone of the Farm. `ctx` is the context of the
 * Editor; the helpers make records as the Editor.
 */
async function setup() {
  const store = new InMemoryStore();
  const operator = store.addUser("operator", { operator: true });
  const { farmId } = await createFarm(operator, { name: "Арашан", ...settings });
  const admin = store.addMember("admin", farmId, "admin");
  const adminId = store.memberships.at(-1)!.id;
  const editor = store.addMember("editor", farmId, "editor");
  const editorId = store.memberships.at(-1)!.id;
  const as = (user: CommandContext) => store.farmContext(user, farmId);
  const ctx = await as(editor);
  /** Registers an Active Sheep of the Editor as an Initial entry: by default an Ewe. */
  const register = (change: Partial<SheepRegistration> = {}) =>
    registerSheep(ctx, {
      tag: null,
      name: null,
      sex: "ewe",
      birthDate: "2023-03-01",
      notes: null,
      weight: null,
      ownerId: editorId,
      origin: "born",
      initialEntry: true,
      ...change,
    });
  const motherId = await register({ tag: "M-1" });
  /** Records a Lambing of the Mother on 2026-10-10 with one Ram Lamb, by default. */
  const lambing = (change: Partial<LambingInput> = {}) =>
    recordLambing(ctx, {
      motherId,
      fatherId: null,
      date: "2026-10-10",
      lambs: [{ sex: "ram", tag: null, ownerId: null }],
      stillborn: 0,
      ...change,
    });
  return {
    store,
    operator,
    farmId,
    admin,
    adminId,
    editorId,
    as,
    ctx,
    register,
    motherId,
    lambing,
  };
}

/** The audit entries that the store gets after this call, as "command Kind id", sorted. */
function auditFrom(store: InMemoryStore) {
  const start = store.audit.length;
  return () =>
    store.audit
      .slice(start)
      .map((e) => `${e.command} ${e.target.kind} ${e.target.id}`)
      .sort();
}

/** The records that a Lambing writes, as plain data, to check that a failed one wrote nothing. */
function snapshot(store: InMemoryStore) {
  return JSON.parse(
    JSON.stringify({
      sheep: store.sheep,
      flockMoves: store.flockMoves,
      lambings: store.lambings,
      audit: store.audit,
    }),
  ) as unknown;
}

const sheepOf = (store: InMemoryStore, id: SheepId) => store.sheep.find((s) => s.id === id)!;

describe("recordLambing", () => {
  test("twins become two Born, Active Sheep with the parents and the date", async () => {
    const { store, farmId, register, motherId, editorId, lambing } = await setup();
    const fatherId = await register({ sex: "ram", tag: "F-1" });

    const { lambingId, lambIds } = await lambing({
      fatherId,
      lambs: [
        { sex: "ram", tag: "  L-1 ", ownerId: null },
        { sex: "ewe", tag: null, ownerId: null },
      ],
      stillborn: 1,
    });

    expect(lambIds).toHaveLength(2);
    expect(lambIds.map((id) => sheepOf(store, id))).toEqual([
      {
        id: lambIds[0],
        farmId,
        tag: "L-1",
        name: null,
        sex: "ram",
        birthDate: "2026-10-10",
        origin: "born",
        initialEntry: false,
        status: "active",
        ownerId: editorId,
        notes: null,
        weight: null,
        motherId,
        fatherId,
        manualBreeds: [],
        passport: null,
        grade: null,
        flockId: null,
        registeredAt: store.time,
      },
      expect.objectContaining({ id: lambIds[1], tag: null, sex: "ewe", ownerId: editorId }),
    ]);
    expect(store.lambings).toEqual([
      {
        id: lambingId,
        farmId,
        motherId,
        fatherId,
        date: "2026-10-10",
        lambIds,
        stillborn: 1,
        recordedAt: store.time,
      },
    ]);
  });

  test("appends one audit entry for each Lamb and one for the Lambing", async () => {
    const { store, lambing } = await setup();
    const audit = auditFrom(store);

    const { lambingId, lambIds } = await lambing({
      lambs: [
        { sex: "ram", tag: null, ownerId: null },
        { sex: "ewe", tag: null, ownerId: null },
      ],
    });

    expect(audit()).toEqual(
      [
        `lambing.record Lambing ${lambingId}`,
        `lambing.record Sheep ${lambIds[0]}`,
        `lambing.record Sheep ${lambIds[1]}`,
      ].sort(),
    );
    expect(store.audit.at(-1)).toMatchObject({
      actorId: store.users.find((u) => u.username === "editor")?.id,
    });
  });

  test("the history of a Lamb shows the Lambing", async () => {
    const { ctx, lambing } = await setup();

    const { lambIds } = await lambing();

    expect(await getSheepHistory(ctx, { sheepId: lambIds[0]! })).toEqual([
      expect.objectContaining({ command: "lambing.record" }),
    ]);
  });

  test("an Admin records a Lambing too", async () => {
    const { store, as, admin, motherId } = await setup();
    const ctx = await as(admin);

    await recordLambing(ctx, {
      motherId,
      fatherId: null,
      date: "2026-10-10",
      lambs: [{ sex: "ewe", tag: null, ownerId: null }],
      stillborn: 0,
    });

    expect(store.lambings).toHaveLength(1);
  });

  describe("the Owner", () => {
    test("is the Owner of the Mother by default, and the form can give another Member", async () => {
      const { store, editorId, adminId, lambing } = await setup();

      const { lambIds } = await lambing({
        lambs: [
          { sex: "ram", tag: null, ownerId: null },
          { sex: "ewe", tag: null, ownerId: adminId },
        ],
      });

      expect(lambIds.map((id) => sheepOf(store, id).ownerId)).toEqual([editorId, adminId]);
    });

    test("is the Owner of the Mother on the date of the Lambing", async () => {
      const { store, ctx, motherId, editorId, adminId, lambing } = await setup();
      await changeSheepOwner(ctx, { sheepId: motherId, ownerId: adminId, date: "2026-10-12" });

      const before = await lambing({ date: "2026-10-11" });
      const onTheDay = await lambing({ date: "2026-10-12" });

      expect(sheepOf(store, before.lambIds[0]!).ownerId).toBe(editorId);
      expect(sheepOf(store, onTheDay.lambIds[0]!).ownerId).toBe(adminId);
    });

    test("fails if it is not a Member now, and writes nothing", async () => {
      const { store, ctx, motherId, editorId, adminId, lambing } = await setup();
      await changeSheepOwner(ctx, { sheepId: motherId, ownerId: adminId, date: "2026-10-12" });
      // The Editor, the Owner before the change, leaves the Farm.
      store.memberships.find((m) => m.id === editorId)!.archivedAt = store.time;
      const before = snapshot(store);

      await expect(lambing({ date: "2026-10-11" })).rejects.toThrow("sheep.ownerNotMember");
      await expect(
        lambing({ lambs: [{ sex: "ram", tag: null, ownerId: "membership-x" as MembershipId }] }),
      ).rejects.toThrow("sheep.ownerNotMember");
      expect(snapshot(store)).toEqual(before);
    });
  });

  describe("the Flock", () => {
    test("each Lamb goes into the Flock of the Mother, with a move on the date", async () => {
      const { store, ctx, motherId, lambing } = await setup();
      const flockId = await createFlock(ctx, { name: "Северное", locationId: null });
      await moveSheep(ctx, { sheepIds: [motherId], flockId, date: "2026-09-01" });

      const { lambIds } = await lambing({
        lambs: [
          { sex: "ram", tag: null, ownerId: null },
          { sex: "ewe", tag: null, ownerId: null },
        ],
      });

      expect(lambIds.map((id) => sheepOf(store, id).flockId)).toEqual([flockId, flockId]);
      expect(store.flockMoves.filter((m) => lambIds.includes(m.sheepId))).toEqual([
        expect.objectContaining({ sheepId: lambIds[0], flockId, date: "2026-10-10" }),
        expect.objectContaining({ sheepId: lambIds[1], flockId, date: "2026-10-10" }),
      ]);
    });

    test("is the Flock of the Mother on the date, not her Flock of now", async () => {
      const { store, ctx, motherId, lambing } = await setup();
      const north = await createFlock(ctx, { name: "Северное", locationId: null });
      const south = await createFlock(ctx, { name: "Южное", locationId: null });
      await moveSheep(ctx, { sheepIds: [motherId], flockId: north, date: "2026-09-01" });
      await moveSheep(ctx, { sheepIds: [motherId], flockId: south, date: "2026-10-15" });

      const { lambIds } = await lambing({ date: "2026-10-10" });

      expect(sheepOf(store, lambIds[0]!).flockId).toBe(north);
      expect(sheepOf(store, motherId).flockId).toBe(south);
    });

    test("is the Flock at the end of the date, after a move of the Mother on that day", async () => {
      const { store, ctx, motherId, lambing } = await setup();
      const north = await createFlock(ctx, { name: "Северное", locationId: null });
      const south = await createFlock(ctx, { name: "Южное", locationId: null });
      await moveSheep(ctx, { sheepIds: [motherId], flockId: north, date: "2026-09-01" });
      await moveSheep(ctx, { sheepIds: [motherId], flockId: south, date: "2026-10-10" });

      const { lambIds } = await lambing({ date: "2026-10-10" });

      expect(sheepOf(store, lambIds[0]!).flockId).toBe(south);
    });

    test("is no Flock if the Mother was in no Flock on the date", async () => {
      const { store, ctx, motherId, lambing } = await setup();
      const flockId = await createFlock(ctx, { name: "Северное", locationId: null });
      await moveSheep(ctx, { sheepIds: [motherId], flockId, date: "2026-10-15" });

      const { lambIds } = await lambing({ date: "2026-10-10" });

      expect(sheepOf(store, lambIds[0]!).flockId).toBeNull();
      expect(store.flockMoves.filter((m) => m.sheepId === lambIds[0])).toEqual([]);
    });

    test("fails if the Flock of the Mother on the date is Archived now, and writes nothing", async () => {
      const { store, ctx, motherId, lambing } = await setup();
      const north = await createFlock(ctx, { name: "Северное", locationId: null });
      const south = await createFlock(ctx, { name: "Южное", locationId: null });
      await moveSheep(ctx, { sheepIds: [motherId], flockId: north, date: "2026-09-01" });
      await moveSheep(ctx, { sheepIds: [motherId], flockId: south, date: "2026-10-15" });
      await archiveFlock(ctx, { flockId: north, date: "2026-10-16" });
      const before = snapshot(store);

      await expect(lambing({ date: "2026-10-10" })).rejects.toThrow("lambing.flockArchived");
      expect(snapshot(store)).toEqual(before);
      // After the move, the Mother is in a Flock in use.
      await expect(lambing({ date: "2026-10-16" })).resolves.toBeDefined();
    });
  });

  describe("the Breed composition", () => {
    test("comes from the parents and is not stored", async () => {
      const { store, ctx, register, lambing } = await setup();
      const edilbay = await addBreed(ctx, { name: "Эдильбаевская" });
      const motherId = await register({
        tag: "M-2",
        manualBreeds: [{ breedId: arashanBreedId, share: wholeShare }],
      });
      const fatherId = await registerExternalSheep(ctx, {
        tag: "E-1",
        name: null,
        sex: "ram",
        birthDate: null,
        notes: null,
        motherId: null,
        fatherId: null,
        manualBreeds: [{ breedId: edilbay, share: wholeShare }],
      });

      const { lambIds } = await lambing({ motherId, fatherId });

      expect(sheepOf(store, lambIds[0]!).manualBreeds).toEqual([]);
      expect((await getSheep(ctx, { sheepId: lambIds[0]! }))?.composition).toEqual({
        breeds: [
          { breedId: arashanBreedId, share: wholeShare / 2 },
          { breedId: edilbay, share: wholeShare / 2 },
        ].sort((a, b) => (a.breedId < b.breedId ? -1 : 1)),
        unknown: 0,
      });
    });

    test("has the half of an unknown Father as Unknown", async () => {
      const { ctx, register, lambing } = await setup();
      const motherId = await register({
        tag: "M-2",
        manualBreeds: [{ breedId: arashanBreedId, share: wholeShare }],
      });

      const { lambIds } = await lambing({ motherId, fatherId: null });

      expect((await getSheep(ctx, { sheepId: lambIds[0]! }))?.composition).toEqual({
        breeds: [{ breedId: arashanBreedId, share: wholeShare / 2 }],
        unknown: wholeShare / 2,
      });
    });
  });

  describe("the Mother", () => {
    test("is not an External Sheep", async () => {
      const { ctx, lambing } = await setup();
      const external = await registerExternalSheep(ctx, {
        tag: "E-2",
        name: null,
        sex: "ewe",
        birthDate: null,
        notes: null,
        motherId: null,
        fatherId: null,
        manualBreeds: [],
      });

      await expect(lambing({ motherId: external })).rejects.toThrow("lambing.motherExternal");
    });

    test("is an Ewe", async () => {
      const { register, lambing } = await setup();
      const ram = await register({ sex: "ram", tag: "R-1" });

      await expect(lambing({ motherId: ram })).rejects.toThrow("pedigree.motherNotEwe");
    });

    test("is Active now", async () => {
      const { store, motherId, lambing } = await setup();
      sheepOf(store, motherId).status = "sold";

      await expect(lambing()).rejects.toThrow("lambing.motherNotActive");
    });

    test("is a Sheep of the Farm that is not Deleted", async () => {
      const { store, operator, ctx, register, lambing } = await setup();
      const deleted = await register({ tag: "M-2" });
      await deleteSheep(ctx, { sheepId: deleted });
      const { farmId: otherFarmId } = await createFarm(operator, { name: "Другая", ...settings });
      const other = await store.farmContext(
        store.addMember("other", otherFarmId, "admin"),
        otherFarmId,
      );
      const otherEwe = await registerSheep(other, {
        tag: null,
        name: null,
        sex: "ewe",
        birthDate: null,
        notes: null,
        weight: null,
        ownerId: store.memberships.at(-1)!.id,
        origin: "born",
        initialEntry: true,
      });

      await expect(lambing({ motherId: deleted })).rejects.toThrow("pedigree.parentNotFound");
      await expect(lambing({ motherId: otherEwe })).rejects.toThrow("pedigree.parentNotFound");
    });
  });

  describe("the Father", () => {
    test("can be an External Ram", async () => {
      const { store, ctx, lambing } = await setup();
      const fatherId = await registerExternalSheep(ctx, {
        tag: null,
        name: "Чужой",
        sex: "ram",
        birthDate: null,
        notes: null,
        motherId: null,
        fatherId: null,
        manualBreeds: [],
      });

      const { lambIds } = await lambing({ fatherId });

      expect(sheepOf(store, lambIds[0]!).fatherId).toBe(fatherId);
    });

    test("can be a Ram that is not Active now", async () => {
      const { store, register, lambing } = await setup();
      const fatherId = await register({ sex: "ram", tag: "F-1" });
      sheepOf(store, fatherId).status = "dead";

      await expect(lambing({ fatherId })).resolves.toBeDefined();
    });

    test("is a Ram that the Farm has", async () => {
      const { register, lambing } = await setup();
      const ewe = await register({ tag: "E-3" });

      await expect(lambing({ fatherId: ewe })).rejects.toThrow("pedigree.fatherNotRam");
      await expect(lambing({ fatherId: "sheep-x" as SheepId })).rejects.toThrow(
        "pedigree.parentNotFound",
      );
    });
  });

  describe("the date", () => {
    test("is a real date and not in the future", async () => {
      const { lambing } = await setup();

      await expect(lambing({ date: "2026-10-19" })).rejects.toThrow("lambing.dateInvalid");
      await expect(lambing({ date: "2026-02-30" })).rejects.toThrow("lambing.dateInvalid");
      await expect(lambing({ date: "10.10.2026" })).rejects.toThrow("lambing.dateInvalid");
      // Today in the time zone of the Farm.
      await expect(lambing({ date: "2026-10-18" })).resolves.toBeDefined();
    });

    test("is after the birth of each parent", async () => {
      const { register, lambing } = await setup();
      const fatherId = await register({ sex: "ram", tag: "F-1", birthDate: "2026-01-01" });

      await expect(lambing({ date: "2023-03-01" })).rejects.toThrow(
        "pedigree.parentBornAfterChild",
      );
      await expect(lambing({ fatherId, date: "2025-12-31" })).rejects.toThrow(
        "pedigree.parentBornAfterChild",
      );
    });
  });

  describe("the Lambs", () => {
    test("are from 1 to the most of one Lambing", async () => {
      const { lambing } = await setup();
      const lamb = { sex: "ewe" as const, tag: null, ownerId: null };

      await expect(lambing({ lambs: [] })).rejects.toThrow("lambing.lambsRequired");
      await expect(lambing({ lambs: Array(maxLambs + 1).fill(lamb) })).rejects.toThrow(
        "lambing.tooManyLambs",
      );
      await expect(lambing({ lambs: Array(maxLambs).fill(lamb) })).resolves.toBeDefined();
    });

    test("the stillborn Lambs are a whole number up to the most, and no Sheep", async () => {
      const { store, lambing } = await setup();

      for (const stillborn of [-1, 1.5, maxStillborn + 1, Number.NaN]) {
        await expect(lambing({ stillborn })).rejects.toThrow("lambing.stillbornInvalid");
      }
      const sheepBefore = store.sheep.length;
      await lambing({ stillborn: maxStillborn });

      expect(store.sheep.length).toBe(sheepBefore + 1);
      expect(store.lambings.at(-1)?.stillborn).toBe(maxStillborn);
    });

    test("two Lambs with the same Tag fail before any write", async () => {
      const { store, lambing } = await setup();
      const before = snapshot(store);

      await expect(
        lambing({
          lambs: [
            { sex: "ram", tag: "A-12", ownerId: null },
            { sex: "ewe", tag: " а-12 ", ownerId: null },
          ],
        }),
      ).rejects.toThrow("lambing.tagRepeated");
      expect(snapshot(store)).toEqual(before);
    });

    test("a Tag of another Sheep fails, also for the last Lamb, and nothing is written", async () => {
      const { store, lambing } = await setup();
      const before = snapshot(store);

      await expect(
        lambing({
          lambs: [
            { sex: "ram", tag: "L-1", ownerId: null },
            { sex: "ewe", tag: "L-2", ownerId: null },
            { sex: "ewe", tag: "m-1", ownerId: null },
          ],
        }),
      ).rejects.toThrow("sheep.tagTaken");
      await expect(
        lambing({ lambs: [{ sex: "ram", tag: "x".repeat(31), ownerId: null }] }),
      ).rejects.toThrow("sheep.tagTooLong");
      expect(snapshot(store)).toEqual(before);
    });
  });
});

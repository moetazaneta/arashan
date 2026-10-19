import { describe, expect, test } from "vite-plus/test";

import { createFarm } from "../farms/commands";
import { archiveFlock, createFlock, moveSheep } from "../flocks/commands";
import type { SheepId } from "../ids";
import {
  changeSheepOwner,
  deleteSheep,
  registerExternalSheep,
  registerSheep,
  type SheepRegistration,
} from "../sheep/commands";
import { InMemoryStore } from "../testing/in-memory";
import { type LambingInput, recordLambing } from "./commands";
import { ownerAt } from "./lambing";
import { getLambingDefaults, listLambings } from "./queries";

const settings = { currency: "KGS", timeZone: "Asia/Bishkek", lambAgeMonths: 4 };

/** A Farm with an Admin and an Editor, and an Ewe of the Editor. The time is 2026-10-18. */
async function setup() {
  const store = new InMemoryStore();
  const operator = store.addUser("operator", { operator: true });
  const { farmId } = await createFarm(operator, { name: "Арашан", ...settings });
  store.addMember("admin", farmId, "admin");
  const adminId = store.memberships.at(-1)!.id;
  const editor = store.addMember("editor", farmId, "editor");
  const editorId = store.memberships.at(-1)!.id;
  const ctx = await store.farmContext(editor, farmId);
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
  const lambing = (change: Partial<LambingInput> = {}) =>
    recordLambing(ctx, {
      motherId,
      fatherId: null,
      date: "2026-10-10",
      lambs: [{ sex: "ram", tag: null, ownerId: null }],
      stillborn: 0,
      ...change,
    });
  return { store, ctx, adminId, editorId, register, motherId, lambing };
}

describe("ownerAt", () => {
  const sheep = { ownerId: "c" as SheepId as never };
  const changes = [
    { previousOwnerId: "a" as never, ownerId: "b" as never, date: "2026-03-01" },
    { previousOwnerId: "b" as never, ownerId: "c" as never, date: "2026-06-01" },
  ];

  test("is the Owner after the last change on or before the date", () => {
    expect(ownerAt(sheep, changes, "2026-03-01")).toBe("b");
    expect(ownerAt(sheep, changes, "2026-05-31")).toBe("b");
    expect(ownerAt(sheep, changes, "2026-07-01")).toBe("c");
  });

  test("is the first Owner before the first change, and the Owner of now with no change", () => {
    expect(ownerAt(sheep, changes, "2026-02-28")).toBe("a");
    expect(ownerAt(sheep, [], "2020-01-01")).toBe("c");
  });
});

describe("getLambingDefaults", () => {
  test("gives the Owner and the Flock of the Mother on the date", async () => {
    const { ctx, motherId, editorId, adminId } = await setup();
    const north = await createFlock(ctx, { name: "Северное", locationId: null });
    const south = await createFlock(ctx, { name: "Южное", locationId: null });
    await moveSheep(ctx, { sheepIds: [motherId], flockId: north, date: "2026-09-01" });
    await moveSheep(ctx, { sheepIds: [motherId], flockId: south, date: "2026-10-15" });
    await changeSheepOwner(ctx, { sheepId: motherId, ownerId: adminId, date: "2026-10-12" });

    expect(await getLambingDefaults(ctx, { motherId, date: "2026-10-10" })).toEqual({
      ownerId: editorId,
      flock: { id: north, name: "Северное", archived: false },
    });
    expect(await getLambingDefaults(ctx, { motherId, date: "2026-10-16" })).toEqual({
      ownerId: adminId,
      flock: { id: south, name: "Южное", archived: false },
    });
    expect(await getLambingDefaults(ctx, { motherId, date: "2026-08-01" })).toEqual({
      ownerId: editorId,
      flock: null,
    });
  });

  test("shows an Archived Flock, and no Owner who left the Farm", async () => {
    const { store, ctx, motherId, editorId } = await setup();
    const north = await createFlock(ctx, { name: "Северное", locationId: null });
    await moveSheep(ctx, { sheepIds: [motherId], flockId: north, date: "2026-09-01" });
    await moveSheep(ctx, { sheepIds: [motherId], flockId: null, date: "2026-10-15" });
    await archiveFlock(ctx, { flockId: north, date: "2026-10-16" });
    store.memberships.find((m) => m.id === editorId)!.archivedAt = store.time;

    expect(await getLambingDefaults(ctx, { motherId, date: "2026-10-10" })).toEqual({
      ownerId: null,
      flock: { id: north, name: "Северное", archived: true },
    });
  });

  test("is null for an External Sheep or a Sheep that the Farm does not have", async () => {
    const { ctx } = await setup();
    const external = await registerExternalSheep(ctx, {
      tag: null,
      name: "Чужая",
      sex: "ewe",
      birthDate: null,
      notes: null,
      motherId: null,
      fatherId: null,
      manualBreeds: [],
    });

    expect(await getLambingDefaults(ctx, { motherId: external, date: "2026-10-10" })).toBeNull();
    expect(
      await getLambingDefaults(ctx, { motherId: "sheep-x" as SheepId, date: "2026-10-10" }),
    ).toBeNull();
  });

  test("needs a real date", async () => {
    const { ctx, motherId } = await setup();

    await expect(getLambingDefaults(ctx, { motherId, date: "2026-13-01" })).rejects.toThrow(
      "lambing.dateInvalid",
    );
  });
});

describe("listLambings", () => {
  test("gives the Lambings of the Ewe, the newest first, without the Deleted Lambs", async () => {
    const { ctx, register, motherId, lambing } = await setup();
    const fatherId = await register({ sex: "ram", tag: "F-1", name: "Буран" });
    const otherMother = await register({ tag: "M-2" });
    const first = await lambing({ date: "2025-04-01", stillborn: 1 });
    const second = await lambing({
      date: "2026-04-01",
      fatherId,
      lambs: [
        { sex: "ram", tag: "L-1", ownerId: null },
        { sex: "ewe", tag: "L-2", ownerId: null },
      ],
    });
    await lambing({ motherId: otherMother });
    await deleteSheep(ctx, { sheepId: second.lambIds[1]! });

    expect(await listLambings(ctx, { motherId })).toEqual([
      {
        id: second.lambingId,
        date: "2026-04-01",
        father: { id: fatherId, tag: "F-1", name: "Буран", sex: "ram", origin: "born" },
        lambs: [{ id: second.lambIds[0], tag: "L-1", name: null, sex: "ram", origin: "born" }],
        stillborn: 0,
        recordedAt: expect.any(Number),
      },
      {
        id: first.lambingId,
        date: "2025-04-01",
        father: null,
        lambs: [{ id: first.lambIds[0], tag: null, name: null, sex: "ram", origin: "born" }],
        stillborn: 1,
        recordedAt: expect.any(Number),
      },
    ]);
  });

  test("skips a Lamb that got another Mother or birth date later", async () => {
    const { store, ctx, register, motherId, lambing } = await setup();
    const otherMother = await register({ tag: "M-2" });
    const { lambIds } = await lambing({
      date: "2026-04-01",
      lambs: [
        { sex: "ram", tag: "L-1", ownerId: null },
        { sex: "ewe", tag: "L-2", ownerId: null },
        { sex: "ewe", tag: "L-3", ownerId: null },
      ],
    });
    // A Member corrects the Lambs on their cards (`updateSheep`).
    store.sheep.find((s) => s.id === lambIds[1])!.motherId = otherMother;
    store.sheep.find((s) => s.id === lambIds[2])!.birthDate = "2026-04-02";

    const [row] = await listLambings(ctx, { motherId });
    expect(row?.lambs.map((lamb) => lamb.tag)).toEqual(["L-1"]);
  });

  test("is empty for a Sheep with no Lambing", async () => {
    const { ctx, register } = await setup();
    const ram = await register({ sex: "ram" });

    expect(await listLambings(ctx, { motherId: ram })).toEqual([]);
  });
});

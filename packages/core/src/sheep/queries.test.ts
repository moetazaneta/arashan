import { describe, expect, test } from "vite-plus/test";

import type { CommandContext } from "../context";
import { createFarm } from "../farms/commands";
import type { MembershipId, SheepId } from "../ids";
import { InMemoryStore } from "../testing/in-memory";
import { changeSheepOwner, registerSheep, type SheepRegistration, updateSheep } from "./commands";
import { getSheep, getSheepHistory, listSheep, listSheepOwners } from "./queries";

const settings = { currency: "KGS", timeZone: "Asia/Bishkek", lambAgeMonths: 4 };

async function setup() {
  const store = new InMemoryStore();
  const operator = store.addUser("operator", { operator: true });
  const { farmId } = await createFarm(operator, { name: "Арашан", ...settings });
  const admin = store.addMember("admin", farmId, "admin");
  const editor = store.addMember("editor", farmId, "editor");
  const [adminId, editorId] = store.memberships.map((m) => m.id) as [MembershipId, MembershipId];
  const as = (user: CommandContext) => store.farmContext(user, farmId);
  const register = async (change: Partial<SheepRegistration> = {}) =>
    registerSheep(await as(editor), {
      tag: null,
      name: null,
      sex: "ewe",
      birthDate: null,
      notes: null,
      weight: null,
      ownerId: editorId,
      origin: "born",
      initialEntry: true,
      ...change,
    });
  return { store, operator, farmId, admin, editor, adminId, editorId, as, register };
}

describe("listSheep", () => {
  test("gives the Sheep by Tag in the natural order, the Sheep without a Tag last, then by name", async () => {
    const { editor, as, register } = await setup();
    await register({ tag: "10" });
    await register({ name: "Белка" });
    await register({ tag: "2" });
    await register({ name: "Алтын" });
    await register({ tag: "A-1" });

    const rows = await listSheep(await as(editor));

    expect(rows.map((row) => row.tag ?? row.name)).toEqual(["2", "10", "A-1", "Алтын", "Белка"]);
  });

  test("gives the fields and the name of the Owner, without the Deleted and the External Sheep", async () => {
    const { store, editor, editorId, as, register } = await setup();
    const sheepId = await register({
      tag: "A-1",
      name: "Белка",
      birthDate: "2026-07-01",
      weight: { kg: 20, date: "2026-10-01" },
      notes: "Шустрая",
    });
    const external = await register({ tag: "X-1" });
    store.sheep.find((s) => s.id === external)!.origin = "external";
    const deleted = await register({ tag: "D-1" });
    store.sheep.find((s) => s.id === deleted)!.deletedAt = store.time;

    expect(await listSheep(await as(editor))).toEqual([
      {
        id: sheepId,
        tag: "A-1",
        name: "Белка",
        sex: "ewe",
        birthDate: "2026-07-01",
        origin: "born",
        initialEntry: true,
        status: "active",
        owner: { id: editorId, name: "editor" },
        weight: { kg: 20, date: "2026-10-01" },
        notes: "Шустрая",
        registeredAt: store.time,
      },
    ]);
  });

  test("shows the name of a removed Owner", async () => {
    const { store, editor, adminId, as, register } = await setup();
    await register({ tag: "1", ownerId: adminId });
    store.sheep[0]!.status = "sold";
    store.memberships.find((m) => m.id === adminId)!.archivedAt = store.time;

    const [row] = await listSheep(await as(editor));

    expect(row?.owner).toEqual({ id: adminId, name: "admin" });
  });
});

describe("getSheep", () => {
  test("gives the card with the Owner at the registration, without a date", async () => {
    const { editor, editorId, as, register } = await setup();
    const sheepId = await register({ tag: "A-1" });

    expect(await getSheep(await as(editor), { sheepId })).toMatchObject({
      id: sheepId,
      tag: "A-1",
      owners: [{ owner: { id: editorId, name: "editor" }, since: null }],
    });
  });

  test("gives null for a Sheep that is not in the Farm", async () => {
    const { store, operator, editor, as } = await setup();
    const { farmId: otherFarmId } = await createFarm(operator, { name: "Другая", ...settings });
    const other = store.addMember("other", otherFarmId, "admin");
    const foreign = await registerSheep(await store.farmContext(other, otherFarmId), {
      tag: null,
      name: null,
      sex: "ram",
      birthDate: null,
      notes: null,
      weight: null,
      ownerId: store.memberships.at(-1)!.id,
      origin: "bought",
      initialEntry: true,
    });

    expect(await getSheep(await as(editor), { sheepId: foreign })).toBeNull();
    expect(await getSheep(await as(editor), { sheepId: "unknown" as SheepId })).toBeNull();
  });
});

describe("getSheepHistory", () => {
  test("shows who changed the Sheep and when, the newest first", async () => {
    const { store, admin, editor, adminId, as, register } = await setup();
    const registeredAt = store.time;
    const sheepId = await register({ tag: "A-1" });
    store.time += 60_000;
    await updateSheep(await as(admin), {
      sheepId,
      tag: "A-1",
      name: "Белка",
      sex: "ewe",
      birthDate: null,
      notes: null,
      weight: null,
    });
    store.time += 60_000;
    await changeSheepOwner(await as(admin), { sheepId, ownerId: adminId, date: "2026-10-18" });
    const userId = (username: string) => store.users.find((u) => u.username === username)!.id;

    expect(await getSheepHistory(await as(editor), { sheepId })).toEqual([
      {
        at: registeredAt + 120_000,
        actor: { id: userId("admin"), name: "admin" },
        command: "sheep.changeOwner",
      },
      {
        at: registeredAt + 60_000,
        actor: { id: userId("admin"), name: "admin" },
        command: "sheep.update",
      },
      {
        at: registeredAt,
        actor: { id: userId("editor"), name: "editor" },
        command: "sheep.register",
      },
    ]);
  });

  test("shows no entry of another Farm or of another record", async () => {
    const { store, editor, as, register } = await setup();
    const sheepId = await register();
    store.audit.push(
      {
        at: store.time,
        actorId: null,
        farmId: "farm-other" as never,
        command: "sheep.update",
        target: { kind: "Sheep", id: sheepId },
      },
      {
        at: store.time,
        actorId: null,
        farmId: store.farms[0]!.id,
        command: "farm.updateSettings",
        target: { kind: "Farm", id: sheepId },
      },
    );

    expect((await getSheepHistory(await as(editor), { sheepId })).map((e) => e.command)).toEqual([
      "sheep.register",
    ]);
  });

  test("an unknown Sheep is not found", async () => {
    const { editor, as } = await setup();

    await expect(
      getSheepHistory(await as(editor), { sheepId: "unknown" as SheepId }),
    ).rejects.toMatchObject({ code: "sheep.notFound" });
  });
});

describe("listSheepOwners", () => {
  test("gives the Members now by username, and marks the Member who asks", async () => {
    const { store, farmId, editor, adminId, editorId, as } = await setup();
    store.addMember("gone", farmId, "editor");
    store.memberships.at(-1)!.archivedAt = store.time;

    expect(await listSheepOwners(await as(editor))).toEqual([
      { id: adminId, name: "admin", isMe: false },
      { id: editorId, name: "editor", isMe: true },
    ]);
  });
});

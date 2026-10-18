import type { FunctionArgs } from "convex/server";
import { describe, expect, test } from "vite-plus/test";

import { api } from "./_generated/api";
import type { TableNames } from "./_generated/dataModel";
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

/** A Farm with an Admin and an Editor, and the calls that the tests make as the Admin. */
async function flockFarm(t: Test, farmName?: string) {
  const farm = await farmWithEditor(t, farmName);
  const { admin, farmId } = farm;
  const ownerId = await farm.membershipId(`admin${farmName ?? ""}`);
  return {
    ...farm,
    register: (fields: Partial<typeof ram> = {}) =>
      admin.mutation(api.sheep.register, { farmId, ...ram, ownerId, ...fields }),
    createFlock: (name: string, locationId: string | null = null) =>
      admin.mutation(api.flocks.create, { farmId, name, locationId }),
    createShepherd: (name: string) =>
      admin.mutation(api.shepherds.create, { farmId, name, phone: null, notes: null }),
    assign: (flockId: string, shepherdId: string, from: string, to: string | null = null) =>
      admin.mutation(api.flocks.assignShepherd, { farmId, flockId, shepherdId, from, to }),
    move: (sheepIds: string[], flockId: string | null, date = "2025-06-01") =>
      admin.mutation(api.flocks.moveSheep, { farmId, sheepIds, flockId, date }),
    undo: (sheepId: string) => admin.mutation(api.flocks.undoMove, { farmId, sheepId }),
  };
}

async function rowOf<Table extends TableNames>(t: Test, table: Table, id: string) {
  return t.run((ctx) => ctx.db.get(ctx.db.normalizeId(table, id)!));
}

async function flockMoves(t: Test) {
  return t.run((ctx) => ctx.db.query("sheepFlockMoves").collect());
}

/** The audit entries of all Farms, oldest first. */
async function auditLog(t: Test) {
  const rows = await t.run((ctx) => ctx.db.query("auditLog").collect());
  return rows.map(({ command, targetKind, targetId }) => ({ command, targetKind, targetId }));
}

describe("flocks", () => {
  test("a Flock comes back from the list and its card, with null for no Location", async () => {
    const t = setup();
    const { admin, farmId, createFlock } = await flockFarm(t);
    const locationId = await admin.mutation(api.locations.create, {
      farmId,
      name: "Кошара",
      notes: null,
    });

    const placed = await createFlock("Отара 10", locationId);
    const plain = await createFlock("  Отара   2 ");

    const location = { id: locationId, name: "Кошара", archived: false };
    expect(await admin.query(api.flocks.list, { farmId })).toEqual([
      { id: plain, name: "Отара 2", archived: false, location: null, shepherds: [], sheepCount: 0 },
      { id: placed, name: "Отара 10", archived: false, location, shepherds: [], sheepCount: 0 },
    ]);
    expect(await admin.query(api.flocks.get, { farmId, flockId: placed })).toEqual({
      id: placed,
      name: "Отара 10",
      archived: false,
      location,
      shepherds: [],
      sheepCount: 0,
      assignments: [],
      sheep: [],
    });
    expect(await admin.query(api.flocks.get, { farmId, flockId: "not-an-id" })).toBeNull();
    const row = await rowOf(t, "flocks", plain);
    expect(row).toMatchObject({ farmId, name: "Отара 2", nameKey: "отара 2" });
    expect(row?.locationId).toBeUndefined();
    expect(row?.archivedAt).toBeUndefined();
    expect(await rowOf(t, "flocks", placed)).toMatchObject({ locationId });
  });

  test("an update with no Location removes the field; a name is taken whatever its case", async () => {
    const t = setup();
    const { admin, farmId, createFlock } = await flockFarm(t);
    const other = await flockFarm(t, "Другая");
    const locationId = await admin.mutation(api.locations.create, {
      farmId,
      name: "Кошара",
      notes: null,
    });
    const flockId = await createFlock("Отара", locationId);
    const firs = await createFlock("Ёлочная");

    await admin.mutation(api.flocks.update, { farmId, flockId, name: "Отара", locationId: null });
    // The same fields again change nothing.
    await admin.mutation(api.flocks.update, { farmId, flockId, name: " Отара ", locationId: null });

    expect((await rowOf(t, "flocks", flockId))?.locationId).toBeUndefined();
    expect(await errorCode(createFlock(" ЕЛОЧНАЯ "))).toBe("flock.nameTaken");
    expect(
      await errorCode(
        admin.mutation(api.flocks.update, { farmId, flockId, name: "ёлочная", locationId: null }),
      ),
    ).toBe("flock.nameTaken");
    expect(await errorCode(createFlock("  "))).toBe("flock.nameRequired");
    expect(await other.createFlock("Ёлочная")).toEqual(expect.any(String));
    expect((await auditLog(t)).filter((entry) => entry.targetKind === "Flock")).toEqual([
      { command: "flock.create", targetKind: "Flock", targetId: flockId },
      { command: "flock.create", targetKind: "Flock", targetId: firs },
      { command: "flock.update", targetKind: "Flock", targetId: flockId },
      { command: "flock.create", targetKind: "Flock", targetId: expect.any(String) },
    ]);
  });

  test("an assignment comes back on the card, the newest first, with an entry for both sides", async () => {
    const t = setup();
    const { admin, farmId, createFlock, createShepherd, assign } = await flockFarm(t);
    const flockId = await createFlock("Отара");
    const asan = await createShepherd("Асан");
    const bakyt = await createShepherd("Бакыт");
    const before = (await auditLog(t)).length;

    const past = await assign(flockId, asan, "2025-01-01", "2025-03-31");
    const current = await assign(flockId, asan, "2025-04-01");
    const second = await assign(flockId, bakyt, "2025-05-01");

    expect(await rowOf(t, "flockAssignments", past)).toMatchObject({
      farmId,
      flockId,
      shepherdId: asan,
      from: "2025-01-01",
      to: "2025-03-31",
    });
    expect((await rowOf(t, "flockAssignments", current))?.to).toBeUndefined();
    const asanRef = { id: asan, name: "Асан", archived: false };
    const bakytRef = { id: bakyt, name: "Бакыт", archived: false };
    expect(await admin.query(api.flocks.get, { farmId, flockId })).toMatchObject({
      shepherds: [asanRef, bakytRef],
      assignments: [
        { id: second, shepherd: bakytRef, from: "2025-05-01", to: null },
        { id: current, shepherd: asanRef, from: "2025-04-01", to: null },
        { id: past, shepherd: asanRef, from: "2025-01-01", to: "2025-03-31" },
      ],
    });
    expect(await admin.query(api.shepherds.list, { farmId })).toMatchObject([
      { id: asan, flocks: [{ id: flockId, name: "Отара", archived: false }] },
      { id: bakyt, flocks: [{ id: flockId }] },
    ]);
    expect((await auditLog(t)).slice(before)).toEqual(
      [asan, asan, bakyt].flatMap((shepherdId) => [
        { command: "flock.assignShepherd", targetKind: "Flock", targetId: flockId },
        { command: "flock.assignShepherd", targetKind: "Shepherd", targetId: shepherdId },
      ]),
    );
    expect(await errorCode(assign(flockId, asan, "2025-03-01", "2025-04-15"))).toBe(
      "flock.assignmentOverlaps",
    );
    expect(await errorCode(assign(flockId, bakyt, "2025-04-01", "2025-03-01"))).toBe(
      "flock.assignmentDatesInvalid",
    );
    expect(await errorCode(assign(flockId, bakyt, "2999-01-01"))).toBe(
      "flock.assignmentDatesInvalid",
    );
  });

  test("an assignment ends and goes on again; a removed one is Deleted and hidden", async () => {
    const t = setup();
    const { admin, farmId, createFlock, createShepherd, assign } = await flockFarm(t);
    const flockId = await createFlock("Отара");
    const shepherdId = await createShepherd("Асан");
    const assignmentId = await assign(flockId, shepherdId, "2025-04-01");
    const update = (to: string | null) =>
      admin.mutation(api.flocks.updateAssignment, { farmId, assignmentId, from: "2025-04-01", to });
    const remove = () => admin.mutation(api.flocks.removeAssignment, { farmId, assignmentId });

    await update("2025-09-30");
    expect(await rowOf(t, "flockAssignments", assignmentId)).toMatchObject({ to: "2025-09-30" });
    expect(await admin.query(api.flocks.list, { farmId })).toMatchObject([{ shepherds: [] }]);
    await update(null);
    expect((await rowOf(t, "flockAssignments", assignmentId))?.to).toBeUndefined();
    const before = (await auditLog(t)).length;

    await remove();

    expect(await rowOf(t, "flockAssignments", assignmentId)).toMatchObject({
      from: "2025-04-01",
      deletedAt: expect.any(Number),
    });
    expect((await auditLog(t)).slice(before)).toEqual([
      { command: "flock.removeAssignment", targetKind: "Flock", targetId: flockId },
      { command: "flock.removeAssignment", targetKind: "Shepherd", targetId: shepherdId },
    ]);
    expect(await admin.query(api.flocks.get, { farmId, flockId })).toMatchObject({
      shepherds: [],
      assignments: [],
    });
    expect(await admin.query(api.shepherds.list, { farmId })).toMatchObject([{ flocks: [] }]);
    expect(await errorCode(remove())).toBe("flock.assignmentNotFound");
    expect(await errorCode(update("2025-09-30"))).toBe("flock.assignmentNotFound");
    // The Deleted assignment no longer overlaps a new one.
    expect(await assign(flockId, shepherdId, "2025-04-01")).toEqual(expect.any(String));
  });

  test("a Flock with Sheep cannot be archived; an Archived one ends its assignments", async () => {
    const t = setup();
    const { admin, farmId, register, createFlock, createShepherd, assign, move } =
      await flockFarm(t);
    const flockId = await createFlock("Отара");
    const shepherdId = await createShepherd("Асан");
    const assignmentId = await assign(flockId, shepherdId, "2025-05-01");
    const sheepId = await register();
    await move([sheepId], flockId, "2025-06-01");
    const archive = (date: string) => admin.mutation(api.flocks.archive, { farmId, flockId, date });

    expect(await errorCode(archive("2025-08-31"))).toBe("flock.notEmpty");
    await move([sheepId], null, "2025-07-01");
    expect(await errorCode(archive("2025-04-30"))).toBe("flock.endDateInvalid");
    expect((await rowOf(t, "flocks", flockId))?.archivedAt).toBeUndefined();
    const before = (await auditLog(t)).length;

    await archive("2025-08-31");

    expect(await rowOf(t, "flocks", flockId)).toMatchObject({ archivedAt: expect.any(Number) });
    expect(await rowOf(t, "flockAssignments", assignmentId)).toMatchObject({ to: "2025-08-31" });
    expect((await auditLog(t)).slice(before)).toEqual([
      { command: "flock.archive", targetKind: "Flock", targetId: flockId },
      { command: "flock.archive", targetKind: "Shepherd", targetId: shepherdId },
    ]);
    expect(await admin.query(api.flocks.list, { farmId })).toMatchObject([
      { id: flockId, archived: true, shepherds: [] },
    ]);
    expect(await errorCode(move([sheepId], flockId, "2025-09-01"))).toBe("flock.archived");
    expect(await errorCode(assign(flockId, shepherdId, "2025-09-01"))).toBe("flock.archived");

    await admin.mutation(api.flocks.unarchive, { farmId, flockId });

    expect((await rowOf(t, "flocks", flockId))?.archivedAt).toBeUndefined();
    expect((await auditLog(t)).at(-1)).toEqual({
      command: "flock.unarchive",
      targetKind: "Flock",
      targetId: flockId,
    });
  });

  test("a Flock whose Location was archived after it comes back only with a Location in use", async () => {
    const t = setup();
    const { admin, farmId, createFlock } = await flockFarm(t);
    const locationId = await admin.mutation(api.locations.create, {
      farmId,
      name: "Кошара",
      notes: null,
    });
    const flockId = await createFlock("Отара", locationId);
    await admin.mutation(api.flocks.archive, { farmId, flockId, date: "2025-06-01" });
    await admin.mutation(api.locations.archive, { farmId, locationId });

    expect(await errorCode(admin.mutation(api.flocks.unarchive, { farmId, flockId }))).toBe(
      "location.archived",
    );
    expect(await admin.query(api.flocks.list, { farmId })).toMatchObject([
      { archived: true, location: { id: locationId, archived: true } },
    ]);
  });

  test("a bulk move of 50 Sheep is one command and writes one audit entry for each Sheep", async () => {
    const t = setup();
    const { admin, farmId, register, createFlock } = await flockFarm(t);
    const flockId = await createFlock("Отара");
    const sheepIds: string[] = [];
    for (let i = 1; i <= 50; i++) sheepIds.push(await register({ tag: `A-${i}` }));
    const before = (await auditLog(t)).length;

    expect(
      await admin.mutation(api.flocks.moveSheep, {
        farmId,
        sheepIds,
        flockId,
        date: "2025-06-01",
      }),
    ).toEqual({ moved: 50 });

    const moves = await flockMoves(t);
    expect(moves).toHaveLength(50);
    expect(moves.map((move) => move.sheepId).toSorted()).toEqual(sheepIds.toSorted());
    for (const move of moves) {
      expect(move).toMatchObject({ farmId, flockId, date: "2025-06-01", at: expect.any(Number) });
    }
    for (const sheepId of sheepIds) {
      expect(await rowOf(t, "sheep", sheepId)).toMatchObject({ flockId });
    }
    const entries = (await auditLog(t)).slice(before);
    expect(entries).toHaveLength(50);
    expect(entries.every((e) => e.command === "sheep.move" && e.targetKind === "Sheep")).toBe(true);
    expect(new Set(entries.map((entry) => entry.targetId))).toEqual(new Set(sheepIds));
    expect(await admin.query(api.flocks.list, { farmId })).toMatchObject([{ sheepCount: 50 }]);
  });

  test("a bulk move out of all Flocks removes the field; a Sheep already out stays as it is", async () => {
    const t = setup();
    const { admin, farmId, register, createFlock, move } = await flockFarm(t);
    const flockId = await createFlock("Отара");
    const sheepIds = [await register(), await register(), await register()];
    await move(sheepIds, flockId, "2025-06-01");

    expect(await move(sheepIds, null, "2025-07-01")).toEqual({ moved: 3 });

    for (const sheepId of sheepIds) {
      expect((await rowOf(t, "sheep", sheepId))?.flockId).toBeUndefined();
    }
    const out = (await flockMoves(t)).filter((row) => row.date === "2025-07-01");
    expect(out).toHaveLength(3);
    expect(out.every((row) => row.flockId === undefined)).toBe(true);
    expect(await admin.query(api.sheep.list, { farmId })).toMatchObject(
      sheepIds.map(() => ({ flock: null })),
    );
    expect(await admin.query(api.flocks.list, { farmId })).toMatchObject([{ sheepCount: 0 }]);
    const entries = (await auditLog(t)).length;
    expect(await move(sheepIds, null, "2025-08-01")).toEqual({ moved: 0 });
    expect(await flockMoves(t)).toHaveLength(6);
    expect(await auditLog(t)).toHaveLength(entries);
  });

  test("a Sheep in a Flock shows the Flock in the Sheep list, its card and the Flock card", async () => {
    const t = setup();
    const { admin, farmId, register, createFlock, move } = await flockFarm(t);
    const flockId = await createFlock("Отара");
    const inFlock = await register({ tag: "A-1", name: "Борька" });
    const outside = await register({ tag: "A-2" });

    await move([inFlock], flockId, "2025-06-01");

    const flock = { id: flockId, name: "Отара", archived: false };
    expect(await admin.query(api.sheep.list, { farmId })).toMatchObject([
      { id: inFlock, flock },
      { id: outside, flock: null },
    ]);
    expect(await admin.query(api.sheep.get, { farmId, sheepId: inFlock })).toMatchObject({
      flock,
      flocks: [{ flock, from: "2025-06-01", to: null, shepherds: [] }],
    });
    expect(await admin.query(api.flocks.get, { farmId, flockId })).toMatchObject({
      sheepCount: 1,
      sheep: [{ id: inFlock, tag: "A-1", name: "Борька", sex: "ram", birthDate: "2025-03-01" }],
    });
  });

  test("if one Sheep cannot move, no Sheep moves", async () => {
    const t = setup();
    const { admin, farmId, register, createFlock, move } = await flockFarm(t);
    const other = await flockFarm(t, "Другая");
    const flockId = await createFlock("Отара");
    const mine = await register();
    const deleted = await register();
    await admin.mutation(api.sheep.markDeleted, { farmId, sheepId: deleted });
    const stranger = await other.register();

    for (const sheepId of [stranger, deleted, "not-an-id"]) {
      expect(await errorCode(move([mine, sheepId], flockId))).toBe("sheep.notFound");
    }
    // Not in the future, not before the birth date, and a real date.
    expect(await errorCode(move([mine], flockId, "2999-01-01"))).toBe("sheep.moveDateInvalid");
    expect(await errorCode(move([mine], flockId, "2025-02-01"))).toBe("sheep.moveDateInvalid");
    expect(await errorCode(move([mine], flockId, "2025-02-30"))).toBe("sheep.dateInvalid");

    expect(await flockMoves(t)).toEqual([]);
    expect((await rowOf(t, "sheep", mine))?.flockId).toBeUndefined();
    expect((await auditLog(t)).filter((entry) => entry.command === "sheep.move")).toEqual([]);
    // The same Sheep twice moves one time, and a Sheep in the Flock already stays as it is.
    expect(await move([mine, mine], flockId)).toEqual({ moved: 1 });
    expect(await move([mine], flockId, "2025-07-01")).toEqual({ moved: 0 });
    expect(await flockMoves(t)).toHaveLength(1);
  });

  test("an undo makes the last move Deleted and takes the Sheep back, until no move is left", async () => {
    const t = setup();
    const { admin, farmId, register, createFlock, move, undo } = await flockFarm(t);
    const north = await createFlock("Северная");
    const south = await createFlock("Южная");
    const sheepId = await register();
    await move([sheepId], north, "2025-06-01");
    await move([sheepId], south, "2025-07-01");
    const [intoNorth, intoSouth] = await flockMoves(t);

    await undo(sheepId);

    expect(await rowOf(t, "sheep", sheepId)).toMatchObject({ flockId: north });
    expect(await rowOf(t, "sheepFlockMoves", intoSouth!._id)).toMatchObject({
      flockId: south,
      deletedAt: expect.any(Number),
    });
    expect((await rowOf(t, "sheepFlockMoves", intoNorth!._id))?.deletedAt).toBeUndefined();
    expect(await admin.query(api.sheep.get, { farmId, sheepId })).toMatchObject({
      flocks: [{ flock: { id: north }, from: "2025-06-01", to: null }],
    });

    await undo(sheepId);

    expect((await rowOf(t, "sheep", sheepId))?.flockId).toBeUndefined();
    expect(await admin.query(api.sheep.get, { farmId, sheepId })).toMatchObject({ flocks: [] });
    expect(await errorCode(undo(sheepId))).toBe("sheep.noMoveToUndo");
    expect(
      (await auditLog(t))
        .filter((entry) => entry.targetKind === "Sheep")
        .map(({ command, targetId }) => [command, targetId]),
    ).toEqual(
      ["sheep.register", "sheep.move", "sheep.move", "sheep.undoMove", "sheep.undoMove"].map(
        (command) => [command, sheepId],
      ),
    );
    // The Deleted moves do not count: a new move can have an earlier date.
    expect(await move([sheepId], south, "2025-05-01")).toEqual({ moved: 1 });
  });

  test("an undo cannot take a Sheep back into an Archived Flock", async () => {
    const t = setup();
    const { admin, farmId, register, createFlock, move, undo } = await flockFarm(t);
    const north = await createFlock("Северная");
    const south = await createFlock("Южная");
    const sheepId = await register();
    await move([sheepId], north, "2025-06-01");
    await move([sheepId], south, "2025-07-01");
    await admin.mutation(api.flocks.archive, { farmId, flockId: north, date: "2025-07-01" });

    expect(await errorCode(undo(sheepId))).toBe("flock.archived");
    expect(await rowOf(t, "sheep", sheepId)).toMatchObject({ flockId: south });
    expect((await flockMoves(t)).every((row) => row.deletedAt === undefined)).toBe(true);
  });

  test("the Flocks and Shepherds responsible for a Sheep on a date", async () => {
    const t = setup();
    const { admin, farmId, register, createFlock, createShepherd, assign, move } =
      await flockFarm(t);
    const north = await createFlock("Северная");
    const south = await createFlock("Южная");
    const asan = await createShepherd("Асан");
    const bakyt = await createShepherd("Бакыт");
    await assign(north, asan, "2025-01-01");
    await assign(south, bakyt, "2025-01-01", "2025-06-30");
    const sheepId = await register();
    await move([sheepId], north, "2025-06-01");
    await move([sheepId], south, "2025-07-01");
    const responsible = (date: string) =>
      admin.query(api.flocks.responsible, { farmId, sheepId, date });

    expect(await responsible("2025-05-31")).toEqual([]);
    expect(await responsible("2025-06-15")).toEqual([
      {
        flock: { id: north, name: "Северная", archived: false },
        shepherds: [{ id: asan, name: "Асан", archived: false }],
      },
    ]);
    // On the day of the move, both Flocks; Bakyt's assignment ended the day before.
    expect(await responsible("2025-07-01")).toEqual([
      {
        flock: { id: north, name: "Северная", archived: false },
        shepherds: [{ id: asan, name: "Асан", archived: false }],
      },
      { flock: { id: south, name: "Южная", archived: false }, shepherds: [] },
    ]);
    expect(await errorCode(responsible("01.07.2025"))).toBe("sheep.dateInvalid");
  });

  test("a Flock, an assignment or a Sheep of another Farm, or a made-up id, is not found", async () => {
    const t = setup();
    const { admin, farmId, register, createFlock, createShepherd, move, undo } = await flockFarm(t);
    const other = await flockFarm(t, "Другая");
    const flockId = await createFlock("Отара");
    const shepherdId = await createShepherd("Асан");
    const sheepId = await register();
    const strangerFlock = await other.createFlock("Отара");
    const strangerAssignment = await other.assign(
      strangerFlock,
      await other.createShepherd("Бакыт"),
      "2025-01-01",
    );
    const strangerSheep = await other.register();
    await other.move([strangerSheep], strangerFlock, "2025-06-01");

    for (const id of [strangerFlock, "not-an-id"]) {
      expect(await admin.query(api.flocks.get, { farmId, flockId: id })).toBeNull();
      expect(
        await errorCode(
          admin.mutation(api.flocks.update, {
            farmId,
            flockId: id,
            name: "Новая",
            locationId: null,
          }),
        ),
      ).toBe("flock.notFound");
      expect(
        await errorCode(
          admin.mutation(api.flocks.archive, { farmId, flockId: id, date: "2025-06-01" }),
        ),
      ).toBe("flock.notFound");
      expect(await errorCode(admin.mutation(api.flocks.unarchive, { farmId, flockId: id }))).toBe(
        "flock.notFound",
      );
      expect(
        await errorCode(
          admin.mutation(api.flocks.assignShepherd, {
            farmId,
            flockId: id,
            shepherdId,
            from: "2025-06-01",
            to: null,
          }),
        ),
      ).toBe("flock.notFound");
      expect(await errorCode(move([sheepId], id))).toBe("flock.notFound");
    }
    for (const assignmentId of [strangerAssignment, "not-an-id"]) {
      expect(
        await errorCode(
          admin.mutation(api.flocks.updateAssignment, {
            farmId,
            assignmentId,
            from: "2025-01-01",
            to: "2025-02-01",
          }),
        ),
      ).toBe("flock.assignmentNotFound");
      expect(
        await errorCode(admin.mutation(api.flocks.removeAssignment, { farmId, assignmentId })),
      ).toBe("flock.assignmentNotFound");
    }
    for (const id of [strangerSheep, "not-an-id"]) {
      expect(await errorCode(move([id], flockId))).toBe("sheep.notFound");
      expect(await errorCode(move([id], null))).toBe("sheep.notFound");
      expect(await errorCode(undo(id))).toBe("sheep.notFound");
      expect(
        await errorCode(
          admin.query(api.flocks.responsible, { farmId, sheepId: id, date: "2025-06-01" }),
        ),
      ).toBe("sheep.notFound");
    }
    // The records of the other Farm did not change.
    expect(
      await other.admin.query(api.flocks.get, { farmId: other.farmId, flockId: strangerFlock }),
    ).toMatchObject({ name: "Отара", sheepCount: 1, assignments: [{ id: strangerAssignment }] });
    expect(await rowOf(t, "sheep", strangerSheep)).toMatchObject({ flockId: strangerFlock });
  });

  test("a User who is not a Member of the Farm sees and changes no Flock", async () => {
    const t = setup();
    const { farmId, register, createFlock } = await flockFarm(t);
    const flockId = await createFlock("Отара");
    const sheepId = await register();
    const stranger = await logIn(t, "stranger");

    expect(await errorCode(stranger.query(api.flocks.list, { farmId }))).toBe("farm.notMember");
    expect(await errorCode(stranger.query(api.flocks.get, { farmId, flockId }))).toBe(
      "farm.notMember",
    );
    expect(
      await errorCode(
        stranger.query(api.flocks.responsible, { farmId, sheepId, date: "2025-06-01" }),
      ),
    ).toBe("farm.notMember");
    expect(
      await errorCode(
        stranger.mutation(api.flocks.create, { farmId, name: "Новая", locationId: null }),
      ),
    ).toBe("farm.notMember");
    expect(
      await errorCode(
        stranger.mutation(api.flocks.moveSheep, {
          farmId,
          sheepIds: [sheepId],
          flockId,
          date: "2025-06-01",
        }),
      ),
    ).toBe("farm.notMember");
    expect(await errorCode(stranger.mutation(api.flocks.undoMove, { farmId, sheepId }))).toBe(
      "farm.notMember",
    );
  });
});

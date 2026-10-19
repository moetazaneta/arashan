import type { FunctionArgs } from "convex/server";
import { describe, expect, test } from "vite-plus/test";

import { api } from "./_generated/api";
import type { TableNames } from "./_generated/dataModel";
import { errorCode, farmWithEditor, type Test, setup } from "./test.setup";

/** An Ewe Born on the Farm in 2023, with only the fields that a Sheep must have. */
const ewe: Omit<FunctionArgs<typeof api.sheep.register>, "farmId" | "ownerId"> = {
  tag: null,
  name: null,
  sex: "ewe",
  birthDate: "2023-03-01",
  notes: null,
  weight: null,
  origin: "born",
  initialEntry: false,
};

/** A Farm with an Admin and an Editor, an Ewe of the Admin, and the calls of the Admin. */
async function lambingFarm(t: Test, farmName?: string) {
  const farm = await farmWithEditor(t, farmName);
  const { admin, farmId } = farm;
  const ownerId = await farm.membershipId(`admin${farmName ?? ""}`);
  const register = (fields: Partial<typeof ewe> = {}) =>
    admin.mutation(api.sheep.register, { farmId, ...ewe, ownerId, ...fields });
  const motherId = await register({ tag: "M-1" });
  type Lambing = Omit<FunctionArgs<typeof api.lambings.record>, "farmId">;
  return {
    ...farm,
    ownerId,
    register,
    motherId,
    record: (fields: Partial<Lambing> = {}) =>
      admin.mutation(api.lambings.record, {
        farmId,
        motherId,
        fatherId: null,
        date: "2025-04-10",
        lambs: [{ sex: "ram", tag: null, ownerId: null }],
        stillborn: 0,
        ...fields,
      }),
  };
}

async function rowOf<Table extends TableNames>(t: Test, table: Table, id: string) {
  return t.run((ctx) => ctx.db.get(ctx.db.normalizeId(table, id)!));
}

async function rows<Table extends TableNames>(t: Test, table: Table) {
  return t.run((ctx) => ctx.db.query(table).collect());
}

describe("lambings", () => {
  test("twins become Sheep in the Flock of the Mother, with the Lambing and the audit rows", async () => {
    const t = setup();
    const { admin, editor, farmId, ownerId, motherId, record, membershipId } = await lambingFarm(t);
    const editorId = await membershipId("editor");
    const fatherId = await admin.mutation(api.sheep.registerExternal, {
      farmId,
      tag: "E-1",
      name: "Чужой",
      sex: "ram",
      birthDate: null,
      notes: null,
    });
    const flockId = await admin.mutation(api.flocks.create, {
      farmId,
      name: "Отара",
      locationId: null,
    });
    await admin.mutation(api.flocks.moveSheep, {
      farmId,
      sheepIds: [motherId],
      flockId,
      date: "2025-01-01",
    });

    const { lambingId, lambIds } = await record({
      fatherId,
      lambs: [
        { sex: "ram", tag: " L-1 ", ownerId: null },
        { sex: "ewe", tag: null, ownerId: editorId },
      ],
      stillborn: 1,
    });

    expect(await rowOf(t, "lambings", lambingId)).toMatchObject({
      farmId,
      motherId,
      fatherId,
      date: "2025-04-10",
      lambIds,
      stillborn: 1,
      recordedAt: expect.any(Number),
    });
    expect(await rowOf(t, "sheep", lambIds[0]!)).toMatchObject({
      farmId,
      tag: "L-1",
      tagKey: "l-1",
      sex: "ram",
      birthDate: "2025-04-10",
      origin: "born",
      initialEntry: false,
      status: "active",
      ownerId,
      motherId,
      fatherId,
      flockId,
    });
    const second = await rowOf(t, "sheep", lambIds[1]!);
    expect(second).toMatchObject({ sex: "ewe", ownerId: editorId, flockId });
    expect(second?.tag).toBeUndefined();
    expect(second?.manualBreeds).toBeUndefined();
    expect(
      (await rows(t, "sheepFlockMoves")).filter((move) =>
        (lambIds as string[]).includes(move.sheepId),
      ),
    ).toEqual([
      expect.objectContaining({ sheepId: lambIds[0], flockId, date: "2025-04-10" }),
      expect.objectContaining({ sheepId: lambIds[1], flockId, date: "2025-04-10" }),
    ]);
    expect(
      (await rows(t, "auditLog"))
        .filter((entry) => entry.command === "lambing.record")
        .map(({ targetKind, targetId }) => `${targetKind} ${targetId}`),
    ).toEqual([`Sheep ${lambIds[0]}`, `Sheep ${lambIds[1]}`, `Lambing ${lambingId}`]);

    // The Editor sees the Lambing on the card of the Mother, and the Lamb with its Flock.
    expect(await editor.query(api.lambings.listOfMother, { farmId, motherId })).toEqual([
      {
        id: lambingId,
        date: "2025-04-10",
        father: { id: fatherId, tag: "E-1", name: "Чужой", sex: "ram", origin: "external" },
        lambs: [
          { id: lambIds[0], tag: "L-1", name: null, sex: "ram", origin: "born" },
          { id: lambIds[1], tag: null, name: null, sex: "ewe", origin: "born" },
        ],
        stillborn: 1,
        recordedAt: expect.any(Number),
      },
    ]);
    expect(await editor.query(api.sheep.get, { farmId, sheepId: lambIds[0]! })).toMatchObject({
      mother: { id: motherId },
      father: { id: fatherId },
      flock: { id: flockId, name: "Отара" },
      composition: { breeds: [], unknown: 1_000_000 },
    });
  });

  test("the defaults are the Owner and the Flock of the Mother on the date", async () => {
    const t = setup();
    const { admin, editor, farmId, ownerId, motherId } = await lambingFarm(t);
    const flockId = await admin.mutation(api.flocks.create, {
      farmId,
      name: "Отара",
      locationId: null,
    });
    await admin.mutation(api.flocks.moveSheep, {
      farmId,
      sheepIds: [motherId],
      flockId,
      date: "2025-05-01",
    });

    expect(
      await editor.query(api.lambings.defaults, { farmId, motherId, date: "2025-04-10" }),
    ).toEqual({ ownerId, flock: null });
    expect(
      await editor.query(api.lambings.defaults, { farmId, motherId, date: "2025-05-01" }),
    ).toEqual({ ownerId, flock: { id: flockId, name: "Отара", archived: false } });
    expect(
      await editor.query(api.lambings.defaults, {
        farmId,
        motherId: "not-an-id",
        date: "2025-05-01",
      }),
    ).toBeNull();
    expect(
      await errorCode(
        editor.query(api.lambings.defaults, { farmId, motherId, date: "01.05.2025" }),
      ),
    ).toBe("lambing.dateInvalid");
  });

  test("an unknown Father is no column, and a Lambing that fails writes no row", async () => {
    const t = setup();
    const { record, register } = await lambingFarm(t);
    await register({ tag: "T-9" });
    const counts = async () => ({
      sheep: (await rows(t, "sheep")).length,
      lambings: (await rows(t, "lambings")).length,
      audit: (await rows(t, "auditLog")).length,
    });
    const before = await counts();

    expect(
      await errorCode(
        record({
          lambs: [
            { sex: "ram", tag: "L-1", ownerId: null },
            { sex: "ewe", tag: "t-9", ownerId: null },
          ],
        }),
      ),
    ).toBe("sheep.tagTaken");
    expect(
      await errorCode(
        record({
          lambs: [
            { sex: "ram", tag: "A-1", ownerId: null },
            { sex: "ram", tag: "а-1", ownerId: null },
          ],
        }),
      ),
    ).toBe("lambing.tagRepeated");
    expect(await errorCode(record({ date: "2999-01-01" }))).toBe("lambing.dateInvalid");
    expect(await errorCode(record({ stillborn: 2.5 }))).toBe("lambing.stillbornInvalid");
    expect(await errorCode(record({ lambs: [] }))).toBe("lambing.lambsRequired");
    expect(await counts()).toEqual(before);

    const { lambingId } = await record();
    expect((await rowOf(t, "lambings", lambingId))?.fatherId).toBeUndefined();
  });

  test("a Lambing stays in its Farm", async () => {
    const t = setup();
    const first = await lambingFarm(t);
    const second = await lambingFarm(t, "Другая");

    // A Mother or a Father of another Farm is not found.
    expect(await errorCode(first.record({ motherId: second.motherId }))).toBe(
      "pedigree.parentNotFound",
    );
    const otherRam = await second.register({ sex: "ram" });
    expect(await errorCode(first.record({ fatherId: otherRam }))).toBe("pedigree.parentNotFound");
    // A Member of another Farm cannot record a Lambing in this Farm, nor see one.
    const { lambingId } = await first.record();
    expect(
      await errorCode(
        second.admin.mutation(api.lambings.record, {
          farmId: first.farmId,
          motherId: first.motherId,
          fatherId: null,
          date: "2025-04-10",
          lambs: [{ sex: "ram", tag: null, ownerId: null }],
          stillborn: 0,
        }),
      ),
    ).toBe("farm.notMember");
    expect(
      await second.admin.query(api.lambings.listOfMother, {
        farmId: second.farmId,
        motherId: first.motherId,
      }),
    ).toEqual([]);
    expect(
      await first.admin.query(api.lambings.listOfMother, {
        farmId: first.farmId,
        motherId: first.motherId,
      }),
    ).toEqual([expect.objectContaining({ id: lambingId })]);
  });
});

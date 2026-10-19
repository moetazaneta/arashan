import { describe, expect, test } from "vite-plus/test";

import { api } from "./_generated/api";
import type { TableNames } from "./_generated/dataModel";
import { errorCode, farmWithEditor, type Test, setup } from "./test.setup";

async function rowOf<Table extends TableNames>(t: Test, table: Table, id: string) {
  return t.run((ctx) => ctx.db.get(ctx.db.normalizeId(table, id)!));
}

/** The audit entries of a command, oldest first, as kinds of targets. */
async function auditOf(t: Test, command: string) {
  const rows = await t.run((ctx) => ctx.db.query("auditLog").collect());
  return rows.filter((row) => row.command === command).map((row) => row.targetKind);
}

/** A Farm with a Flock and the Resource «Сено» in kg. */
async function feedFarm(t: Test, name?: string) {
  const farm = await farmWithEditor(t, name);
  const { editor, farmId } = farm;
  const flockId = await editor.mutation(api.flocks.create, {
    farmId,
    name: "Отара",
    locationId: null,
  });
  const resourceId = await editor.mutation(api.resources.create, {
    farmId,
    name: " Сено ",
    unit: "кг",
  });
  return { ...farm, flockId, resourceId };
}

describe("resources", () => {
  test("the Stock follows the Restocks, the Usages and the Adjustments", async () => {
    const t = setup();
    const { editor, farmId, flockId, resourceId } = await feedFarm(t);

    await editor.mutation(api.resources.restock, {
      farmId,
      resourceId,
      date: "2026-01-10",
      quantity: 1_000_500,
      price: null,
    });
    const usage = await editor.mutation(api.resources.use, {
      farmId,
      resourceId,
      date: "2026-01-11",
      quantity: 200_250,
      flockId,
    });
    await editor.mutation(api.resources.adjust, {
      farmId,
      resourceId,
      date: "2026-01-12",
      counted: 790_000,
      reason: "сгнило",
    });

    expect(await editor.query(api.resources.list, { farmId })).toEqual([
      { id: resourceId, name: "Сено", unit: "кг", stock: 790_000, archived: false },
    ]);
    const card = await editor.query(api.resources.get, { farmId, resourceId });
    expect(card!.stock).toBe(790_000);
    expect(
      card!.events.map(({ kind, change, stockAfter }) => ({ kind, change, stockAfter })),
    ).toEqual([
      { kind: "adjustment", change: -10_250, stockAfter: 790_000 },
      { kind: "usage", change: -200_250, stockAfter: 800_250 },
      { kind: "restock", change: 1_000_500, stockAfter: 1_000_500 },
    ]);
    expect(card!.events[1]!.flock).toEqual({ id: flockId, name: "Отара", archived: false });

    // The count of 2026-01-12 already saw the Usage: cancelling it leaves the counted Stock.
    await editor.mutation(api.resources.cancelEvent, { farmId, eventId: usage });
    expect((await editor.query(api.resources.list, { farmId }))[0]!.stock).toBe(790_000);
    const after = await editor.query(api.resources.get, { farmId, resourceId });
    expect(after!.events[0]).toMatchObject({ kind: "adjustment", change: -210_500 });
    expect((await rowOf(t, "resourceEvents", usage))?.deletedAt).toBeTypeOf("number");
    expect(await auditOf(t, "resource.use")).toEqual(["ResourceEvent", "Resource", "Flock"]);
  });

  test("a Restock with a price makes an Automatic Expense, which goes away with it", async () => {
    const t = setup();
    const { editor, farmId, resourceId } = await feedFarm(t);

    const eventId = await editor.mutation(api.resources.restock, {
      farmId,
      resourceId,
      date: "2026-01-10",
      quantity: 500_000,
      price: 2_500_000,
    });
    const expenses = await editor.query(api.money.list, {
      farmId,
      kind: "expense",
      from: null,
      to: null,
      categoryId: null,
      scope: null,
    });
    expect(expenses.records).toHaveLength(1);
    const [expense] = expenses.records;
    expect(expense).toMatchObject({
      amount: 2_500_000,
      date: "2026-01-10",
      category: { key: "restock", system: true },
      source: { kind: "restock", id: eventId },
    });
    expect(
      await errorCode(editor.mutation(api.money.remove, { farmId, recordId: expense!.id })),
    ).toBe("money.automatic");
    const card = await editor.query(api.resources.get, { farmId, resourceId });
    expect(card!.events[0]!.expense).toEqual({ id: expense!.id, amount: 2_500_000 });
    expect(await auditOf(t, "resource.restock")).toEqual(["Expense", "ResourceEvent", "Resource"]);

    await editor.mutation(api.resources.cancelEvent, { farmId, eventId });
    expect((await rowOf(t, "moneyRecords", expense!.id))?.deletedAt).toBeTypeOf("number");
  });

  test("a rule that fails writes nothing", async () => {
    const t = setup();
    const { editor, farmId, resourceId } = await feedFarm(t);
    const restock = (quantity: number, price: number | null) =>
      errorCode(
        editor.mutation(api.resources.restock, {
          farmId,
          resourceId,
          date: "2026-01-10",
          quantity,
          price,
        }),
      );

    expect(await restock(0.5, null)).toBe("resource.quantityInvalid");
    expect(await restock(1_000, -1)).toBe("money.amountInvalid");
    expect(
      await errorCode(editor.mutation(api.resources.create, { farmId, name: "сено", unit: "тюк" })),
    ).toBe("resource.nameTaken");
    expect(await t.run((ctx) => ctx.db.query("resourceEvents").collect())).toEqual([]);
  });

  test("an Archived Resource stays in the list and gets no events", async () => {
    const t = setup();
    const { editor, farmId, resourceId } = await feedFarm(t);
    await editor.mutation(api.resources.archive, { farmId, resourceId });

    expect((await editor.query(api.resources.list, { farmId }))[0]!.archived).toBe(true);
    expect(
      await errorCode(
        editor.mutation(api.resources.restock, {
          farmId,
          resourceId,
          date: "2026-01-10",
          quantity: 1,
          price: null,
        }),
      ),
    ).toBe("resource.archived");
    await editor.mutation(api.resources.unarchive, { farmId, resourceId });
    await editor.mutation(api.resources.update, { farmId, resourceId, name: "Сено", unit: "тюк" });
    expect(await rowOf(t, "resources", resourceId)).toMatchObject({
      unit: "тюк",
      nameKey: "сено",
      stock: 0,
    });
    expect((await rowOf(t, "resources", resourceId))?.archivedAt).toBeUndefined();
  });

  test("a Member of another Farm reaches no Resource", async () => {
    const t = setup();
    const { resourceId } = await feedFarm(t);
    const other = await farmWithEditor(t, "Другая");

    expect(
      await other.editor.query(api.resources.get, { farmId: other.farmId, resourceId }),
    ).toBeNull();
    expect(await other.editor.query(api.resources.list, { farmId: other.farmId })).toEqual([]);
  });
});

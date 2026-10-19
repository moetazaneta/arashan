import { describe, expect, test } from "vite-plus/test";

import { api } from "./_generated/api";
import { errorCode, farmWithEditor, setup, type Test } from "./test.setup";

/** A Farm with an Admin and an Editor, and a function that registers an Active Ewe of the Editor. */
async function farm(t: Test) {
  const farm = await farmWithEditor(t);
  const editorId = await farm.membershipId("editor");
  const register = (tag: string) =>
    farm.editor.mutation(api.sheep.register, {
      farmId: farm.farmId,
      tag,
      name: null,
      sex: "ewe",
      birthDate: null,
      notes: null,
      weight: null,
      origin: "born",
      initialEntry: true,
      ownerId: editorId,
    });
  const row = (tag: string) => ({
    tag,
    name: null,
    sex: "ram" as const,
    birthDate: null,
    notes: null,
    ownerId: editorId,
  });
  return { ...farm, editorId, register, row };
}

async function auditOf(t: Test, targetKind: string) {
  const rows = await t.run((ctx) => ctx.db.query("auditLog").collect());
  return rows.filter((row) => row.targetKind === targetKind).map((row) => row.command);
}

describe("deals", () => {
  test("a Sale makes its Sheep Sold and an Income, and its cancel undoes both", async () => {
    const t = setup();
    const { editor, farmId, register } = await farm(t);
    const sheepIds = [await register("A-1"), await register("A-2")];

    const saleId = await editor.mutation(api.deals.sell, {
      farmId,
      sheepIds,
      date: "2026-10-15",
      price: 3_000_000,
    });

    const card = await editor.query(api.deals.get, { farmId, dealId: saleId });
    expect(card).toMatchObject({ kind: "sale", date: "2026-10-15", price: 3_000_000 });
    expect(card!.sheep.map((sheep) => [sheep.tag, sheep.status])).toEqual([
      ["A-1", "sold"],
      ["A-2", "sold"],
    ]);
    const incomes = await editor.query(api.money.list, {
      farmId,
      kind: "income",
      from: null,
      to: null,
      categoryId: null,
      scope: null,
    });
    expect(incomes.records).toMatchObject([
      { amount: 3_000_000, category: { key: "sheepSale" }, source: { kind: "sale", id: saleId } },
    ]);
    const changes = await t.run((ctx) => ctx.db.query("sheepStatusChanges").collect());
    expect(changes.map((change) => change.saleId)).toEqual([saleId, saleId]);

    await editor.mutation(api.deals.cancel, { farmId, dealId: saleId });

    expect(await editor.query(api.deals.get, { farmId, dealId: saleId })).toBeNull();
    const sheep = await t.run((ctx) => ctx.db.query("sheep").collect());
    expect(sheep.map((one) => one.status)).toEqual(["active", "active"]);
    const after = await editor.query(api.money.list, {
      farmId,
      kind: "income",
      from: null,
      to: null,
      categoryId: null,
      scope: null,
    });
    expect(after.records).toEqual([]);
    expect(await auditOf(t, "Sale")).toEqual(["sale.create", "sale.cancel"]);
    expect(await auditOf(t, "Income")).toEqual(["sale.create", "sale.cancel"]);
  });

  test("a Purchase makes new Bought Sheep in a Flock and an Expense, and its cancel deletes them", async () => {
    const t = setup();
    const { editor, farmId, row } = await farm(t);
    const flockId = await editor.mutation(api.flocks.create, {
      farmId,
      name: "Стадо",
      locationId: null,
    });

    const purchaseId = await editor.mutation(api.deals.buy, {
      farmId,
      sheep: [row("B-1"), row("B-2")],
      date: "2026-10-12",
      price: 12_000_000,
      flockId,
    });

    const [deal] = await editor.query(api.deals.list, { farmId, kind: "purchase" });
    expect(deal).toMatchObject({
      id: purchaseId,
      price: 12_000_000,
      sheepCount: 2,
      flock: { id: flockId, name: "Стадо" },
    });
    const sheep = await t.run((ctx) => ctx.db.query("sheep").collect());
    expect(sheep.map((one) => [one.tag, one.origin, one.purchaseId, one.flockId])).toEqual([
      ["B-1", "bought", purchaseId, flockId],
      ["B-2", "bought", purchaseId, flockId],
    ]);
    const card = await editor.query(api.sheep.get, { farmId, sheepId: sheep[0]!._id });
    expect(card!.purchaseId).toBe(purchaseId);

    await editor.mutation(api.deals.cancel, { farmId, dealId: purchaseId });

    expect(await editor.query(api.deals.list, { farmId, kind: null })).toEqual([]);
    expect(await editor.query(api.sheep.list, { farmId })).toEqual([]);
    const records = await t.run((ctx) => ctx.db.query("moneyRecords").collect());
    expect(records.map((record) => record.deletedAt !== undefined)).toEqual([true]);
    expect(await auditOf(t, "Purchase")).toEqual(["purchase.create", "purchase.cancel"]);
  });

  test("the price of a deal is the amount of its Automatic record, on either screen", async () => {
    const t = setup();
    const { editor, farmId, register } = await farm(t);
    const saleId = await editor.mutation(api.deals.sell, {
      farmId,
      sheepIds: [await register("A-1")],
      date: "2026-10-15",
      price: 100_000,
    });

    await editor.mutation(api.deals.changePrice, { farmId, dealId: saleId, price: 90_000 });
    const [record] = await t.run((ctx) => ctx.db.query("moneyRecords").collect());
    expect(record!.amount).toBe(90_000);

    await editor.mutation(api.money.update, {
      farmId,
      recordId: record!._id,
      date: record!.date,
      amount: 95_000,
      categoryId: record!.categoryId,
      scope: { kind: "sheep", sheepId: record!.sheepId! },
      shepherdId: null,
      notes: null,
    });
    expect((await editor.query(api.deals.get, { farmId, dealId: saleId }))!.price).toBe(95_000);
    expect(
      await errorCode(editor.mutation(api.money.remove, { farmId, recordId: record!._id })),
    ).toBe("money.automatic");
  });

  test("the commands send their domain errors", async () => {
    const t = setup();
    const { editor, farmId, register, row } = await farm(t);
    const sheepId = await register("A-1");

    expect(
      await errorCode(
        editor.mutation(api.deals.sell, { farmId, sheepIds: [], date: "2026-10-15", price: 1 }),
      ),
    ).toBe("deal.noSheep");
    expect(
      await errorCode(
        editor.mutation(api.deals.sell, {
          farmId,
          sheepIds: [sheepId],
          date: "2026-10-15",
          price: 0,
        }),
      ),
    ).toBe("deal.priceInvalid");
    expect(
      await errorCode(
        editor.mutation(api.deals.buy, {
          farmId,
          sheep: [row("a-1")],
          date: "2026-10-15",
          price: 1,
          flockId: null,
        }),
      ),
    ).toBe("sheep.tagTaken");
    expect(await errorCode(editor.mutation(api.deals.cancel, { farmId, dealId: "x" }))).toBe(
      "deal.notFound",
    );
    // A command that failed wrote nothing.
    expect(await t.run((ctx) => ctx.db.query("deals").collect())).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("moneyRecords").collect())).toEqual([]);
  });

  test("a Member of another Farm does not see the deals", async () => {
    const t = setup();
    const { editor, farmId, register } = await farm(t);
    const saleId = await editor.mutation(api.deals.sell, {
      farmId,
      sheepIds: [await register("A-1")],
      date: "2026-10-15",
      price: 100,
    });
    const other = await farmWithEditor(t, "2");

    expect(await errorCode(other.admin.query(api.deals.get, { farmId, dealId: saleId }))).toBe(
      "farm.notMember",
    );
    expect(
      await other.admin.query(api.deals.get, { farmId: other.farmId, dealId: saleId }),
    ).toBeNull();
  });
});

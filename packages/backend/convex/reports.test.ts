import { describe, expect, test } from "vite-plus/test";

import { api } from "./_generated/api";
import { errorCode, farmWithEditor, logIn, setup } from "./test.setup";

describe("reports.headCount", () => {
  test("counts the Sheep of the Farm, with the Lambs of the date, without the Deleted ones", async () => {
    const t = setup();
    const { editor, farmId, membershipId } = await farmWithEditor(t);
    const ownerId = await membershipId("editor");
    const register = (sex: "ram" | "ewe", birthDate: string) =>
      editor.mutation(api.sheep.register, {
        farmId,
        ownerId,
        tag: null,
        name: null,
        sex,
        birthDate,
        notes: null,
        weight: null,
        origin: "born",
        initialEntry: false,
      });
    await register("ram", "2025-03-01");
    await register("ewe", "2026-08-01");
    const deleted = await register("ewe", "2025-03-01");
    await editor.mutation(api.sheep.markDeleted, { farmId, sheepId: deleted });

    const report = await editor.query(api.reports.headCount, { farmId, date: "2026-10-18" });
    expect(report).toMatchObject({
      date: "2026-10-18",
      onFarm: 2,
      byStatus: { active: 2 },
      byGroup: { ram: 1, ewe: 0, lamb: 1 },
      byFlock: [{ ref: null, count: 2 }],
    });
    expect(report.byOwner.find((row) => row.ref?.id === ownerId)?.count).toBe(2);
    // On a later date the Lamb is an adult Ewe.
    expect(
      (await editor.query(api.reports.headCount, { farmId, date: "2027-01-01" })).byGroup,
    ).toEqual({ ram: 1, ewe: 1, lamb: 0 });
  });

  test("refuses a date that is not real, and a User who is not a Member", async () => {
    const t = setup();
    const { editor, farmId } = await farmWithEditor(t);
    expect(
      await errorCode(editor.query(api.reports.headCount, { farmId, date: "2026-02-30" })),
    ).toBe("report.dateInvalid");
    const stranger = await logIn(t, "stranger");
    expect(
      await errorCode(stranger.query(api.reports.headCount, { farmId, date: "2026-10-18" })),
    ).toBe("farm.notMember");
  });
});

describe("reports.money", () => {
  test("gives the Incomes minus the Expenses of the period, with the Automatic records", async () => {
    const t = setup();
    const { editor, farmId } = await farmWithEditor(t);
    const categories = async (kind: "expense" | "income") =>
      editor.query(api.money.categories, { farmId, kind });
    const byKey = async (kind: "expense" | "income", key: string) =>
      (await categories(kind)).find((category) => category.key === key)!.id;
    const record = (kind: "expense" | "income", categoryId: string, date: string, amount: number) =>
      editor.mutation(api.money.create, {
        farmId,
        kind,
        categoryId,
        date,
        amount,
        scope: { kind: "farm" },
        shepherdId: null,
        notes: null,
      });
    const shearing = await byKey("expense", "shearing");
    await record("expense", shearing, "2026-03-01", 100_000);
    await record("expense", shearing, "2025-12-31", 7_000);
    const deleted = await record("expense", shearing, "2026-03-02", 9_999);
    await editor.mutation(api.money.remove, { farmId, recordId: deleted });
    await record("income", await byKey("income", "wool"), "2026-05-01", 40_000);
    // The Automatic record of a Sale, as the command of a Sale writes it.
    const sheepSale = await byKey("income", "sheepSale");
    await t.run(async (ctx) => {
      await ctx.db.insert("moneyRecords", {
        farmId: ctx.db.normalizeId("farms", farmId)!,
        kind: "income",
        date: "2026-06-01",
        amount: 250_000,
        categoryId: ctx.db.normalizeId("moneyCategories", sheepSale)!,
        sourceKind: "sale",
        sourceId: "sale-1",
        createdAt: 0,
      });
    });

    const report = await editor.query(api.reports.money, {
      farmId,
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(report).toMatchObject({
      currency: "KGS",
      income: { total: 290_000 },
      expense: { total: 100_000, categories: [{ total: 100_000, count: 1 }] },
      balance: 190_000,
    });
    expect(report.income.categories.map((row) => [row.category.id, row.total])).toEqual([
      [sheepSale, 250_000],
      [await byKey("income", "wool"), 40_000],
    ]);
  });

  test("refuses a period that ends before it starts", async () => {
    const t = setup();
    const { editor, farmId } = await farmWithEditor(t);
    expect(
      await errorCode(
        editor.query(api.reports.money, { farmId, from: "2026-12-01", to: "2026-01-01" }),
      ),
    ).toBe("money.periodInvalid");
  });
});

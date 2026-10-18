import type { FunctionArgs } from "convex/server";
import { describe, expect, test } from "vite-plus/test";

import { api } from "./_generated/api";
import type { TableNames } from "./_generated/dataModel";
import { errorCode, farmWithEditor, logIn, settings, setup, type Test } from "./test.setup";

const fields = {
  date: "2026-01-15",
  amount: 150050,
  scope: { kind: "farm" },
  shepherdId: null,
  notes: null,
} as const;
const filter = { from: null, to: null, categoryId: null, scope: null };
const keys = {
  expense: [
    "shearing",
    "treatment",
    "shepherdPay",
    "equipment",
    "other",
    "sheepPurchase",
    "restock",
  ],
  income: ["wool", "meat", "other", "sheepSale"],
};

async function rowOf<Table extends TableNames>(t: Test, table: Table, id: string) {
  return t.run((ctx) => ctx.db.get(ctx.db.normalizeId(table, id)!));
}

async function auditLog(t: Test) {
  return t.run((ctx) => ctx.db.query("auditLog").collect());
}

async function moneyFarm(t: Test, name?: string) {
  const farm = await farmWithEditor(t, name);
  const { editor, farmId } = farm;
  const categories = async (kind: "expense" | "income") =>
    editor.query(api.money.categories, { farmId, kind });
  const categoryId = (await categories("expense"))[0]!.id;
  return {
    ...farm,
    categoryId,
    categories,
    create: (overrides: Partial<FunctionArgs<typeof api.money.create>> = {}) =>
      editor.mutation(api.money.create, {
        farmId,
        kind: "expense",
        categoryId,
        ...fields,
        ...overrides,
      }),
    list: (overrides: Partial<FunctionArgs<typeof api.money.list>> = {}) =>
      editor.query(api.money.list, { farmId, kind: "expense", ...filter, ...overrides }),
  };
}

async function scopes(farm: Awaited<ReturnType<typeof moneyFarm>>) {
  const { editor, farmId } = farm;
  const flockId = await editor.mutation(api.flocks.create, {
    farmId,
    name: "Отара",
    locationId: null,
  });
  const sheepId = await editor.mutation(api.sheep.register, {
    farmId,
    ownerId: await farm.membershipId("admin"),
    tag: "A-1",
    name: null,
    sex: "ram",
    birthDate: "2025-03-01",
    notes: null,
    weight: null,
    origin: "born",
    initialEntry: false,
  });
  const shepherdId = await editor.mutation(api.shepherds.create, {
    farmId,
    name: "Асан",
    phone: null,
    notes: null,
  });
  return { flockId, sheepId, shepherdId };
}

describe("money", () => {
  test("a new Farm has both default lists, with System categories last", async () => {
    const t = setup();
    const { farmId, categories } = await moneyFarm(t);
    for (const kind of ["expense", "income"] as const) {
      expect(await categories(kind)).toEqual(
        keys[kind].map((key) => ({
          id: expect.any(String),
          kind,
          key,
          name: null,
          inUse: false,
          archived: false,
          system: ["sheepPurchase", "restock", "sheepSale"].includes(key),
        })),
      );
    }
    const rows = await t.run((ctx) => ctx.db.query("moneyCategories").collect());
    expect(rows).toHaveLength(11);
    for (const row of rows) {
      expect(row.farmId).toBe(farmId);
      expect(row).not.toHaveProperty("name");
      expect(row).not.toHaveProperty("nameKey");
    }
    const entries = (await auditLog(t)).filter((entry) => entry.command === "moneyCategory.create");
    expect(entries).toHaveLength(11);
    expect(new Set(entries.map((entry) => entry.targetId))).toEqual(
      new Set(rows.map((row) => row._id)),
    );
    expect(
      entries.every(
        (entry) =>
          entry.farmId === (farmId as string) &&
          ["ExpenseCategory", "IncomeCategory"].includes(entry.targetKind),
      ),
    ).toBe(true);
  });

  test("an Editor seeds an old Farm once, without restoring a Deleted category", async () => {
    const t = setup();
    const { editor, farmId, categories } = await moneyFarm(t);
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("moneyCategories").collect()) {
        if (row.farmId === (farmId as string)) await ctx.db.delete(row._id);
      }
    });
    expect(await categories("expense")).toEqual([]);
    expect(await categories("income")).toEqual([]);
    const before = (await auditLog(t)).length;
    expect(await editor.mutation(api.money.ensureCategories, { farmId })).toBe(11);
    for (const kind of ["expense", "income"] as const) {
      expect((await categories(kind)).map((category) => category.key)).toEqual(keys[kind]);
    }
    const entries = (await auditLog(t)).slice(before);
    expect(entries).toHaveLength(11);
    expect(
      entries.every(
        (entry) =>
          entry.command === "moneyCategory.create" &&
          entry.actorId === null &&
          entry.farmId === (farmId as string),
      ),
    ).toBe(true);
    expect(await editor.mutation(api.money.ensureCategories, { farmId })).toBe(0);
    expect(await auditLog(t)).toHaveLength(before + 11);
    const categoryId = (await categories("expense"))[0]!.id;
    await editor.mutation(api.money.deleteCategory, { farmId, categoryId });
    const afterDelete = await auditLog(t);
    expect(await editor.mutation(api.money.ensureCategories, { farmId })).toBe(0);
    expect(await auditLog(t)).toEqual(afterDelete);
    expect((await categories("expense")).map((category) => category.key)).toEqual(
      keys.expense.slice(1),
    );
    expect(await rowOf(t, "moneyCategories", categoryId)).toMatchObject({
      deletedAt: expect.any(Number),
    });
  });

  test.each(["expense", "income"] as const)(
    "a Member creates, updates and deletes an %s with audit entries",
    async (kind) => {
      const t = setup();
      const farm = await moneyFarm(t);
      const { editor, farmId, create, list, categories } = farm;
      const categoryId = (await categories(kind))[0]!.id;
      const before = (await auditLog(t)).length;
      const recordId = await create({ kind, categoryId });
      const row = await rowOf(t, "moneyRecords", recordId);
      expect(row).toMatchObject({
        farmId,
        kind,
        categoryId,
        date: fields.date,
        amount: 150050,
        createdAt: expect.any(Number),
      });
      for (const key of [
        "notes",
        "shepherdId",
        "flockId",
        "sheepId",
        "sourceKind",
        "sourceId",
        "deletedAt",
      ]) {
        expect(row).not.toHaveProperty(key);
      }
      expect(await list({ kind })).toMatchObject({
        records: [
          { id: recordId, scope: { kind: "farm" }, notes: null, shepherd: null, source: null },
        ],
        total: 150050,
      });
      await editor.mutation(api.money.update, {
        farmId,
        recordId,
        categoryId,
        ...fields,
        amount: 200025,
        notes: "Исправлено",
      });
      expect(await rowOf(t, "moneyRecords", recordId)).toMatchObject({
        amount: 200025,
        notes: "Исправлено",
        createdAt: row!.createdAt,
      });
      await editor.mutation(api.money.update, {
        farmId,
        recordId,
        categoryId,
        ...fields,
        amount: 200025,
      });
      expect(await rowOf(t, "moneyRecords", recordId)).not.toHaveProperty("notes");
      await editor.mutation(api.money.remove, { farmId, recordId });
      expect(await rowOf(t, "moneyRecords", recordId)).toMatchObject({
        deletedAt: expect.any(Number),
        amount: 200025,
      });
      expect(await list({ kind })).toEqual({ records: [], total: 0 });
      const actor = await editor.query(api.users.viewer, {});
      expect(
        (await auditLog(t)).slice(before).map(({ command, targetKind, targetId, actorId }) => ({
          command,
          targetKind,
          targetId,
          actorId,
        })),
      ).toEqual(
        ["money.create", "money.update", "money.update", "money.delete"].map((command) => ({
          command,
          targetKind: kind === "expense" ? "Expense" : "Income",
          targetId: recordId,
          actorId: actor!.user!.id,
        })),
      );
    },
  );

  test("a Member switches scope and clears the stored Flock, Sheep and Shepherd columns", async () => {
    const t = setup();
    const farm = await moneyFarm(t);
    const { editor, farmId, create, list, categories, categoryId } = farm;
    const { flockId, sheepId, shepherdId } = await scopes(farm);
    const pay = (await categories("expense")).find(
      (category) => category.key === "shepherdPay",
    )!.id;
    const recordId = await create({
      categoryId: pay,
      scope: { kind: "flock", flockId },
      shepherdId,
    });
    expect(await rowOf(t, "moneyRecords", recordId)).toMatchObject({ flockId, shepherdId });
    expect(await rowOf(t, "moneyRecords", recordId)).not.toHaveProperty("sheepId");
    expect(await list()).toMatchObject({
      records: [
        {
          scope: { kind: "flock", flock: { id: flockId, name: "Отара" } },
          shepherd: { id: shepherdId, name: "Асан" },
        },
      ],
    });
    await editor.mutation(api.money.update, {
      farmId,
      recordId,
      categoryId,
      ...fields,
      scope: { kind: "sheep", sheepId },
    });
    const row = await rowOf(t, "moneyRecords", recordId);
    expect(row).toMatchObject({ sheepId });
    expect(row).not.toHaveProperty("flockId");
    expect(row).not.toHaveProperty("shepherdId");
    expect(await list()).toMatchObject({
      records: [
        {
          scope: { kind: "sheep", sheep: { id: sheepId, tag: "A-1", name: null } },
          shepherd: null,
        },
      ],
    });
    await editor.mutation(api.money.update, { farmId, recordId, categoryId, ...fields });
    expect(await rowOf(t, "moneyRecords", recordId)).not.toHaveProperty("sheepId");
  });

  test("the list includes both period limits and filters by category and exact scope", async () => {
    const t = setup();
    const farm = await moneyFarm(t);
    const { create, list, categories } = farm;
    const { flockId, sheepId } = await scopes(farm);
    const treatment = (await categories("expense"))[1]!.id;
    await create({ date: "2026-01-09", amount: 1 });
    const first = await create({ date: "2026-01-10", amount: 101 });
    const middle = await create({
      date: "2026-01-15",
      amount: 202,
      categoryId: treatment,
      scope: { kind: "flock", flockId },
    });
    const last = await create({
      date: "2026-01-20",
      amount: 303,
      scope: { kind: "sheep", sheepId },
    });
    await create({ date: "2026-01-21", amount: 2 });
    await create({ kind: "income", categoryId: (await categories("income"))[0]!.id });
    const period = { from: "2026-01-10", to: "2026-01-20" };
    expect(await list(period)).toMatchObject({
      records: [{ id: last }, { id: middle }, { id: first }],
      total: 606,
    });
    expect((await list(period)).records).toHaveLength(3);
    for (const [scope, id, total] of [
      [{ kind: "farm" }, first, 101],
      [{ kind: "flock", flockId }, middle, 202],
      [{ kind: "sheep", sheepId }, last, 303],
    ] as const) {
      const result = await list({ ...period, scope });
      expect(result.records.map((record) => record.id)).toEqual([id]);
      expect(result.total).toBe(total);
    }
    expect(
      (await list({ ...period, categoryId: treatment })).records.map((record) => record.id),
    ).toEqual([middle]);
    expect(await list({ ...period, categoryId: treatment, scope: { kind: "farm" } })).toEqual({
      records: [],
      total: 0,
    });
    expect((await list({ from: "2026-01-20" })).records.map((record) => record.date)).toEqual([
      "2026-01-21",
      "2026-01-20",
    ]);
    expect((await list({ to: "2026-01-10" })).records.map((record) => record.date)).toEqual([
      "2026-01-10",
      "2026-01-09",
    ]);
    expect(await errorCode(list({ from: "2026-01-20", to: "2026-01-10" }))).toBe(
      "money.periodInvalid",
    );
  });

  test("System categories and Automatic records return domain errors without writes", async () => {
    const t = setup();
    const { editor, farmId, categories, create, list } = await moneyFarm(t);
    const expense = await categories("expense");
    const sale = (await categories("income")).find((category) => category.key === "sheepSale")!;
    const recordId = await t.run((ctx) =>
      ctx.db.insert("moneyRecords", {
        farmId: ctx.db.normalizeId("farms", farmId)!,
        kind: "income",
        date: fields.date,
        amount: 150050,
        categoryId: ctx.db.normalizeId("moneyCategories", sale.id)!,
        sourceKind: "sale",
        sourceId: "sale-1",
        createdAt: Date.now(),
      }),
    );
    const before = await auditLog(t);
    for (const category of [...expense, sale].filter((category) => category.system)) {
      const args = { farmId, categoryId: category.id };
      expect(await errorCode(create({ kind: category.kind, categoryId: category.id }))).toBe(
        "moneyCategory.system",
      );
      expect(
        await errorCode(editor.mutation(api.money.renameCategory, { ...args, name: "Новое" })),
      ).toBe("moneyCategory.system");
      expect(await errorCode(editor.mutation(api.money.archiveCategory, args))).toBe(
        "moneyCategory.system",
      );
      expect(await errorCode(editor.mutation(api.money.deleteCategory, args))).toBe(
        "moneyCategory.system",
      );
    }
    expect(
      await errorCode(
        create({ categoryId: expense.find((category) => category.key === "shepherdPay")!.id }),
      ),
    ).toBe("money.shepherdRequired");
    expect(await errorCode(editor.mutation(api.money.remove, { farmId, recordId }))).toBe(
      "money.automatic",
    );
    expect(await list({ kind: "income" })).toMatchObject({
      records: [{ id: recordId, source: { kind: "sale", id: "sale-1" } }],
      total: 150050,
    });
    expect(await rowOf(t, "moneyRecords", recordId)).not.toHaveProperty("deletedAt");
    expect(await auditLog(t)).toEqual(before);
  });

  test("a Member manages a category and cannot delete one used by a Deleted record", async () => {
    const t = setup();
    const { editor, farmId, create, categories } = await moneyFarm(t);
    const before = (await auditLog(t)).length;
    const categoryId = await editor.mutation(api.money.createCategory, {
      farmId,
      kind: "expense",
      name: "  Камеры  ",
    });
    expect(await rowOf(t, "moneyCategories", categoryId)).toMatchObject({
      farmId,
      kind: "expense",
      name: "Камеры",
      nameKey: "камеры",
    });
    expect(await rowOf(t, "moneyCategories", categoryId)).not.toHaveProperty("key");
    await editor.mutation(api.money.renameCategory, { farmId, categoryId, name: "Оборудование" });
    expect(await rowOf(t, "moneyCategories", categoryId)).toMatchObject({
      name: "Оборудование",
      nameKey: "оборудование",
    });
    await editor.mutation(api.money.archiveCategory, { farmId, categoryId });
    expect(
      (await categories("expense")).find((category) => category.id === categoryId),
    ).toMatchObject({ key: null, name: "Оборудование", archived: true, inUse: false });
    await editor.mutation(api.money.unarchiveCategory, { farmId, categoryId });
    expect(await rowOf(t, "moneyCategories", categoryId)).not.toHaveProperty("archivedAt");
    const recordId = await create({ categoryId });
    await editor.mutation(api.money.remove, { farmId, recordId });
    expect(
      (await categories("expense")).find((category) => category.id === categoryId)?.inUse,
    ).toBe(true);
    const afterRemove = await auditLog(t);
    expect(await errorCode(editor.mutation(api.money.deleteCategory, { farmId, categoryId }))).toBe(
      "moneyCategory.inUse",
    );
    expect(await rowOf(t, "moneyCategories", categoryId)).not.toHaveProperty("deletedAt");
    expect(await auditLog(t)).toEqual(afterRemove);
    expect(
      (await auditLog(t))
        .slice(before, before + 4)
        .map(({ command, targetId }) => [command, targetId]),
    ).toEqual(
      [
        "moneyCategory.create",
        "moneyCategory.update",
        "moneyCategory.archive",
        "moneyCategory.unarchive",
      ].map((command) => [command, categoryId]),
    );
  });

  test("a category or record of another Farm is not found and changes nothing", async () => {
    const t = setup();
    const { editor, farmId, create, categoryId, list } = await moneyFarm(t);
    const other = await moneyFarm(t, "Другая");
    const recordId = await other.create();
    const before = await auditLog(t);
    const row = await rowOf(t, "moneyRecords", recordId);
    const category = await rowOf(t, "moneyCategories", other.categoryId);
    expect(await errorCode(create({ categoryId: other.categoryId }))).toBe(
      "moneyCategory.notFound",
    );
    for (const mutation of [
      api.money.archiveCategory,
      api.money.unarchiveCategory,
      api.money.deleteCategory,
    ]) {
      expect(
        await errorCode(editor.mutation(mutation, { farmId, categoryId: other.categoryId })),
      ).toBe("moneyCategory.notFound");
    }
    expect(
      await errorCode(
        editor.mutation(api.money.renameCategory, {
          farmId,
          categoryId: other.categoryId,
          name: "Новое",
        }),
      ),
    ).toBe("moneyCategory.notFound");
    expect(
      await errorCode(
        editor.mutation(api.money.update, { farmId, recordId, categoryId, ...fields }),
      ),
    ).toBe("money.notFound");
    expect(await errorCode(editor.mutation(api.money.remove, { farmId, recordId }))).toBe(
      "money.notFound",
    );
    expect(await list()).toEqual({ records: [], total: 0 });
    expect(await rowOf(t, "moneyRecords", recordId)).toEqual(row);
    expect(await rowOf(t, "moneyCategories", other.categoryId)).toEqual(category);
    expect(await auditLog(t)).toEqual(before);
    const stranger = await logIn(t, "stranger");
    expect(await errorCode(stranger.query(api.money.categories, { farmId, kind: "expense" }))).toBe(
      "farm.notMember",
    );
    expect(
      await errorCode(stranger.query(api.money.list, { farmId, kind: "expense", ...filter })),
    ).toBe("farm.notMember");
    expect(
      await errorCode(
        stranger.mutation(api.money.create, { farmId, kind: "expense", categoryId, ...fields }),
      ),
    ).toBe("farm.notMember");
    expect(await errorCode(stranger.mutation(api.money.ensureCategories, { farmId }))).toBe(
      "farm.notMember",
    );
  });

  test("a record locks the Farm currency, also after it becomes Deleted", async () => {
    const t = setup();
    const { admin, editor, farmId, create } = await moneyFarm(t);
    const recordId = await create();
    for (const deleted of [false, true]) {
      if (deleted) await editor.mutation(api.money.remove, { farmId, recordId });
      const before = await auditLog(t);
      expect(
        await errorCode(
          admin.mutation(api.farms.updateSettings, {
            farmId,
            ...settings,
            currency: "USD",
            lambAgeMonths: 6,
          }),
        ),
      ).toBe("farm.currencyLocked");
      expect(await auditLog(t)).toEqual(before);
      expect(await rowOf(t, "farms", farmId)).toMatchObject(settings);
    }
    await admin.mutation(api.farms.updateSettings, {
      farmId,
      ...settings,
      timeZone: "Asia/Tbilisi",
      lambAgeMonths: 6,
    });
    expect(await rowOf(t, "farms", farmId)).toMatchObject({
      currency: "KGS",
      timeZone: "Asia/Tbilisi",
      lambAgeMonths: 6,
    });
    expect((await auditLog(t)).at(-1)).toMatchObject({
      command: "farm.updateSettings",
      targetId: farmId,
    });
  });
});

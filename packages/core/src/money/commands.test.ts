import { describe, expect, test } from "vite-plus/test";

import type { CommandContext, FarmCommandContext } from "../context";
import { createFarm } from "../farms/commands";
import { archiveFlock, archiveShepherd, createFlock, createShepherd } from "../flocks/commands";
import type { FarmId, FlockId, MoneyCategoryId, ShepherdId, UserId } from "../ids";
import { registerSheep } from "../sheep/commands";
import { InMemoryStore } from "../testing/in-memory";
import {
  archiveMoneyCategory,
  createMoneyCategory,
  createMoneyRecord,
  deleteMoneyCategory,
  deleteMoneyRecord,
  type MoneyRecordInput,
  createAutomaticRecord,
  deleteAutomaticRecord,
  ensureFarmMoneyCategories,
  renameMoneyCategory,
  unarchiveMoneyCategory,
  updateAutomaticRecord,
  updateMoneyRecord,
} from "./commands";
import type { CategoryKey, MoneyKind } from "./money";
import { listMoneyCategories, listMoneyRecords } from "./queries";

const settings = { currency: "KGS", timeZone: "Asia/Bishkek", lambAgeMonths: 4 };

/**
 * A Farm with an Admin and an Editor, and its default lists of categories. The time is 2026-10-18
 * 18:00 in Bishkek, the time zone of the Farm.
 */
async function setup() {
  const store = new InMemoryStore();
  const operator = store.addUser("operator", { operator: true });
  const { farmId } = await createFarm(operator, { name: "Арашан", ...settings });
  const admin = store.addMember("admin", farmId, "admin");
  const editor = store.addMember("editor", farmId, "editor");
  const as = (user: CommandContext) => store.farmContext(user, farmId);
  const ctx = await as(editor);
  /** The category of the default list with the key. */
  const category = (kind: MoneyKind, key: CategoryKey, farm: FarmId = farmId): MoneyCategoryId =>
    store.moneyCategories.find((c) => c.farmId === farm && c.kind === kind && c.key === key)!.id;
  /** An Expense of «Стрижка» of the Farm, on 2026-10-01, for 1 500,00. */
  const expense = (
    change: Partial<MoneyRecordInput> = {},
  ): MoneyRecordInput & { kind: "expense" } => ({
    kind: "expense",
    date: "2026-10-01",
    amount: 150_000,
    categoryId: category("expense", "shearing"),
    scope: { kind: "farm" },
    shepherdId: null,
    notes: null,
    ...change,
  });
  return { store, operator, farmId, admin, editor, as, ctx, category, expense };
}

async function aShepherd(ctx: FarmCommandContext, name = "Асан"): Promise<ShepherdId> {
  return createShepherd(ctx, { name, phone: null, notes: null });
}

async function aFlock(ctx: FarmCommandContext, name = "Северная"): Promise<FlockId> {
  return createFlock(ctx, { name, locationId: null });
}

/** The code of the domain error that a call failed with. */
async function errorOf(call: Promise<unknown>): Promise<unknown> {
  return call.then(
    () => null,
    (error: unknown) => (error as { code?: string }).code ?? error,
  );
}

describe("the default lists", () => {
  test("a new Farm gets the Expense and the Income categories, with the System ones last", async () => {
    const { store, farmId, ctx } = await setup();

    const expenses = await listMoneyCategories(ctx, { kind: "expense" });
    expect(expenses.map(({ key, name, system }) => ({ key, name, system }))).toEqual([
      { key: "shearing", name: null, system: false },
      { key: "treatment", name: null, system: false },
      { key: "shepherdPay", name: null, system: false },
      { key: "equipment", name: null, system: false },
      { key: "other", name: null, system: false },
      { key: "sheepPurchase", name: null, system: true },
      { key: "restock", name: null, system: true },
    ]);
    const incomes = await listMoneyCategories(ctx, { kind: "income" });
    expect(incomes.map(({ key, system }) => ({ key, system }))).toEqual([
      { key: "wool", system: false },
      { key: "meat", system: false },
      { key: "other", system: false },
      { key: "sheepSale", system: true },
    ]);
    // The Operator made them, one audit entry for each category.
    const entries = store.audit.filter((entry) => entry.command === "moneyCategory.create");
    expect(entries).toHaveLength(11);
    expect(entries[0]).toMatchObject({
      actorId: store.users.find((u) => u.username === "operator")!.id,
      farmId,
      target: { kind: "ExpenseCategory" },
    });
    expect(entries.at(-1)).toMatchObject({ target: { kind: "IncomeCategory" } });
  });

  test("a Farm that existed before gets the lists when a Member opens them, and only one time", async () => {
    const { store, farmId, ctx, as, admin, category } = await setup();
    // A Farm that the Operator made before the Expenses and Incomes: it has no category.
    const removeCategories = () =>
      store.moneyCategories.splice(
        0,
        store.moneyCategories.length,
        ...store.moneyCategories.filter((c) => c.farmId !== farmId),
      );
    removeCategories();
    expect(await listMoneyCategories(ctx, { kind: "expense" })).toEqual([]);
    const before = store.audit.length;

    expect(await ensureFarmMoneyCategories(ctx)).toBe(11);

    expect((await listMoneyCategories(ctx, { kind: "expense" })).map((c) => c.key)).toEqual([
      "shearing",
      "treatment",
      "shepherdPay",
      "equipment",
      "other",
      "sheepPurchase",
      "restock",
    ]);
    expect((await listMoneyCategories(ctx, { kind: "income" })).map((c) => c.key)).toEqual([
      "wool",
      "meat",
      "other",
      "sheepSale",
    ]);
    // The app made them, not the Member who opened the page: the entries have no actor.
    const entries = store.audit.slice(before);
    expect(entries).toHaveLength(11);
    expect(entries.every((e) => e.actorId === null && e.farmId === farmId)).toBe(true);

    // A second call, also by another Member, makes nothing.
    expect(await ensureFarmMoneyCategories(await as(admin))).toBe(0);
    expect(store.audit).toHaveLength(before + 11);

    // A category that a Member deleted does not come back.
    await deleteMoneyCategory(ctx, { categoryId: category("income", "meat") });
    expect(await ensureFarmMoneyCategories(ctx)).toBe(0);
    expect((await listMoneyCategories(ctx, { kind: "income" })).map((c) => c.key)).toEqual([
      "wool",
      "other",
      "sheepSale",
    ]);
  });
});

describe("the System categories", () => {
  test("a Member cannot rename, archive or delete a System category", async () => {
    const { ctx, as, admin, category } = await setup();
    const adminCtx = await as(admin);

    for (const categoryId of [
      category("expense", "sheepPurchase"),
      category("expense", "restock"),
      category("income", "sheepSale"),
    ]) {
      for (const member of [ctx, adminCtx]) {
        expect(await errorOf(renameMoneyCategory(member, { categoryId, name: "Скот" }))).toBe(
          "moneyCategory.system",
        );
        expect(await errorOf(archiveMoneyCategory(member, { categoryId }))).toBe(
          "moneyCategory.system",
        );
        expect(await errorOf(deleteMoneyCategory(member, { categoryId }))).toBe(
          "moneyCategory.system",
        );
      }
    }
    const rows = await listMoneyCategories(ctx, { kind: "income" });
    expect(rows.find((row) => row.key === "sheepSale")).toMatchObject({
      name: null,
      archived: false,
    });
  });

  test("a Member cannot select a System category for a new record or a change of one", async () => {
    const { store, ctx, category, expense } = await setup();

    expect(
      await errorOf(
        createMoneyRecord(ctx, expense({ categoryId: category("expense", "sheepPurchase") })),
      ),
    ).toBe("moneyCategory.system");
    expect(
      await errorOf(
        createMoneyRecord(ctx, {
          ...expense(),
          kind: "income",
          categoryId: category("income", "sheepSale"),
        }),
      ),
    ).toBe("moneyCategory.system");
    const recordId = await createMoneyRecord(ctx, expense());
    expect(
      await errorOf(
        updateMoneyRecord(ctx, {
          ...expense({ categoryId: category("expense", "restock") }),
          recordId,
        }),
      ),
    ).toBe("moneyCategory.system");
    expect(store.moneyRecords).toHaveLength(1);
  });

  test("an Automatic record gets its System category, and only its event changes or removes it", async () => {
    const { store, farmId, ctx, category } = await setup();
    const source = { kind: "sale", id: "sale-1" } as const;

    const recordId = await createAutomaticRecord(ctx, "money.create", {
      key: "sheepSale",
      source,
      date: "2026-10-10",
      amount: 4_500_000,
      scope: { kind: "farm" },
    });

    expect(store.moneyRecords.find((r) => r.id === recordId)).toMatchObject({
      farmId,
      kind: "income",
      categoryId: category("income", "sheepSale"),
      amount: 4_500_000,
      shepherdId: null,
      notes: null,
      source,
    });
    expect(store.audit.at(-1)).toMatchObject({
      command: "money.create",
      target: { kind: "Income", id: recordId },
    });
    // A Member cannot delete it, nor change what its event owns: the date, the category, the scope.
    const asIs = {
      kind: "income" as const,
      date: "2026-10-10",
      amount: 4_500_000,
      categoryId: category("income", "sheepSale"),
      scope: { kind: "farm" } as const,
      shepherdId: null,
      notes: null,
      recordId,
    };
    expect(await errorOf(deleteMoneyRecord(ctx, { recordId }))).toBe("money.automatic");
    for (const change of [
      { date: "2026-10-11" },
      { categoryId: category("income", "wool") },
      { scope: { kind: "flock", flockId: await aFlock(ctx) } as const },
    ]) {
      expect(await errorOf(updateMoneyRecord(ctx, { ...asIs, ...change }))).toBe("money.automatic");
    }
    // The amount is the price of the event: a change on either screen changes the same value.
    await updateMoneyRecord(ctx, { ...asIs, amount: 4_200_000, notes: "Скидка" });
    expect(store.moneyRecords.find((r) => r.id === recordId)).toMatchObject({
      amount: 4_200_000,
      notes: "Скидка",
      date: "2026-10-10",
    });
    await updateAutomaticRecord(ctx, "money.update", source, {
      date: "2026-10-12",
      amount: 4_000_000,
      scope: { kind: "farm" },
    });
    const { records } = await listMoneyRecords(ctx, {
      kind: "income",
      from: null,
      to: null,
      categoryId: null,
      scope: null,
    });
    expect(records).toMatchObject([
      { id: recordId, date: "2026-10-12", amount: 4_000_000, notes: "Скидка", source },
    ]);

    // An event has one record: a second one for the same event is a bug of the caller.
    await expect(
      createAutomaticRecord(ctx, "money.create", {
        key: "sheepSale",
        source,
        date: "2026-10-12",
        amount: 100,
        scope: { kind: "farm" },
      }),
    ).rejects.toThrow("already has an Automatic record");
    expect(store.moneyRecords.filter((r) => r.source?.id === "sale-1")).toHaveLength(1);

    // The cancel of the event makes it Deleted.
    await deleteAutomaticRecord(ctx, "money.delete", source);
    expect(store.moneyRecords.find((r) => r.id === recordId)?.deletedAt).toBe(store.time);
    expect(await errorOf(deleteAutomaticRecord(ctx, "money.delete", source))).toBe(
      "money.notFound",
    );
  });

  test("the event of a Farm with no categories yet gives the Farm its default lists first", async () => {
    const { store, farmId, ctx } = await setup();
    store.moneyCategories.splice(0, store.moneyCategories.length);

    const recordId = await createAutomaticRecord(ctx, "money.create", {
      key: "restock",
      source: { kind: "restock", id: "restock-1" },
      date: "2026-10-18",
      amount: 900_000,
      scope: { kind: "farm" },
    });

    const restock = store.moneyCategories.find((c) => c.farmId === farmId && c.key === "restock");
    expect(restock).toMatchObject({ kind: "expense", name: null, archivedAt: null });
    expect(store.moneyCategories).toHaveLength(11);
    expect(store.moneyRecords.find((r) => r.id === recordId)?.categoryId).toBe(restock!.id);
    expect(store.audit.at(-1)).toMatchObject({
      command: "money.create",
      target: { kind: "Expense", id: recordId },
    });
  });
});

describe("createMoneyRecord", () => {
  test("an Editor records an Expense, with an audit entry", async () => {
    const { store, farmId, ctx, expense } = await setup();

    const recordId = await createMoneyRecord(ctx, expense({ notes: "  Стрижка весной  " }));

    expect(store.moneyRecords.find((r) => r.id === recordId)).toEqual({
      id: recordId,
      farmId,
      kind: "expense",
      date: "2026-10-01",
      amount: 150_000,
      categoryId: expense().categoryId,
      scope: { kind: "farm" },
      shepherdId: null,
      notes: "Стрижка весной",
      source: null,
      createdAt: store.time,
    });
    expect(store.audit.at(-1)).toEqual({
      at: store.time,
      actorId: store.users.find((u) => u.username === "editor")!.id as UserId,
      farmId,
      command: "money.create",
      target: { kind: "Expense", id: recordId },
    });
  });

  test("the date is a real date, not in the future of the Farm's time zone", async () => {
    const { ctx, expense } = await setup();

    expect(await errorOf(createMoneyRecord(ctx, expense({ date: "2026-02-30" })))).toBe(
      "money.dateInvalid",
    );
    expect(await errorOf(createMoneyRecord(ctx, expense({ date: "18.10.2026" })))).toBe(
      "money.dateInvalid",
    );
    // 18:00 in Bishkek: today there is 2026-10-18, so the 19th is in the future.
    expect(await errorOf(createMoneyRecord(ctx, expense({ date: "2026-10-19" })))).toBe(
      "money.dateInFuture",
    );
    expect(await errorOf(createMoneyRecord(ctx, expense({ date: "2026-10-18" })))).toBeNull();
  });

  test("the amount is a whole number of hundredths, more than 0 and not too large", async () => {
    const { ctx, expense } = await setup();

    for (const amount of [0, -100, 10.5, Number.NaN, Number.POSITIVE_INFINITY, 1e11 + 1]) {
      expect(await errorOf(createMoneyRecord(ctx, expense({ amount })))).toBe(
        "money.amountInvalid",
      );
    }
    expect(await errorOf(createMoneyRecord(ctx, expense({ amount: 1 })))).toBeNull();
    expect(await errorOf(createMoneyRecord(ctx, expense({ amount: 1e11 })))).toBeNull();
  });

  test("the category is of the same kind and not Archived; the notes are not too long", async () => {
    const { ctx, category, expense } = await setup();
    await archiveMoneyCategory(ctx, { categoryId: category("expense", "equipment") });

    expect(
      await errorOf(createMoneyRecord(ctx, expense({ categoryId: category("income", "wool") }))),
    ).toBe("moneyCategory.notFound");
    expect(
      await errorOf(
        createMoneyRecord(ctx, expense({ categoryId: "moneycategory-404" as MoneyCategoryId })),
      ),
    ).toBe("moneyCategory.notFound");
    expect(
      await errorOf(
        createMoneyRecord(ctx, expense({ categoryId: category("expense", "equipment") })),
      ),
    ).toBe("moneyCategory.archived");
    expect(await errorOf(createMoneyRecord(ctx, expense({ notes: "а".repeat(501) })))).toBe(
      "money.notesTooLong",
    );
  });

  test("an Expense of «Оплата чабану» has a Shepherd who is not Archived, also after a rename", async () => {
    const { store, ctx, category, expense } = await setup();
    const shepherdPay = category("expense", "shepherdPay");
    const asan = await aShepherd(ctx);
    const bakyt = await aShepherd(ctx, "Бакыт");
    await archiveShepherd(ctx, { shepherdId: bakyt, date: "2026-10-01" });

    expect(await errorOf(createMoneyRecord(ctx, expense({ categoryId: shepherdPay })))).toBe(
      "money.shepherdRequired",
    );
    expect(
      await errorOf(
        createMoneyRecord(ctx, expense({ categoryId: shepherdPay, shepherdId: bakyt })),
      ),
    ).toBe("shepherd.archived");
    expect(
      await errorOf(
        createMoneyRecord(
          ctx,
          expense({ categoryId: shepherdPay, shepherdId: "shepherd-404" as ShepherdId }),
        ),
      ),
    ).toBe("shepherd.notFound");
    // Another category has no Shepherd.
    expect(await errorOf(createMoneyRecord(ctx, expense({ shepherdId: asan })))).toBe(
      "money.shepherdNotAllowed",
    );
    // The rule follows the key of the category, not its name.
    await renameMoneyCategory(ctx, { categoryId: shepherdPay, name: "Зарплата" });
    expect(await errorOf(createMoneyRecord(ctx, expense({ categoryId: shepherdPay })))).toBe(
      "money.shepherdRequired",
    );

    const recordId = await createMoneyRecord(
      ctx,
      expense({ categoryId: shepherdPay, shepherdId: asan }),
    );
    expect(store.moneyRecords.find((r) => r.id === recordId)?.shepherdId).toBe(asan);
  });

  test("an Income has no Shepherd", async () => {
    const { ctx, category, expense } = await setup();
    const asan = await aShepherd(ctx);

    expect(
      await errorOf(
        createMoneyRecord(ctx, {
          ...expense({ categoryId: category("income", "wool"), shepherdId: asan }),
          kind: "income",
        }),
      ),
    ).toBe("money.shepherdNotAllowed");
  });

  test("the scope is the Farm, a Flock that is not Archived, or a Sheep of the Farm", async () => {
    const { store, ctx, expense } = await setup();
    const north = await aFlock(ctx);
    const old = await aFlock(ctx, "Старая");
    await archiveFlock(ctx, { flockId: old, date: "2026-10-01" });
    const owner = store.memberships.find((m) => m.role === "editor")!.id;
    const sheepId = await registerSheep(ctx, {
      tag: "A-1",
      name: null,
      sex: "ewe",
      birthDate: null,
      notes: null,
      weight: null,
      ownerId: owner,
      origin: "born",
      initialEntry: true,
    });

    expect(
      await errorOf(createMoneyRecord(ctx, expense({ scope: { kind: "flock", flockId: old } }))),
    ).toBe("flock.archived");
    expect(
      await errorOf(
        createMoneyRecord(
          ctx,
          expense({ scope: { kind: "flock", flockId: "flock-404" as FlockId } }),
        ),
      ),
    ).toBe("flock.notFound");
    expect(
      await errorOf(
        createMoneyRecord(
          ctx,
          expense({ scope: { kind: "sheep", sheepId: "sheep-404" as never } }),
        ),
      ),
    ).toBe("sheep.notFound");

    const ofFlock = await createMoneyRecord(
      ctx,
      expense({ scope: { kind: "flock", flockId: north } }),
    );
    const ofSheep = await createMoneyRecord(ctx, expense({ scope: { kind: "sheep", sheepId } }));
    expect(store.moneyRecords.find((r) => r.id === ofFlock)?.scope).toEqual({
      kind: "flock",
      flockId: north,
    });
    expect(store.moneyRecords.find((r) => r.id === ofSheep)?.scope).toEqual({
      kind: "sheep",
      sheepId,
    });
  });
});

describe("updateMoneyRecord", () => {
  test("a Member changes a record, with an audit entry; the same fields write nothing", async () => {
    const { store, ctx, category, expense } = await setup();
    const recordId = await createMoneyRecord(ctx, expense());
    const treatment = category("expense", "treatment");

    await updateMoneyRecord(ctx, {
      ...expense({ categoryId: treatment, amount: 75_050, notes: "Прививка" }),
      recordId,
    });
    const before = store.audit.length;
    await updateMoneyRecord(ctx, {
      ...expense({ categoryId: treatment, amount: 75_050, notes: " Прививка " }),
      recordId,
    });

    expect(store.moneyRecords.find((r) => r.id === recordId)).toMatchObject({
      kind: "expense",
      categoryId: treatment,
      amount: 75_050,
      notes: "Прививка",
    });
    expect(store.audit).toHaveLength(before);
    expect(store.audit.at(-1)).toMatchObject({
      command: "money.update",
      target: { kind: "Expense", id: recordId },
    });
  });

  test("a record keeps its Archived category, Flock and Shepherd, but cannot get new Archived ones", async () => {
    const { ctx, category, expense } = await setup();
    const shepherdPay = category("expense", "shepherdPay");
    const asan = await aShepherd(ctx);
    const bakyt = await aShepherd(ctx, "Бакыт");
    const north = await aFlock(ctx);
    const south = await aFlock(ctx, "Южная");
    const recordId = await createMoneyRecord(
      ctx,
      expense({
        categoryId: shepherdPay,
        shepherdId: asan,
        scope: { kind: "flock", flockId: north },
      }),
    );
    await archiveMoneyCategory(ctx, { categoryId: shepherdPay });
    await archiveShepherd(ctx, { shepherdId: asan, date: "2026-10-01" });
    await archiveShepherd(ctx, { shepherdId: bakyt, date: "2026-10-01" });
    await archiveFlock(ctx, { flockId: north, date: "2026-10-01" });
    await archiveFlock(ctx, { flockId: south, date: "2026-10-01" });
    const kept = expense({
      categoryId: shepherdPay,
      shepherdId: asan,
      scope: { kind: "flock", flockId: north },
    });

    expect(await errorOf(updateMoneyRecord(ctx, { ...kept, amount: 1, recordId }))).toBeNull();
    expect(await errorOf(updateMoneyRecord(ctx, { ...kept, shepherdId: bakyt, recordId }))).toBe(
      "shepherd.archived",
    );
    expect(
      await errorOf(
        updateMoneyRecord(ctx, { ...kept, scope: { kind: "flock", flockId: south }, recordId }),
      ),
    ).toBe("flock.archived");
    await unarchiveMoneyCategory(ctx, { categoryId: shepherdPay });
    await archiveMoneyCategory(ctx, { categoryId: category("expense", "equipment") });
    expect(
      await errorOf(
        updateMoneyRecord(ctx, {
          ...expense({ categoryId: category("expense", "equipment") }),
          recordId,
        }),
      ),
    ).toBe("moneyCategory.archived");
  });

  test("the kind of a record stays: an Expense cannot get an Income category", async () => {
    const { ctx, category, expense } = await setup();
    const recordId = await createMoneyRecord(ctx, expense());

    expect(
      await errorOf(
        updateMoneyRecord(ctx, {
          ...expense({ categoryId: category("income", "wool") }),
          recordId,
        }),
      ),
    ).toBe("moneyCategory.notFound");
  });
});

describe("deleteMoneyRecord", () => {
  test("a record made by mistake becomes Deleted, with an audit entry", async () => {
    const { store, ctx, expense } = await setup();
    const recordId = await createMoneyRecord(ctx, expense());

    await deleteMoneyRecord(ctx, { recordId });

    expect(store.moneyRecords.find((r) => r.id === recordId)?.deletedAt).toBe(store.time);
    expect(store.audit.at(-1)).toMatchObject({
      command: "money.delete",
      target: { kind: "Expense", id: recordId },
    });
    expect(await errorOf(deleteMoneyRecord(ctx, { recordId }))).toBe("money.notFound");
    expect(
      await listMoneyRecords(ctx, {
        kind: "expense",
        from: null,
        to: null,
        categoryId: null,
        scope: null,
      }),
    ).toEqual({ records: [], total: 0 });
  });

  test("a Member of another Farm cannot delete the record", async () => {
    const { store, operator, ctx, expense } = await setup();
    const recordId = await createMoneyRecord(ctx, expense());
    const other = await createFarm(operator, { name: "Другая", ...settings });
    const stranger = await store.farmContext(
      store.addMember("stranger", other.farmId, "admin"),
      other.farmId,
    );

    expect(await errorOf(deleteMoneyRecord(stranger, { recordId }))).toBe("money.notFound");
    expect(store.moneyRecords.find((r) => r.id === recordId)?.deletedAt).toBeUndefined();
  });
});

describe("the categories", () => {
  test("a Member adds a category with a name that is unique in its list, also among the Archived ones", async () => {
    const { store, ctx } = await setup();

    const cameras = await createMoneyCategory(ctx, { kind: "expense", name: "  Камеры  " });
    await archiveMoneyCategory(ctx, { categoryId: cameras });

    expect(store.moneyCategories.find((c) => c.id === cameras)).toMatchObject({
      kind: "expense",
      key: null,
      name: "Камеры",
    });
    expect(await errorOf(createMoneyCategory(ctx, { kind: "expense", name: "камеры" }))).toBe(
      "moneyCategory.nameTaken",
    );
    // The Income list is another list.
    expect(await errorOf(createMoneyCategory(ctx, { kind: "income", name: "Камеры" }))).toBeNull();
    expect(await errorOf(createMoneyCategory(ctx, { kind: "income", name: "   " }))).toBe(
      "moneyCategory.nameRequired",
    );
    expect(await errorOf(createMoneyCategory(ctx, { kind: "income", name: "а".repeat(61) }))).toBe(
      "moneyCategory.nameTooLong",
    );
    expect(store.audit.at(-1)).toMatchObject({
      command: "moneyCategory.create",
      target: { kind: "IncomeCategory" },
    });
  });

  test("a Member renames a category of the default list; its key stays", async () => {
    const { store, ctx, category } = await setup();
    const equipment = category("expense", "equipment");
    await createMoneyCategory(ctx, { kind: "expense", name: "Камеры" });

    expect(await errorOf(renameMoneyCategory(ctx, { categoryId: equipment, name: "КАМЕРЫ" }))).toBe(
      "moneyCategory.nameTaken",
    );
    await renameMoneyCategory(ctx, { categoryId: equipment, name: "Инвентарь" });
    const before = store.audit.length;
    await renameMoneyCategory(ctx, { categoryId: equipment, name: " Инвентарь " });

    expect(store.moneyCategories.find((c) => c.id === equipment)).toMatchObject({
      key: "equipment",
      name: "Инвентарь",
    });
    expect(store.audit).toHaveLength(before);
    expect(store.audit.at(-1)).toMatchObject({
      command: "moneyCategory.update",
      target: { kind: "ExpenseCategory", id: equipment },
    });
  });

  test("a category in use can only become Archived; a Deleted record counts as a use", async () => {
    const { store, ctx, category, expense } = await setup();
    const shearing = category("expense", "shearing");
    const treatment = category("expense", "treatment");
    const equipment = category("expense", "equipment");
    await createMoneyRecord(ctx, expense({ categoryId: shearing }));
    const mistake = await createMoneyRecord(ctx, expense({ categoryId: treatment }));
    await deleteMoneyRecord(ctx, { recordId: mistake });

    expect(await errorOf(deleteMoneyCategory(ctx, { categoryId: shearing }))).toBe(
      "moneyCategory.inUse",
    );
    expect(await errorOf(deleteMoneyCategory(ctx, { categoryId: treatment }))).toBe(
      "moneyCategory.inUse",
    );
    expect(
      (await listMoneyCategories(ctx, { kind: "expense" })).map(({ key, inUse }) => ({
        key,
        inUse,
      })),
    ).toEqual([
      { key: "shearing", inUse: true },
      { key: "treatment", inUse: true },
      { key: "shepherdPay", inUse: false },
      { key: "equipment", inUse: false },
      { key: "other", inUse: false },
      { key: "sheepPurchase", inUse: false },
      { key: "restock", inUse: false },
    ]);

    await archiveMoneyCategory(ctx, { categoryId: shearing });
    await deleteMoneyCategory(ctx, { categoryId: equipment });

    expect(store.moneyCategories.find((c) => c.id === shearing)?.archivedAt).toBe(store.time);
    expect(store.moneyCategories.find((c) => c.id === equipment)?.deletedAt).toBe(store.time);
    expect(store.audit.slice(-2).map((e) => e.command)).toEqual([
      "moneyCategory.archive",
      "moneyCategory.delete",
    ]);
    expect((await listMoneyCategories(ctx, { kind: "expense" })).map((c) => c.key)).not.toContain(
      "equipment",
    );
  });

  test("an Archived category comes back to the forms; archive and unarchive twice write nothing", async () => {
    const { store, ctx, category } = await setup();
    const wool = category("income", "wool");

    await archiveMoneyCategory(ctx, { categoryId: wool });
    await archiveMoneyCategory(ctx, { categoryId: wool });
    expect((await listMoneyCategories(ctx, { kind: "income" }))[0]).toMatchObject({
      key: "wool",
      archived: true,
    });
    await unarchiveMoneyCategory(ctx, { categoryId: wool });
    await unarchiveMoneyCategory(ctx, { categoryId: wool });

    expect(store.moneyCategories.find((c) => c.id === wool)?.archivedAt).toBeNull();
    expect(store.audit.filter((e) => e.target.id === wool).map((e) => e.command)).toEqual([
      "moneyCategory.create",
      "moneyCategory.archive",
      "moneyCategory.unarchive",
    ]);
  });

  test("the categories of another Farm are not found", async () => {
    const { operator, ctx, category, expense } = await setup();
    const other = await createFarm(operator, { name: "Другая", ...settings });
    const foreign = category("expense", "shearing", other.farmId);

    expect(await errorOf(createMoneyRecord(ctx, expense({ categoryId: foreign })))).toBe(
      "moneyCategory.notFound",
    );
    expect(await errorOf(archiveMoneyCategory(ctx, { categoryId: foreign }))).toBe(
      "moneyCategory.notFound",
    );
  });
});

import { describe, expect, test } from "vite-plus/test";

import type { CommandContext } from "../context";
import { createFarm } from "../farms/commands";
import { archiveFlock, createFlock, createShepherd } from "../flocks/commands";
import type { MoneyCategoryId } from "../ids";
import { deleteSheep, registerSheep } from "../sheep/commands";
import { InMemoryStore } from "../testing/in-memory";
import {
  createMoneyCategory,
  createMoneyRecord,
  deleteMoneyRecord,
  type MoneyRecordInput,
  createAutomaticRecord,
  renameMoneyCategory,
} from "./commands";
import type { CategoryKey, MoneyKind } from "./money";
import { listMoneyCategories, listMoneyRecords, type MoneyRecordFilter } from "./queries";

const settings = { currency: "KGS", timeZone: "Asia/Bishkek", lambAgeMonths: 4 };

/** A Farm with an Editor, a Flock, a Shepherd and a Sheep. Today is 2026-10-18 in the Farm. */
async function setup() {
  const store = new InMemoryStore();
  const operator = store.addUser("operator", { operator: true });
  const { farmId } = await createFarm(operator, { name: "Арашан", ...settings });
  const editor = store.addMember("editor", farmId, "editor");
  const as = (user: CommandContext) => store.farmContext(user, farmId);
  const ctx = await as(editor);
  const category = (kind: MoneyKind, key: CategoryKey): MoneyCategoryId =>
    store.moneyCategories.find((c) => c.farmId === farmId && c.kind === kind && c.key === key)!.id;
  const flockId = await createFlock(ctx, { name: "Северная", locationId: null });
  const shepherdId = await createShepherd(ctx, { name: "Асан", phone: null, notes: null });
  const sheepId = await registerSheep(ctx, {
    tag: "A-12",
    name: "Белка",
    sex: "ewe",
    birthDate: null,
    notes: null,
    weight: null,
    ownerId: store.memberships.find((m) => m.role === "editor")!.id,
    origin: "born",
    initialEntry: true,
  });
  /** Records an Expense of «Стрижка» of the Farm on the date, for the amount. */
  const expense = (date: string, amount: number, change: Partial<MoneyRecordInput> = {}) =>
    createMoneyRecord(ctx, {
      kind: "expense",
      date,
      amount,
      categoryId: category("expense", "shearing"),
      scope: { kind: "farm" },
      shepherdId: null,
      notes: null,
      ...change,
    });
  const filter = (change: Partial<MoneyRecordFilter> = {}): MoneyRecordFilter => ({
    kind: "expense",
    from: null,
    to: null,
    categoryId: null,
    scope: null,
    ...change,
  });
  return { store, ctx, category, flockId, shepherdId, sheepId, expense, filter };
}

describe("listMoneyRecords", () => {
  test("gives the records of the kind, the newest first, with their category, scope and Shepherd", async () => {
    const { store, ctx, category, flockId, shepherdId, sheepId, expense, filter } = await setup();
    const shepherdPay = category("expense", "shepherdPay");
    const early = await expense("2026-09-01", 100_000);
    const ofFlock = await expense("2026-10-01", 250_050, {
      categoryId: shepherdPay,
      shepherdId,
      scope: { kind: "flock", flockId },
      notes: "Сентябрь",
    });
    // Made later on the same date: it comes first.
    store.time += 1000;
    const ofSheep = await expense("2026-10-01", 30_000, {
      categoryId: category("expense", "treatment"),
      scope: { kind: "sheep", sheepId },
    });
    await createMoneyRecord(ctx, {
      kind: "income",
      date: "2026-10-05",
      amount: 900_000,
      categoryId: category("income", "wool"),
      scope: { kind: "farm" },
      shepherdId: null,
      notes: null,
    });
    await archiveFlock(ctx, { flockId, date: "2026-10-18" });

    const { records: rows, total } = await listMoneyRecords(ctx, filter());

    expect(rows.map((row) => row.id)).toEqual([ofSheep, ofFlock, early]);
    expect(total).toBe(100_000 + 250_050 + 30_000);
    expect(rows[1]).toEqual({
      id: ofFlock,
      kind: "expense",
      date: "2026-10-01",
      amount: 250_050,
      category: { id: shepherdPay, key: "shepherdPay", name: null, system: false, archived: false },
      scope: { kind: "flock", flock: { id: flockId, name: "Северная", archived: true } },
      shepherd: { id: shepherdId, name: "Асан", archived: false },
      notes: "Сентябрь",
      source: null,
    });
    expect(rows[0]?.scope).toEqual({
      kind: "sheep",
      sheep: { id: sheepId, tag: "A-12", name: "Белка" },
    });
    expect(rows[2]?.scope).toEqual({ kind: "farm" });
  });

  test("filters by a period with both days included, by a category and by a scope", async () => {
    const { ctx, category, flockId, sheepId, expense, filter } = await setup();
    const shearing = category("expense", "shearing");
    const treatment = category("expense", "treatment");
    const september = await expense("2026-09-30", 100);
    const first = await expense("2026-10-01", 200, { categoryId: treatment });
    const ofFlock = await expense("2026-10-10", 300, { scope: { kind: "flock", flockId } });
    const ofSheep = await expense("2026-10-18", 400, {
      categoryId: treatment,
      scope: { kind: "sheep", sheepId },
    });
    const ids = async (change: Partial<MoneyRecordFilter>) =>
      (await listMoneyRecords(ctx, filter(change))).records.map((row) => row.id);

    expect(await ids({ from: "2026-10-01", to: "2026-10-18" })).toEqual([ofSheep, ofFlock, first]);
    expect(await ids({ to: "2026-10-01" })).toEqual([first, september]);
    expect(await ids({ from: "2026-10-10" })).toEqual([ofSheep, ofFlock]);
    expect(await ids({ categoryId: treatment })).toEqual([ofSheep, first]);
    expect(await ids({ categoryId: shearing, from: "2026-10-01" })).toEqual([ofFlock]);
    // A scope selects only the records of that scope: the Flock does not include its Sheep.
    expect(await ids({ scope: { kind: "farm" } })).toEqual([first, september]);
    expect(await ids({ scope: { kind: "flock", flockId } })).toEqual([ofFlock]);
    expect(await ids({ scope: { kind: "sheep", sheepId } })).toEqual([ofSheep]);
    expect(await ids({ kind: "income" })).toEqual([]);
    expect(await ids({ from: "2026-10-18", to: "2026-10-18" })).toEqual([ofSheep]);
    for (const period of [
      { from: "2026-13-01" },
      { to: "2026-02-30" },
      { from: "2026-10-02", to: "2026-10-01" },
    ]) {
      await expect(listMoneyRecords(ctx, filter(period))).rejects.toMatchObject({
        code: "money.periodInvalid",
      });
    }
  });

  test("hides Deleted records and shows Automatic ones", async () => {
    const { ctx, sheepId, expense, filter } = await setup();
    const mistake = await expense("2026-10-01", 100);
    await deleteMoneyRecord(ctx, { recordId: mistake });
    const purchase = await createAutomaticRecord(ctx, "money.create", {
      key: "sheepPurchase",
      source: { kind: "purchase", id: "purchase-1" },
      date: "2026-10-02",
      amount: 2_000_000,
      scope: { kind: "farm" },
    });
    const ofSheep = await expense("2026-10-03", 500, { scope: { kind: "sheep", sheepId } });
    // The Sheep was a mistake too: the record keeps the scope, without the Tag.
    await deleteSheep(ctx, { sheepId });

    const { records: rows, total } = await listMoneyRecords(ctx, filter());

    expect(rows.map((row) => row.id)).toEqual([ofSheep, purchase]);
    expect(total).toBe(2_000_500);
    expect(rows[0]?.scope).toEqual({
      kind: "sheep",
      sheep: { id: sheepId, tag: null, name: null },
    });
    expect(rows[1]).toMatchObject({
      category: { key: "sheepPurchase", system: true },
      source: { kind: "purchase", id: "purchase-1" },
    });
  });
});

describe("listMoneyCategories", () => {
  test("lists the default categories, then the Members' ones by name, then the System ones", async () => {
    const { ctx, category } = await setup();
    await createMoneyCategory(ctx, { kind: "income", name: "Шкуры" });
    await createMoneyCategory(ctx, { kind: "income", name: "Аренда" });
    await renameMoneyCategory(ctx, { categoryId: category("income", "meat"), name: "Баранина" });

    const rows = await listMoneyCategories(ctx, { kind: "income" });

    expect(rows.map(({ key, name, kind }) => ({ key, name, kind }))).toEqual([
      { key: "wool", name: null, kind: "income" },
      { key: "meat", name: "Баранина", kind: "income" },
      { key: "other", name: null, kind: "income" },
      { key: null, name: "Аренда", kind: "income" },
      { key: null, name: "Шкуры", kind: "income" },
      { key: "sheepSale", name: null, kind: "income" },
    ]);
  });
});

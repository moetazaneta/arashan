import { describe, expect, test } from "vite-plus/test";

import { api } from "./_generated/api";
import { errorCode, farmWithEditor, setup, type Test } from "./test.setup";

const filter = { from: null, to: null, categoryId: null, scope: null };

/** A Farm with an Admin and an Editor, and the calls that the tests make as the Editor. */
async function trashFarm(t: Test, name?: string) {
  const farm = await farmWithEditor(t, name);
  const { editor, farmId } = farm;
  const editorId = await farm.membershipId(`editor${name ?? ""}`);
  const row = (tag: string) => ({
    tag,
    name: null,
    sex: "ewe" as const,
    birthDate: null,
    notes: null,
    ownerId: editorId,
  });
  return {
    ...farm,
    row,
    register: (tag: string) =>
      editor.mutation(api.sheep.register, {
        farmId,
        ...row(tag),
        weight: null,
        origin: "born",
        initialEntry: true,
      }),
    sell: (sheepIds: string[], price = 3_000_000) =>
      editor.mutation(api.deals.sell, { farmId, sheepIds, date: "2026-10-15", price }),
    buy: (tags: string[], flockId: string | null = null) =>
      editor.mutation(api.deals.buy, {
        farmId,
        sheep: tags.map(row),
        date: "2026-10-12",
        price: 12_000_000,
        flockId,
      }),
    cancel: (dealId: string) => editor.mutation(api.deals.cancel, { farmId, dealId }),
    trash: () => editor.query(api.trash.list, { farmId }),
    restore: (kind: string, id: string) => editor.mutation(api.trash.restore, { farmId, kind, id }),
    money: (kind: "expense" | "income") =>
      editor.query(api.money.list, { farmId, kind, ...filter }),
    expenseCategory: async () =>
      (await editor.query(api.money.categories, { farmId, kind: "expense" }))[0]!.id,
  };
}

/** All the audit entries of all Farms, oldest first, as "command Kind". */
async function auditLog(t: Test) {
  const rows = await t.run((ctx) => ctx.db.query("auditLog").collect());
  return rows.map((row) => `${row.command} ${row.targetKind}`);
}

describe("trash", () => {
  test("lists each kind of Deleted record, and not the parts of a cancelled event", async () => {
    const t = setup();
    const farm = await trashFarm(t);
    const { editor, farmId } = farm;
    const [deleted, sold, kept] = [
      await farm.register("A-1"),
      await farm.register("A-2"),
      await farm.register("A-3"),
    ];
    await editor.mutation(api.sheep.markDeleted, { farmId, sheepId: deleted });
    const saleId = await farm.sell([sold]);
    await farm.cancel(saleId);
    const purchaseId = await farm.buy(["B-1"]);
    await farm.cancel(purchaseId);
    const expenseId = await editor.mutation(api.money.create, {
      farmId,
      kind: "expense",
      categoryId: await farm.expenseCategory(),
      date: "2026-10-10",
      amount: 150_050,
      scope: { kind: "sheep", sheepId: kept },
      shepherdId: null,
      notes: null,
    });
    await editor.mutation(api.money.remove, { farmId, recordId: expenseId });
    const categoryId = await editor.mutation(api.money.createCategory, {
      farmId,
      kind: "income",
      name: "Шкуры",
    });
    await editor.mutation(api.money.deleteCategory, { farmId, categoryId });
    const resourceId = await editor.mutation(api.resources.create, {
      farmId,
      name: "Сено",
      unit: "кг",
    });
    const eventId = await editor.mutation(api.resources.restock, {
      farmId,
      resourceId,
      date: "2026-10-11",
      quantity: 500_000,
      price: 2_500_000,
    });
    await editor.mutation(api.resources.cancelEvent, { farmId, eventId });
    const breedId = await editor.mutation(api.breeds.add, { farmId, name: "Гиссарская" });
    await editor.mutation(api.breeds.markDeleted, { farmId, breedId });
    const flockId = await editor.mutation(api.flocks.create, {
      farmId,
      name: "Отара",
      locationId: null,
    });
    const shepherdId = await editor.mutation(api.shepherds.create, {
      farmId,
      name: "Асан",
      phone: null,
      notes: null,
    });
    const assignmentId = await editor.mutation(api.flocks.assignShepherd, {
      farmId,
      flockId,
      shepherdId,
      from: "2025-04-01",
      to: null,
    });
    await editor.mutation(api.flocks.removeAssignment, { farmId, assignmentId });

    const items = await farm.trash();

    // The Automatic Income and Expenses, and the Sheep of the Purchase, are Deleted too, but they
    // come back with their events: they are no entries.
    expect(items.map((item) => item.kind).sort()).toEqual([
      "breed",
      "deal",
      "deal",
      "moneyCategory",
      "moneyRecord",
      "resourceEvent",
      "sheep",
      "shepherdAssignment",
    ]);
    const item = (id: string) => items.find((one) => one.id === id);
    expect(item(deleted)).toMatchObject({ kind: "sheep", record: { tag: "A-1" } });
    expect(item(saleId)).toMatchObject({
      kind: "deal",
      record: { kind: "sale", date: "2026-10-15", price: 3_000_000, sheepCount: 1 },
    });
    expect(item(purchaseId)).toMatchObject({
      kind: "deal",
      record: { kind: "purchase", price: 12_000_000, sheep: [{ tag: "B-1" }] },
    });
    expect(item(expenseId)).toMatchObject({
      kind: "moneyRecord",
      record: { kind: "expense", amount: 150_050 },
    });
    expect(item(categoryId)).toMatchObject({
      kind: "moneyCategory",
      record: { kind: "income", name: "Шкуры" },
    });
    expect(item(eventId)).toMatchObject({
      kind: "resourceEvent",
      record: { kind: "restock", quantity: 500_000, resource: { name: "Сено", unit: "кг" } },
    });
    expect(item(breedId)).toMatchObject({ kind: "breed", record: { name: "Гиссарская" } });
    expect(item(assignmentId)).toMatchObject({
      kind: "shepherdAssignment",
      record: {
        flock: { name: "Отара" },
        shepherd: { name: "Асан" },
        from: "2025-04-01",
        to: null,
      },
    });
    // The one that became Deleted last comes first.
    const times = items.map((one) => one.deletedAt);
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  test("restoring a Sale brings back the deal, its Income and its Sold Sheep", async () => {
    const t = setup();
    const farm = await trashFarm(t);
    const { editor, farmId } = farm;
    const sheepIds = [await farm.register("A-1"), await farm.register("A-2")];
    const saleId = await farm.sell(sheepIds);
    await farm.cancel(saleId);
    const before = (await auditLog(t)).length;

    await farm.restore("deal", saleId);

    expect(await farm.trash()).toEqual([]);
    const card = await editor.query(api.deals.get, { farmId, dealId: saleId });
    expect(card).toMatchObject({ kind: "sale", date: "2026-10-15", price: 3_000_000 });
    expect(card!.sheep.map((sheep) => [sheep.tag, sheep.status])).toEqual([
      ["A-1", "sold"],
      ["A-2", "sold"],
    ]);
    expect(await editor.query(api.deals.list, { farmId, kind: "sale" })).toMatchObject([
      { id: saleId, price: 3_000_000, sheepCount: 2 },
    ]);
    expect((await farm.money("income")).records).toMatchObject([
      { amount: 3_000_000, source: { kind: "sale", id: saleId } },
    ]);
    expect((await auditLog(t)).slice(before).sort()).toEqual([
      "sale.restore Income",
      "sale.restore Sale",
      "sale.restore Sheep",
      "sale.restore Sheep",
    ]);
  });

  test("restoring a Purchase brings back the deal, its new Sheep and its Expense", async () => {
    const t = setup();
    const farm = await trashFarm(t);
    const { editor, farmId } = farm;
    const flockId = await editor.mutation(api.flocks.create, {
      farmId,
      name: "Отара",
      locationId: null,
    });
    const purchaseId = await farm.buy(["B-1", "B-2"], flockId);
    await farm.cancel(purchaseId);
    expect(await editor.query(api.sheep.list, { farmId })).toEqual([]);
    const before = (await auditLog(t)).length;

    await farm.restore("deal", purchaseId);

    expect(await farm.trash()).toEqual([]);
    expect(
      (await editor.query(api.sheep.list, { farmId })).map((sheep) => [sheep.tag, sheep.status]),
    ).toEqual([
      ["B-1", "active"],
      ["B-2", "active"],
    ]);
    expect(await editor.query(api.deals.list, { farmId, kind: "purchase" })).toMatchObject([
      { id: purchaseId, price: 12_000_000, sheepCount: 2, flock: { id: flockId } },
    ]);
    expect((await farm.money("expense")).records).toMatchObject([
      { amount: 12_000_000, source: { kind: "purchase", id: purchaseId } },
    ]);
    expect((await editor.query(api.flocks.get, { farmId, flockId }))!.sheep).toHaveLength(2);
    expect((await auditLog(t)).slice(before).sort()).toEqual([
      "purchase.restore Expense",
      "purchase.restore Purchase",
      "purchase.restore Sheep",
      "purchase.restore Sheep",
    ]);
  });

  test("restoring a Restock counts its quantity in the Stock again, with its Expense", async () => {
    const t = setup();
    const farm = await trashFarm(t);
    const { editor, farmId } = farm;
    const resourceId = await editor.mutation(api.resources.create, {
      farmId,
      name: "Сено",
      unit: "кг",
    });
    const eventId = await editor.mutation(api.resources.restock, {
      farmId,
      resourceId,
      date: "2026-10-11",
      quantity: 500_000,
      price: 2_500_000,
    });
    await editor.mutation(api.resources.cancelEvent, { farmId, eventId });
    expect((await editor.query(api.resources.get, { farmId, resourceId }))!.stock).toBe(0);
    // The cancelled event keeps the unit: else its 500 «кг» would come back in another unit.
    expect(
      await errorCode(
        editor.mutation(api.resources.update, { farmId, resourceId, name: "Сено", unit: "тюк" }),
      ),
    ).toBe("resource.unitLocked");
    const before = (await auditLog(t)).length;

    await farm.restore("resourceEvent", eventId);

    const card = await editor.query(api.resources.get, { farmId, resourceId });
    expect(card!.stock).toBe(500_000);
    expect(card!.events).toMatchObject([{ id: eventId, kind: "restock" }]);
    expect((await farm.money("expense")).records).toMatchObject([
      { amount: 2_500_000, source: { kind: "restock", id: eventId } },
    ]);
    expect(await farm.trash()).toEqual([]);
    expect((await auditLog(t)).slice(before).sort()).toEqual([
      "resource.restoreEvent Expense",
      "resource.restoreEvent Resource",
      "resource.restoreEvent ResourceEvent",
    ]);
  });

  test("restoring a Sheep, an Expense, a category, a Breed and an assignment puts each back", async () => {
    const t = setup();
    const farm = await trashFarm(t);
    const { editor, farmId } = farm;
    const sheepId = await farm.register("A-1");
    await editor.mutation(api.sheep.markDeleted, { farmId, sheepId });
    const recordId = await editor.mutation(api.money.create, {
      farmId,
      kind: "expense",
      categoryId: await farm.expenseCategory(),
      date: "2026-10-10",
      amount: 150_050,
      scope: { kind: "farm" },
      shepherdId: null,
      notes: null,
    });
    await editor.mutation(api.money.remove, { farmId, recordId });
    const categoryId = await editor.mutation(api.money.createCategory, {
      farmId,
      kind: "expense",
      name: "Ветеринар",
    });
    await editor.mutation(api.money.deleteCategory, { farmId, categoryId });
    const breedId = await editor.mutation(api.breeds.add, { farmId, name: "Гиссарская" });
    await editor.mutation(api.breeds.markDeleted, { farmId, breedId });
    const flockId = await editor.mutation(api.flocks.create, {
      farmId,
      name: "Отара",
      locationId: null,
    });
    const shepherdId = await editor.mutation(api.shepherds.create, {
      farmId,
      name: "Асан",
      phone: null,
      notes: null,
    });
    const assignmentId = await editor.mutation(api.flocks.assignShepherd, {
      farmId,
      flockId,
      shepherdId,
      from: "2025-04-01",
      to: null,
    });
    await editor.mutation(api.flocks.removeAssignment, { farmId, assignmentId });
    expect(await farm.trash()).toHaveLength(5);
    const before = (await auditLog(t)).length;

    for (const [kind, id] of [
      ["sheep", sheepId],
      ["moneyRecord", recordId],
      ["moneyCategory", categoryId],
      ["breed", breedId],
      ["shepherdAssignment", assignmentId],
    ] as const) {
      await farm.restore(kind, id);
    }

    expect(await farm.trash()).toEqual([]);
    expect(await editor.query(api.sheep.list, { farmId })).toMatchObject([
      { id: sheepId, tag: "A-1" },
    ]);
    expect((await farm.money("expense")).records).toMatchObject([
      { id: recordId, amount: 150_050 },
    ]);
    expect(
      (await editor.query(api.money.categories, { farmId, kind: "expense" })).map((c) => c.id),
    ).toContain(categoryId);
    expect((await editor.query(api.breeds.list, { farmId })).map((breed) => breed.id)).toContain(
      breedId,
    );
    expect((await editor.query(api.flocks.get, { farmId, flockId }))!.assignments).toMatchObject([
      { id: assignmentId, shepherd: { name: "Асан" }, from: "2025-04-01", to: null },
    ]);
    expect((await auditLog(t)).slice(before).sort()).toEqual([
      "breed.restore Breed",
      "flock.restoreAssignment Flock",
      "flock.restoreAssignment Shepherd",
      "money.restore Expense",
      "moneyCategory.restore ExpenseCategory",
      "sheep.restore Sheep",
    ]);
  });

  test("picks the Automatic record that became Deleted last, if an event has more than one", async () => {
    const t = setup();
    const farm = await trashFarm(t);
    const saleId = await farm.sell([await farm.register("A-1")]);
    await farm.cancel(saleId);
    const [first] = await t.run((ctx) => ctx.db.query("moneyRecords").collect());
    const { _id, _creationTime, ...fields } = first!;
    const lastId = await t.run((ctx) =>
      ctx.db.insert("moneyRecords", {
        ...fields,
        amount: 2_000_000,
        deletedAt: first!.deletedAt! + 1000,
      }),
    );
    expect((await farm.trash()).find((item) => item.id === saleId)).toMatchObject({
      record: { price: 2_000_000 },
    });

    await farm.restore("deal", saleId);

    expect((await farm.money("income")).records).toMatchObject([
      { id: lastId, amount: 2_000_000, source: { kind: "sale", id: saleId } },
    ]);
    const older = await t.run((ctx) => ctx.db.get(_id));
    expect(older!.deletedAt).toBeTypeOf("number");
  });

  test("a restore that breaks a rule gives the error of the rule and writes nothing", async () => {
    const t = setup();
    const farm = await trashFarm(t);
    const { editor, farmId } = farm;
    const tagged = await farm.register("A-1");
    await editor.mutation(api.sheep.markDeleted, { farmId, sheepId: tagged });
    await farm.register("a-1");
    const [first, second] = [await farm.register("B-1"), await farm.register("B-2")];
    const saleId = await farm.sell([first, second]);
    await farm.cancel(saleId);
    await editor.mutation(api.sheep.changeStatus, {
      farmId,
      sheepIds: [second],
      status: "dead",
      date: "2026-10-16",
      reason: null,
    });
    const tables = () =>
      t.run(async (ctx) => [
        await ctx.db.query("sheep").collect(),
        await ctx.db.query("deals").collect(),
        await ctx.db.query("moneyRecords").collect(),
        await ctx.db.query("sheepStatusChanges").collect(),
        await ctx.db.query("auditLog").collect(),
      ]);
    const before = await tables();

    // The Tag of the Sheep is the Tag of another Sheep now.
    expect(await errorCode(farm.restore("sheep", tagged))).toBe("sheep.tagTaken");
    // A Sheep of the Sale is not Active any more, so the Sale cannot sell it again.
    expect(await errorCode(farm.restore("deal", saleId))).toBe("sheep.notActive");

    expect(await tables()).toEqual(before);
    expect((await farm.trash()).map((item) => item.id).sort()).toEqual([saleId, tagged].sort());
  });

  test("gives trash.notFound for a record of another Farm, an unknown kind and a second restore", async () => {
    const t = setup();
    const farm = await trashFarm(t);
    const other = await trashFarm(t, "Другая");
    const sheepId = await farm.register("A-1");
    await farm.editor.mutation(api.sheep.markDeleted, { farmId: farm.farmId, sheepId });

    expect(await errorCode(other.restore("sheep", sheepId))).toBe("trash.notFound");
    expect(await other.trash()).toEqual([]);
    expect(await errorCode(farm.restore("flock", sheepId))).toBe("trash.notFound");
    expect(await errorCode(farm.restore("sheep", "not-an-id"))).toBe("trash.notFound");
    expect(await farm.trash()).toHaveLength(1);

    await farm.restore("sheep", sheepId);
    expect(await errorCode(farm.restore("sheep", sheepId))).toBe("trash.notFound");
    // A Member of another Farm cannot read this Trash.
    expect(await errorCode(other.editor.query(api.trash.list, { farmId: farm.farmId }))).toBe(
      "farm.notMember",
    );
  });
});

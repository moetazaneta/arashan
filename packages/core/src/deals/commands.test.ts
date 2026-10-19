import { describe, expect, test } from "vite-plus/test";

import type { CommandContext } from "../context";
import { createFarm } from "../farms/commands";
import { archiveFlock, createFlock, moveSheep } from "../flocks/commands";
import type { DealId, FarmId, SheepId } from "../ids";
import { removeMember } from "../members/manage";
import { deleteMoneyRecord, updateMoneyRecord } from "../money/commands";
import { maxAmount } from "../money/money";
import {
  type BoughtSheep,
  changeSheepOwner,
  deleteSheep,
  registerSheep,
  type SheepRegistration,
  updateSheep,
} from "../sheep/commands";
import { changeSheepStatus } from "../sheep/lifecycle";
import { InMemoryStore } from "../testing/in-memory";
import { buySheep, cancelDeal, changeDealPrice, sellSheep } from "./commands";
import { maxSheepPerPurchase, maxSheepPerSale } from "./deal";
import { getDeal } from "./queries";

const settings = { currency: "KGS", timeZone: "Asia/Bishkek", lambAgeMonths: 4 };

/**
 * A Farm with an Admin and an Editor. The time is 2026-10-18 18:00 in Bishkek, the time zone of the
 * Farm, so today is 2026-10-18. `ctx` is the context of the Editor.
 */
async function setup() {
  const store = new InMemoryStore();
  const operator = store.addUser("operator", { operator: true });
  const { farmId } = await createFarm(operator, { name: "Арашан", ...settings });
  const admin = store.addMember("admin", farmId, "admin");
  const adminId = store.memberships.at(-1)!.id;
  const editor = store.addMember("editor", farmId, "editor");
  const editorId = store.memberships.at(-1)!.id;
  const as = (user: CommandContext, farm: FarmId = farmId) => store.farmContext(user, farm);
  const ctx = await as(editor);
  /** Registers an Active Ewe as an Initial entry, with the Editor as its Owner. */
  const register = (change: Partial<SheepRegistration> = {}) =>
    registerSheep(ctx, {
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
  /** A row of the form of a Purchase: a Ram of the Editor. */
  const row = (change: Partial<BoughtSheep> = {}): BoughtSheep => ({
    tag: null,
    name: null,
    sex: "ram",
    birthDate: null,
    notes: null,
    ownerId: editorId,
    ...change,
  });
  const flock = (name = "Стадо") => createFlock(ctx, { name, locationId: null });
  return { store, farmId, admin, adminId, editorId, as, ctx, register, row, flock };
}

const sheepOf = (store: InMemoryStore, id: SheepId) => store.sheep.find((s) => s.id === id)!;
const dealOf = (store: InMemoryStore, id: DealId) => store.deals.find((d) => d.id === id)!;
/** The Automatic record of the deal, also a Deleted one. */
const recordOf = (store: InMemoryStore, id: DealId) =>
  store.moneyRecords.find((r) => r.source?.id === id)!;
const categoryKeyOf = (store: InMemoryStore, id: string) =>
  store.moneyCategories.find((c) => c.id === id)?.key;

/** The audit entries that the store gets after this call, as "command kind id". */
function auditFrom(store: InMemoryStore) {
  const start = store.audit.length;
  return () => store.audit.slice(start).map((e) => `${e.command} ${e.target.kind} ${e.target.id}`);
}

/** The records of the store as plain data, to compare it before and after a command. */
const snapshot = (store: InMemoryStore) =>
  JSON.parse(
    JSON.stringify({
      sheep: store.sheep,
      deals: store.deals,
      moneyRecords: store.moneyRecords,
      statusChanges: store.statusChanges,
      flockMoves: store.flockMoves,
      audit: store.audit,
    }),
  ) as unknown;

describe("sellSheep", () => {
  test("Sheep of different Owners become Sold, leave their Flock, and the Sale makes an Income", async () => {
    const { store, ctx, register, flock, adminId } = await setup();
    const flockId = await flock();
    const first = await register({ tag: "A-1" });
    const second = await register({ tag: "A-2", ownerId: adminId });
    await moveSheep(ctx, { sheepIds: [first], flockId, date: "2026-10-01" });
    const audit = auditFrom(store);

    const saleId = await sellSheep(ctx, {
      sheepIds: [first, second, first],
      date: "2026-10-15",
      price: 3_000_000,
    });

    expect(dealOf(store, saleId)).toEqual({
      id: saleId,
      farmId: ctx.farm.id,
      kind: "sale",
      date: "2026-10-15",
      sheepIds: [first, second],
      flockId: null,
      createdAt: store.time,
    });
    for (const id of [first, second]) {
      expect(sheepOf(store, id)).toMatchObject({ status: "sold", flockId: null });
      expect(store.statusChanges.find((c) => c.sheepId === id)).toMatchObject({
        from: "active",
        to: "sold",
        date: "2026-10-15",
        saleId,
      });
    }
    expect(store.flockMoves.at(-1)).toMatchObject({
      sheepId: first,
      flockId: null,
      date: "2026-10-15",
    });
    const income = recordOf(store, saleId);
    expect(income).toMatchObject({
      kind: "income",
      date: "2026-10-15",
      amount: 3_000_000,
      scope: { kind: "farm" },
      source: { kind: "sale", id: saleId },
    });
    expect(categoryKeyOf(store, income.categoryId)).toBe("sheepSale");
    expect(audit()).toEqual([
      `sale.create Sale ${saleId}`,
      `sale.create Income ${income.id}`,
      `sale.create Sheep ${first}`,
      `sale.create Sheep ${second}`,
    ]);
  });

  test("the Income of a Sale of one Sheep is about that Sheep", async () => {
    const { store, ctx, register } = await setup();
    const sheepId = await register();

    const saleId = await sellSheep(ctx, {
      sheepIds: [sheepId],
      date: "2026-10-15",
      price: 150_050,
    });

    expect(recordOf(store, saleId).scope).toEqual({ kind: "sheep", sheepId });
  });

  test("a Sale that breaks a rule writes nothing", async () => {
    const { store, ctx, register } = await setup();
    const active = await register({ birthDate: "2026-03-01" });
    const dead = await register();
    await changeSheepStatus(ctx, {
      sheepIds: [dead],
      status: "dead",
      date: "2026-10-01",
      reason: null,
    });
    const before = snapshot(store);
    const sale = (change: Partial<Parameters<typeof sellSheep>[1]>) =>
      sellSheep(ctx, { sheepIds: [active], date: "2026-10-15", price: 100, ...change });

    await expect(sale({ sheepIds: [] })).rejects.toThrow("deal.noSheep");
    const many = Array.from({ length: maxSheepPerSale + 1 }, (_, i) => `sheep-x${i}` as SheepId);
    await expect(sale({ sheepIds: many })).rejects.toThrow("deal.tooManySheep");
    await expect(sale({ date: "2026-02-30" })).rejects.toThrow("deal.dateInvalid");
    await expect(sale({ date: "2026-10-19" })).rejects.toThrow("deal.dateInFuture");
    for (const price of [0, -5, 10.5, maxAmount + 1, Number.NaN]) {
      await expect(sale({ price })).rejects.toThrow("deal.priceInvalid");
    }
    await expect(sale({ sheepIds: [active, dead] })).rejects.toThrow("sheep.notActive");
    await expect(sale({ sheepIds: [active, "sheep-x" as SheepId] })).rejects.toThrow(
      "sheep.notFound",
    );
    // Not before the birth date.
    await expect(sale({ date: "2026-02-01" })).rejects.toThrow("sheep.statusDateInvalid");
    expect(snapshot(store)).toEqual(before);
  });

  test("a Bought Sheep is not sold before the day of its Purchase", async () => {
    const { ctx, row } = await setup();
    const purchaseId = await buySheep(ctx, {
      sheep: [row()],
      date: "2026-10-10",
      price: 100,
      flockId: null,
    });
    const [sheepId] = (await getDeal(ctx, { dealId: purchaseId }))!.sheep.map((s) => s.id);

    await expect(
      sellSheep(ctx, { sheepIds: [sheepId!], date: "2026-10-09", price: 100 }),
    ).rejects.toThrow("sheep.statusDateInvalid");
    await expect(
      changeSheepStatus(ctx, {
        sheepIds: [sheepId!],
        status: "dead",
        date: "2026-10-09",
        reason: null,
      }),
    ).rejects.toThrow("sheep.statusDateInvalid");
    await expect(
      updateSheep(ctx, {
        sheepId: sheepId!,
        tag: null,
        name: null,
        sex: "ram",
        birthDate: "2026-10-11",
        notes: null,
        weight: null,
      }),
    ).rejects.toThrow("deal.bornAfterPurchase");

    await sellSheep(ctx, { sheepIds: [sheepId!], date: "2026-10-10", price: 100 });
  });
});

describe("buySheep", () => {
  test("new Sheep become Bought, go into the Flock, and the Purchase makes an Expense", async () => {
    const { store, ctx, row, flock, adminId } = await setup();
    const flockId = await flock();
    const audit = auditFrom(store);

    const purchaseId = await buySheep(ctx, {
      sheep: [
        row({ tag: " B-1 ", name: "Бурый", birthDate: "2025-04-01" }),
        row({ tag: "B-2", sex: "ewe", ownerId: adminId, notes: "Хромает" }),
      ],
      date: "2026-10-12",
      price: 12_000_000,
      flockId,
    });

    const deal = dealOf(store, purchaseId);
    expect(deal).toMatchObject({ kind: "purchase", date: "2026-10-12", flockId });
    expect(deal.sheepIds).toHaveLength(2);
    const [first, second] = deal.sheepIds.map((id) => sheepOf(store, id));
    expect(first).toMatchObject({
      tag: "B-1",
      name: "Бурый",
      sex: "ram",
      birthDate: "2025-04-01",
      origin: "bought",
      initialEntry: false,
      purchaseId,
      status: "active",
      flockId,
    });
    expect(second).toMatchObject({ tag: "B-2", sex: "ewe", notes: "Хромает", purchaseId });
    expect(second!.ownerId).toBe(adminId);
    expect(store.flockMoves.map((m) => [m.sheepId, m.flockId, m.date])).toEqual([
      [first!.id, flockId, "2026-10-12"],
      [second!.id, flockId, "2026-10-12"],
    ]);
    const expense = recordOf(store, purchaseId);
    expect(expense).toMatchObject({
      kind: "expense",
      date: "2026-10-12",
      amount: 12_000_000,
      scope: { kind: "farm" },
      source: { kind: "purchase", id: purchaseId },
    });
    expect(categoryKeyOf(store, expense.categoryId)).toBe("sheepPurchase");
    expect(audit()).toEqual([
      `purchase.create Sheep ${first!.id}`,
      `purchase.create Sheep ${second!.id}`,
      `purchase.create Purchase ${purchaseId}`,
      `purchase.create Expense ${expense.id}`,
    ]);
  });

  test("the Expense of a Purchase of one Sheep is about that Sheep, and no Flock is optional", async () => {
    const { store, ctx, row } = await setup();

    const purchaseId = await buySheep(ctx, {
      sheep: [row()],
      date: "2026-10-12",
      price: 100,
      flockId: null,
    });

    const [sheepId] = dealOf(store, purchaseId).sheepIds;
    expect(sheepOf(store, sheepId!).flockId).toBeNull();
    expect(store.flockMoves).toEqual([]);
    expect(recordOf(store, purchaseId).scope).toEqual({ kind: "sheep", sheepId });
  });

  test("a Purchase that breaks a rule writes nothing", async () => {
    const { store, ctx, row, flock, register, adminId, admin, farmId } = await setup();
    await register({ tag: "A-1" });
    const archived = await flock("Старое");
    await archiveFlock(ctx, { flockId: archived, date: "2026-10-01" });
    store.addMember("removed", farmId, "editor");
    const removedId = store.memberships.at(-1)!.id;
    await removeMember(await store.farmContext(admin, farmId), { membershipId: removedId });
    const before = snapshot(store);
    const purchase = (change: Partial<Parameters<typeof buySheep>[1]>) =>
      buySheep(ctx, { sheep: [row()], date: "2026-10-12", price: 100, flockId: null, ...change });

    await expect(purchase({ sheep: [] })).rejects.toThrow("deal.noSheep");
    const many = Array.from({ length: maxSheepPerPurchase + 1 }, () => row());
    await expect(purchase({ sheep: many })).rejects.toThrow("deal.tooManySheep");
    await expect(purchase({ date: "2026-10-19" })).rejects.toThrow("deal.dateInFuture");
    await expect(purchase({ price: 0 })).rejects.toThrow("deal.priceInvalid");
    await expect(purchase({ flockId: archived })).rejects.toThrow("flock.archived");
    await expect(purchase({ sheep: [row(), row({ tag: "а-1" })] })).rejects.toThrow(
      "sheep.tagTaken",
    );
    await expect(purchase({ sheep: [row({ tag: "C-1" }), row({ tag: "c-1 " })] })).rejects.toThrow(
      "sheep.tagTaken",
    );
    await expect(purchase({ sheep: [row({ birthDate: "2026-10-13" })] })).rejects.toThrow(
      "deal.bornAfterPurchase",
    );
    await expect(purchase({ sheep: [row({ ownerId: removedId })] })).rejects.toThrow(
      "sheep.ownerNotMember",
    );
    await expect(
      purchase({ sheep: [row({ ownerId: adminId, tag: "x".repeat(31) })] }),
    ).rejects.toThrow("sheep.tagTooLong");
    expect(snapshot(store)).toEqual(before);
  });

  test("a Member registers a Bought Sheep only with a Purchase, outside the Initial entry", async () => {
    const { register } = await setup();

    await expect(
      register({ origin: "bought", initialEntry: false, birthDate: "2026-01-01" }),
    ).rejects.toThrow("sheep.purchaseRequired");
  });
});

describe("the price of a deal", () => {
  test("a change on the deal changes the amount of its Automatic record", async () => {
    const { store, ctx, register } = await setup();
    const saleId = await sellSheep(ctx, {
      sheepIds: [await register(), await register()],
      date: "2026-10-15",
      price: 3_000_000,
    });
    const income = recordOf(store, saleId);
    const audit = auditFrom(store);

    await changeDealPrice(ctx, { dealId: saleId, price: 2_800_000 });

    expect(recordOf(store, saleId)).toMatchObject({ amount: 2_800_000, date: "2026-10-15" });
    expect((await getDeal(ctx, { dealId: saleId }))!.price).toBe(2_800_000);
    expect(audit()).toEqual([
      `sale.updatePrice Income ${income.id}`,
      `sale.updatePrice Sale ${saleId}`,
    ]);
  });

  test("a change of the amount in the money table changes the price of the deal", async () => {
    const { store, ctx, row } = await setup();
    const purchaseId = await buySheep(ctx, {
      sheep: [row()],
      date: "2026-10-12",
      price: 5_000_000,
      flockId: null,
    });
    const expense = recordOf(store, purchaseId);

    await updateMoneyRecord(ctx, {
      recordId: expense.id,
      date: expense.date,
      amount: 4_500_000,
      categoryId: expense.categoryId,
      scope: expense.scope,
      shepherdId: null,
      notes: "Скидка",
    });

    expect((await getDeal(ctx, { dealId: purchaseId }))!.price).toBe(4_500_000);
    await changeDealPrice(ctx, { dealId: purchaseId, price: 4_600_000 });
    expect(recordOf(store, purchaseId)).toMatchObject({ amount: 4_600_000, notes: "Скидка" });
  });

  test("the same price writes nothing, and a wrong price is rejected", async () => {
    const { store, ctx, register } = await setup();
    const saleId = await sellSheep(ctx, {
      sheepIds: [await register()],
      date: "2026-10-15",
      price: 100,
    });
    const before = snapshot(store);

    await changeDealPrice(ctx, { dealId: saleId, price: 100 });
    await expect(changeDealPrice(ctx, { dealId: saleId, price: 0 })).rejects.toThrow(
      "deal.priceInvalid",
    );
    await expect(changeDealPrice(ctx, { dealId: "deal-x" as DealId, price: 100 })).rejects.toThrow(
      "deal.notFound",
    );
    expect(snapshot(store)).toEqual(before);
  });

  test("a Member cannot delete an Automatic record: only the cancel of the deal removes it", async () => {
    const { store, ctx, register } = await setup();
    const saleId = await sellSheep(ctx, {
      sheepIds: [await register()],
      date: "2026-10-15",
      price: 100,
    });

    await expect(deleteMoneyRecord(ctx, { recordId: recordOf(store, saleId).id })).rejects.toThrow(
      "money.automatic",
    );
  });
});

describe("cancelDeal", () => {
  test("a cancelled Sale makes its Sheep Active again, in their Flocks, without its Income", async () => {
    const { store, ctx, register, flock } = await setup();
    const flockId = await flock();
    const first = await register();
    const second = await register();
    await moveSheep(ctx, { sheepIds: [first], flockId, date: "2026-10-01" });
    const saleId = await sellSheep(ctx, {
      sheepIds: [first, second],
      date: "2026-10-15",
      price: 100,
    });
    const income = recordOf(store, saleId);
    const audit = auditFrom(store);

    await cancelDeal(ctx, { dealId: saleId });

    expect(sheepOf(store, first)).toMatchObject({ status: "active", flockId });
    expect(sheepOf(store, second)).toMatchObject({ status: "active", flockId: null });
    expect(store.statusChanges.every((c) => c.deletedAt === store.time)).toBe(true);
    expect(store.flockMoves.filter((m) => m.deletedAt === undefined)).toHaveLength(1);
    expect(recordOf(store, saleId).deletedAt).toBe(store.time);
    expect(dealOf(store, saleId).deletedAt).toBe(store.time);
    expect(await getDeal(ctx, { dealId: saleId })).toBeNull();
    expect(audit()).toEqual([
      `sale.cancel Sheep ${first}`,
      `sale.cancel Sheep ${second}`,
      `sale.cancel Income ${income.id}`,
      `sale.cancel Sale ${saleId}`,
    ]);
    // The Sheep are on the Farm again: a new Sale can sell them.
    await sellSheep(ctx, { sheepIds: [first], date: "2026-10-16", price: 100 });
  });

  test("a cancelled Sale leaves a Sheep in no Flock if its Flock is Archived now", async () => {
    const { store, ctx, register, flock } = await setup();
    const flockId = await flock();
    const sheepId = await register();
    await moveSheep(ctx, { sheepIds: [sheepId], flockId, date: "2026-10-01" });
    const saleId = await sellSheep(ctx, { sheepIds: [sheepId], date: "2026-10-15", price: 100 });
    await archiveFlock(ctx, { flockId, date: "2026-10-16" });

    await cancelDeal(ctx, { dealId: saleId });

    expect(sheepOf(store, sheepId)).toMatchObject({ status: "active", flockId: null });
  });

  test("a Sale is not cancelled if the Owner of one of its Sheep is not a Member now", async () => {
    const { store, ctx, register, admin, farmId } = await setup();
    store.addMember("shepherd", farmId, "editor");
    const ownerId = store.memberships.at(-1)!.id;
    const kept = await register();
    const sold = await register({ ownerId });
    const saleId = await sellSheep(ctx, { sheepIds: [kept, sold], date: "2026-10-15", price: 100 });
    // The Member owns no Active Sheep after the Sale, so an Admin can remove the Member.
    await removeMember(await store.farmContext(admin, farmId), { membershipId: ownerId });
    const before = snapshot(store);

    await expect(cancelDeal(ctx, { dealId: saleId })).rejects.toThrow("sheep.ownerNotMember");
    expect(snapshot(store)).toEqual(before);
  });

  test("a cancelled Purchase makes its Sheep Deleted, without its Expense", async () => {
    const { store, ctx, row, flock } = await setup();
    const flockId = await flock();
    const purchaseId = await buySheep(ctx, {
      sheep: [row({ tag: "B-1" }), row({ tag: "B-2" })],
      date: "2026-10-12",
      price: 100,
      flockId,
    });
    const [first, second] = dealOf(store, purchaseId).sheepIds;
    const expense = recordOf(store, purchaseId);
    const audit = auditFrom(store);

    await cancelDeal(ctx, { dealId: purchaseId });

    expect(sheepOf(store, first!).deletedAt).toBe(store.time);
    expect(sheepOf(store, second!).deletedAt).toBe(store.time);
    expect(recordOf(store, purchaseId).deletedAt).toBe(store.time);
    expect(dealOf(store, purchaseId).deletedAt).toBe(store.time);
    expect(audit()).toEqual([
      `purchase.cancel Sheep ${first}`,
      `purchase.cancel Sheep ${second}`,
      `purchase.cancel Expense ${expense.id}`,
      `purchase.cancel Purchase ${purchaseId}`,
    ]);
    // The Tags of the Deleted Sheep are free again.
    await buySheep(ctx, { sheep: [row({ tag: "B-1" })], date: "2026-10-12", price: 100, flockId });
  });

  test("a Purchase is not cancelled if one of its Sheep is a parent", async () => {
    const { store, ctx, row, register } = await setup();
    const purchaseId = await buySheep(ctx, {
      sheep: [row(), row({ sex: "ewe", birthDate: "2024-01-01" })],
      date: "2026-01-10",
      price: 100,
      flockId: null,
    });
    const [, mother] = dealOf(store, purchaseId).sheepIds;
    await register({ initialEntry: false, birthDate: "2026-05-01", motherId: mother! });
    const before = snapshot(store);

    await expect(cancelDeal(ctx, { dealId: purchaseId })).rejects.toThrow("sheep.isParent");
    expect(snapshot(store)).toEqual(before);
  });

  test("a Purchase is not cancelled if a Sale sold one of its Sheep", async () => {
    const { store, ctx, row } = await setup();
    const purchaseId = await buySheep(ctx, {
      sheep: [row(), row()],
      date: "2026-10-01",
      price: 100,
      flockId: null,
    });
    const [, sold] = dealOf(store, purchaseId).sheepIds;
    const saleId = await sellSheep(ctx, { sheepIds: [sold!], date: "2026-10-15", price: 100 });

    await expect(cancelDeal(ctx, { dealId: purchaseId })).rejects.toThrow("deal.sheepSold");

    await cancelDeal(ctx, { dealId: saleId });
    await cancelDeal(ctx, { dealId: purchaseId });
  });

  test("a deal is cancelled one time", async () => {
    const { ctx, register } = await setup();
    const saleId = await sellSheep(ctx, {
      sheepIds: [await register()],
      date: "2026-10-15",
      price: 100,
    });
    await cancelDeal(ctx, { dealId: saleId });

    await expect(cancelDeal(ctx, { dealId: saleId })).rejects.toThrow("deal.notFound");
  });

  test("a deal of another Farm is not found", async () => {
    const { store, ctx, register } = await setup();
    const saleId = await sellSheep(ctx, {
      sheepIds: [await register()],
      date: "2026-10-15",
      price: 100,
    });
    const operator = store.addUser("operator2", { operator: true });
    const { farmId: otherFarm } = await createFarm(operator, { name: "Другая", ...settings });
    const other = store.addMember("other", otherFarm, "admin");
    const otherCtx = await store.farmContext(other, otherFarm);

    await expect(cancelDeal(otherCtx, { dealId: saleId })).rejects.toThrow("deal.notFound");
    expect(await getDeal(otherCtx, { dealId: saleId })).toBeNull();
  });
});

describe("the Sheep of a deal", () => {
  test("a Sold Sheep and a Bought Sheep are not deleted alone: the deal is cancelled", async () => {
    const { ctx, register, row } = await setup();
    const sold = await register();
    await sellSheep(ctx, { sheepIds: [sold], date: "2026-10-15", price: 100 });
    const purchaseId = await buySheep(ctx, {
      sheep: [row()],
      date: "2026-10-12",
      price: 100,
      flockId: null,
    });
    const [bought] = (await getDeal(ctx, { dealId: purchaseId }))!.sheep;

    await expect(deleteSheep(ctx, { sheepId: sold })).rejects.toThrow("sheep.inDeal");
    await expect(deleteSheep(ctx, { sheepId: bought!.id })).rejects.toThrow("sheep.inDeal");
  });

  test("a Bought Sheep does not move or change its Owner before the day of its Purchase", async () => {
    const { ctx, row, flock, adminId } = await setup();
    const flockId = await flock();
    const purchaseId = await buySheep(ctx, {
      sheep: [row()],
      date: "2026-10-12",
      price: 100,
      flockId: null,
    });
    const [sheep] = (await getDeal(ctx, { dealId: purchaseId }))!.sheep;

    await expect(
      moveSheep(ctx, { sheepIds: [sheep!.id], flockId, date: "2026-10-11" }),
    ).rejects.toThrow("sheep.moveDateInvalid");
    await expect(
      changeSheepOwner(ctx, { sheepId: sheep!.id, ownerId: adminId, date: "2026-10-11" }),
    ).rejects.toThrow("sheep.ownerChangeDateInvalid");
  });
});

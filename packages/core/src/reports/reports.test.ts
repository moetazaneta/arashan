import { describe, expect, test } from "vite-plus/test";

import type { CommandContext } from "../context";
import { sellSheep } from "../deals/commands";
import { createFarm } from "../farms/commands";
import {
  archiveFlock,
  archiveLocation,
  createFlock,
  createLocation,
  moveSheep,
} from "../flocks/commands";
import type { MembershipId, MoneyCategoryId } from "../ids";
import { removeMember } from "../members/manage";
import {
  archiveMoneyCategory,
  createMoneyCategory,
  createMoneyRecord,
  deleteMoneyRecord,
} from "../money/commands";
import type { CategoryKey, MoneyKind } from "../money/money";
import { cancelResourceEvent, createResource, recordRestock } from "../resources/commands";
import { quantityScale } from "../resources/resource";
import { deleteSheep, registerExternalSheep, registerSheep } from "../sheep/commands";
import { changeSheepStatus } from "../sheep/lifecycle";
import type { Sex } from "../sheep/sheep";
import { InMemoryStore } from "../testing/in-memory";
import { getHeadCountReport, getMoneyReport, sheepGroup } from "./reports";

const settings = { currency: "KGS", timeZone: "Asia/Bishkek", lambAgeMonths: 4 };

/** A Farm with an Admin and an Editor. Today is 2026-10-18 in the Farm. */
async function setup() {
  const store = new InMemoryStore();
  const operator = store.addUser("operator", { operator: true });
  const { farmId } = await createFarm(operator, { name: "Арашан", ...settings });
  const admin = store.addMember("admin", farmId, "admin");
  const editor = store.addMember("editor", farmId, "editor");
  const as = (user: CommandContext) => store.farmContext(user, farmId);
  const membershipOf = (username: string): MembershipId => {
    const user = store.users.find((one) => one.username === username)!;
    return store.memberships.find((m) => m.userId === user.id && m.farmId === farmId)!.id;
  };
  return { store, farmId, admin, editor, as, membershipOf, ctx: await as(editor) };
}

describe("sheepGroup", () => {
  test("is Lamb for a Sheep younger than the lamb age, else its sex", () => {
    expect(sheepGroup({ sex: "ram", birthDate: "2026-08-01" }, 4, "2026-10-18")).toBe("lamb");
    expect(sheepGroup({ sex: "ewe", birthDate: "2026-08-01" }, 4, "2026-12-01")).toBe("ewe");
    expect(sheepGroup({ sex: "ram", birthDate: null }, 4, "2026-10-18")).toBe("ram");
  });
});

describe("getHeadCountReport", () => {
  /**
   * Two Flocks (one at a Location), an Archived Flock and an Archived Location, and Sheep of each
   * kind: on the Farm, Dead (of a Member who was removed later), Lost, Deleted and External.
   */
  async function farmWithSheep() {
    const { store, farmId, admin, as, membershipOf, ctx } = await setup();
    store.addMember("bakyt", farmId, "editor");
    const summer = await createLocation(ctx, { name: "Летник", notes: null });
    const pasture = await createLocation(ctx, { name: "Пастбище", notes: null });
    const winter = await createLocation(ctx, { name: "Зимник", notes: null });
    await archiveLocation(ctx, { locationId: winter });
    const north = await createFlock(ctx, { name: "Северная", locationId: summer });
    const south = await createFlock(ctx, { name: "Южная", locationId: null });
    const old = await createFlock(ctx, { name: "Старая", locationId: null });
    await archiveFlock(ctx, { flockId: old, date: "2026-10-01" });
    const register = (sex: Sex, birthDate: string | null, ownerName = "editor") =>
      registerSheep(ctx, {
        tag: null,
        name: null,
        sex,
        birthDate,
        notes: null,
        weight: null,
        ownerId: membershipOf(ownerName),
        origin: "born",
        initialEntry: birthDate === null,
      });
    const ram = await register("ram", null);
    const ewe = await register("ewe", "2025-03-01");
    const eweLamb = await register("ewe", "2026-08-01");
    await register("ram", "2026-09-01");
    await moveSheep(ctx, { sheepIds: [ram, eweLamb], flockId: north, date: "2026-10-10" });
    await moveSheep(ctx, { sheepIds: [ewe], flockId: south, date: "2026-10-10" });
    // Dead: a Sheep of Бакыт, who was removed after it.
    const dead = await register("ewe", null, "bakyt");
    await changeSheepStatus(ctx, {
      sheepIds: [dead],
      status: "dead",
      date: "2026-10-12",
      reason: null,
    });
    await removeMember(await as(admin), { membershipId: membershipOf("bakyt") });
    const lost = await register("ram", null);
    await changeSheepStatus(ctx, {
      sheepIds: [lost],
      status: "lost",
      date: "2026-10-12",
      reason: null,
    });
    const deleted = await register("ram", null);
    await deleteSheep(ctx, { sheepId: deleted });
    await registerExternalSheep(ctx, {
      tag: "X-1",
      name: null,
      sex: "ram",
      birthDate: null,
      notes: null,
    });
    return { store, ctx, farmId, membershipOf, north, south, summer, pasture };
  }

  test("counts the Sheep by Status, group, Owner, Flock and Location", async () => {
    const { ctx, membershipOf, north, south, summer, pasture } = await farmWithSheep();
    const report = await getHeadCountReport(ctx, { date: "2026-10-18" });

    expect(report.date).toBe("2026-10-18");
    expect(report.onFarm).toBe(4);
    // The Deleted Sheep and the External Sheep do not count.
    expect(report.byStatus).toEqual({ active: 4, sold: 0, slaughtered: 0, dead: 1, lost: 1 });
    expect(report.byGroup).toEqual({ ram: 1, ewe: 1, lamb: 2 });
    // The removed Member has no Sheep on the Farm, so no row; the Admin has a row with none.
    expect(report.byOwner).toEqual([
      { ref: { id: membershipOf("admin"), name: "admin", archived: false }, count: 0 },
      { ref: { id: membershipOf("editor"), name: "editor", archived: false }, count: 4 },
    ]);
    // The Archived Flock and Location are empty, so they have no row.
    expect(report.byFlock).toEqual([
      { ref: { id: north, name: "Северная", archived: false }, count: 2 },
      { ref: { id: south, name: "Южная", archived: false }, count: 1 },
      { ref: null, count: 1 },
    ]);
    expect(report.byLocation).toEqual([
      { ref: { id: summer, name: "Летник", archived: false }, count: 2 },
      { ref: { id: pasture, name: "Пастбище", archived: false }, count: 0 },
      { ref: null, count: 2 },
    ]);
  });

  test("puts a Lamb into the group of its sex on a date when it is older than the lamb age", async () => {
    const { ctx } = await farmWithSheep();
    const report = await getHeadCountReport(ctx, { date: "2027-01-15" });
    expect(report.byGroup).toEqual({ ram: 2, ewe: 2, lamb: 0 });
  });

  test("counts an Archived Flock and an Archived Member that still have Sheep", async () => {
    const { store, ctx, farmId, north } = await farmWithSheep();
    // The data of an older version of the app: the rules now keep both from being Archived.
    store.flocks.find((flock) => flock.id === north)!.archivedAt = 1;
    store.memberships.find((m) => m.farmId === farmId && m.role === "editor")!.archivedAt = 1;
    const report = await getHeadCountReport(ctx, { date: "2026-10-18" });
    expect(report.byFlock[0]).toEqual({
      ref: { id: north, name: "Северная", archived: true },
      count: 2,
    });
    expect(report.byOwner.find((row) => row.ref?.name === "editor")).toMatchObject({
      ref: { archived: true },
      count: 4,
    });
  });

  test("refuses a date that is not a real date", async () => {
    const { ctx } = await setup();
    await expect(getHeadCountReport(ctx, { date: "2026-02-30" })).rejects.toMatchObject({
      code: "report.dateInvalid",
    });
  });
});

describe("getMoneyReport", () => {
  /** The Expenses and the Incomes of 2025 and 2026, Automatic ones too. */
  async function farmWithMoney() {
    const { store, farmId, ctx, membershipOf } = await setup();
    const category = (kind: MoneyKind, key: CategoryKey): MoneyCategoryId =>
      store.moneyCategories.find((c) => c.farmId === farmId && c.kind === kind && c.key === key)!
        .id;
    const record = (kind: MoneyKind, categoryId: MoneyCategoryId, date: string, amount: number) =>
      createMoneyRecord(ctx, {
        kind,
        date,
        amount,
        categoryId,
        scope: { kind: "farm" },
        shepherdId: null,
        notes: null,
      });
    const shearing = category("expense", "shearing");
    await record("expense", shearing, "2025-12-31", 20_000);
    await record("expense", shearing, "2026-03-01", 100_000);
    await record("expense", shearing, "2026-06-01", 5_050);
    await record("expense", category("expense", "treatment"), "2026-05-01", 50_000);
    const deleted = await record("expense", category("expense", "treatment"), "2026-05-02", 9_999);
    await deleteMoneyRecord(ctx, { recordId: deleted });
    // A category of the Member, Archived after its record.
    const feed = await createMoneyCategory(ctx, { kind: "expense", name: "Корм" });
    await record("expense", feed, "2026-04-01", 30_000);
    await archiveMoneyCategory(ctx, { categoryId: feed });
    await record("income", category("income", "wool"), "2026-07-01", 200_000);
    // A Sale of a Sheep: its Automatic Income.
    const sold = await registerSheep(ctx, {
      tag: null,
      name: null,
      sex: "ram",
      birthDate: null,
      notes: null,
      weight: null,
      ownerId: membershipOf("editor"),
      origin: "born",
      initialEntry: true,
    });
    await sellSheep(ctx, { sheepIds: [sold], date: "2026-09-01", price: 500_000 });
    // A Restock of hay with a price, and a cancelled one: its Expense is Deleted.
    const hay = await createResource(ctx, { name: "Сено", unit: "кг" });
    await recordRestock(ctx, {
      resourceId: hay,
      date: "2026-08-01",
      quantity: 500 * quantityScale,
      price: 70_000,
    });
    const cancelled = await recordRestock(ctx, {
      resourceId: hay,
      date: "2026-08-02",
      quantity: 100 * quantityScale,
      price: 12_000,
    });
    await cancelResourceEvent(ctx, { eventId: cancelled });
    return { ctx, category, feed };
  }

  test("gives the Incomes minus the Expenses of the period, by category, with Automatic records", async () => {
    const { ctx, category, feed } = await farmWithMoney();
    const report = await getMoneyReport(ctx, { from: "2026-01-01", to: "2026-12-31" });

    expect(report.currency).toBe("KGS");
    expect(report.period).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(report.income.total).toBe(700_000);
    expect(report.expense.total).toBe(255_050);
    expect(report.balance).toBe(444_950);
    // The largest total first. The Deleted record does not count; the Archived category does.
    expect(
      report.income.categories.map(({ category, total, count }) => [category.id, total, count]),
    ).toEqual([
      [category("income", "sheepSale"), 500_000, 1],
      [category("income", "wool"), 200_000, 1],
    ]);
    expect(
      report.expense.categories.map(({ category, total, count }) => [category.id, total, count]),
    ).toEqual([
      [category("expense", "shearing"), 105_050, 2],
      [category("expense", "restock"), 70_000, 1],
      [category("expense", "treatment"), 50_000, 1],
      [feed, 30_000, 1],
    ]);
    expect(report.income.categories[0]?.category).toMatchObject({ key: "sheepSale", system: true });
    expect(report.expense.categories[3]?.category).toMatchObject({
      name: "Корм",
      archived: true,
    });
  });

  test("counts all the records with no limits, and none in a period without records", async () => {
    const { ctx } = await farmWithMoney();
    const all = await getMoneyReport(ctx, { from: null, to: null });
    expect(all.expense.total).toBe(275_050);
    expect(all.balance).toBe(424_950);

    const empty = await getMoneyReport(ctx, { from: "2024-01-01", to: "2024-12-31" });
    expect(empty).toMatchObject({
      income: { total: 0, categories: [] },
      expense: { total: 0, categories: [] },
      balance: 0,
    });
  });

  test("gives a negative balance when the Farm paid more than it got", async () => {
    const { ctx } = await farmWithMoney();
    const report = await getMoneyReport(ctx, { from: "2026-03-01", to: "2026-06-30" });
    expect(report.income.total).toBe(0);
    expect(report.balance).toBe(-185_050);
  });

  test("refuses a period that ends before it starts or has a date that is not real", async () => {
    const { ctx } = await setup();
    for (const period of [
      { from: "2026-12-01", to: "2026-01-01" },
      { from: "2026-13-01", to: null },
    ]) {
      await expect(getMoneyReport(ctx, period)).rejects.toMatchObject({
        code: "money.periodInvalid",
      });
    }
  });
});

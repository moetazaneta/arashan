import { describe, expect, test } from "vite-plus/test";

import type { CommandContext } from "../context";
import { createFarm } from "../farms/commands";
import { archiveFlock, createFlock } from "../flocks/commands";
import type { FlockId, ResourceEventId, ResourceId } from "../ids";
import { updateMoneyRecord } from "../money/commands";
import { listMoneyRecords } from "../money/queries";
import { InMemoryStore } from "../testing/in-memory";
import {
  adjustResource,
  archiveResource,
  cancelResourceEvent,
  createResource,
  restockResource,
  unarchiveResource,
  updateResource,
  useResource,
} from "./commands";
import { getResource, listResources } from "./queries";
import { stockOf, stockOn } from "./resource";

const settings = { currency: "KGS", timeZone: "Asia/Bishkek", lambAgeMonths: 4 };

/**
 * A Farm with an Admin and an Editor, a Flock and the Resource «Сено» in kg. The time is 2026-10-18
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
  const flockId: FlockId = await createFlock(ctx, { name: "Северная", locationId: null });
  const hay: ResourceId = await createResource(ctx, { name: "Сено", unit: "кг" });
  /** The Stock of the hay, as the list of Resources shows it. */
  const stock = async () => (await listResources(ctx)).find((r) => r.id === hay)!.stock;
  const restock = (quantity: number, price: number | null = null, date = "2026-10-01") =>
    restockResource(ctx, { resourceId: hay, date, quantity, price });
  const use = (quantity: number, date = "2026-10-02") =>
    useResource(ctx, { resourceId: hay, date, quantity, flockId });
  return { store, farmId, admin, editor, as, ctx, flockId, hay, stock, restock, use };
}

/** The code of the domain error that a call failed with. */
async function errorOf(call: Promise<unknown>): Promise<unknown> {
  return call.then(
    () => null,
    (error: unknown) => (error as { code?: string }).code ?? error,
  );
}

describe("the Stock", () => {
  test("is the sum of the Restocks, minus the Usages, plus or minus the Adjustments", () => {
    expect(
      stockOf([
        { kind: "restock", quantity: 1_000_500 },
        { kind: "usage", quantity: 250_250 },
        { kind: "adjustment", quantity: -50_000 },
        { kind: "restock", quantity: 300 },
        { kind: "adjustment", quantity: 1_000 },
      ]),
    ).toBe(701_550);
    expect(stockOf([])).toBe(0);
  });

  test("at the end of a date counts the events of that day and before it", () => {
    const events = [
      { kind: "restock", quantity: 10_000, date: "2026-10-01" },
      { kind: "usage", quantity: 3_000, date: "2026-10-05" },
      { kind: "usage", quantity: 2_000, date: "2026-10-06" },
    ] as const;
    expect(stockOn(events, "2026-09-30")).toBe(0);
    expect(stockOn(events, "2026-10-05")).toBe(7_000);
    expect(stockOn(events, "2026-10-31")).toBe(5_000);
  });

  test("follows each event, with decimals and no rounding error", async () => {
    const { stock, restock, use, ctx, hay } = await setup();
    expect(await stock()).toBe(0);

    // 0,1 kg ten times is exactly 1 kg, unlike 0.1 + 0.1 + … in floating point.
    for (let i = 0; i < 10; i++) await restock(100);
    expect(await stock()).toBe(1_000);
    await restock(250_750);
    await use(100_250);
    expect(await stock()).toBe(151_500);

    const card = await getResource(ctx, { resourceId: hay });
    expect(card!.stock).toBe(151_500);
    expect(card!.events).toHaveLength(12);
  });

  test("can go below 0 when a Usage comes before its Restock is recorded", async () => {
    const { stock, use } = await setup();
    await use(5_000);
    expect(await stock()).toBe(-5_000);
  });

  test("changes back when a Member cancels an event", async () => {
    const { ctx, stock, restock, use } = await setup();
    await restock(10_000);
    const usage = await use(4_000);
    expect(await stock()).toBe(6_000);

    await cancelResourceEvent(ctx, { eventId: usage });
    expect(await stock()).toBe(10_000);
    expect(await errorOf(cancelResourceEvent(ctx, { eventId: usage }))).toBe(
      "resource.eventNotFound",
    );
  });
});

describe("an Adjustment", () => {
  test("keeps the difference between the count and the Stock on its date", async () => {
    const { ctx, hay, stock, restock, use } = await setup();
    await restock(100_000, null, "2026-10-01");
    await use(20_000, "2026-10-10");
    await use(5_000, "2026-10-15");

    // On 2026-10-12 the Stock was 80 kg; the count found 70,5 kg: 9,5 kg rotted.
    await adjustResource(ctx, {
      resourceId: hay,
      date: "2026-10-12",
      counted: 70_500,
      reason: "  сено сгнило ",
    });
    expect(await stock()).toBe(65_500);

    const [, adjustment] = (await getResource(ctx, { resourceId: hay }))!.events;
    expect(adjustment).toMatchObject({
      kind: "adjustment",
      change: -9_500,
      stockAfter: 70_500,
      reason: "сено сгнило",
    });
  });

  test("can add to the Stock when the count finds more", async () => {
    const { ctx, hay, stock, restock } = await setup();
    await restock(1_000);
    await adjustResource(ctx, {
      resourceId: hay,
      date: "2026-10-18",
      counted: 1_250,
      reason: "пересчёт",
    });
    expect(await stock()).toBe(1_250);
  });

  test("needs a reason and a change", async () => {
    const { ctx, hay, restock } = await setup();
    await restock(1_000);
    const adjust = (counted: number, reason: string) =>
      errorOf(adjustResource(ctx, { resourceId: hay, date: "2026-10-18", counted, reason }));
    expect(await adjust(500, " ")).toBe("resource.reasonRequired");
    expect(await adjust(500, "x".repeat(201))).toBe("resource.reasonTooLong");
    expect(await adjust(1_000, "пересчёт")).toBe("resource.adjustmentNoChange");
    expect(await adjust(-1, "пересчёт")).toBe("resource.quantityInvalid");
    expect(await adjust(0, "всё съели")).toBeNull();
  });
});

describe("a Restock with a price", () => {
  test("makes an Automatic Expense of «Пополнение ресурса»", async () => {
    const { ctx, store, hay, restock } = await setup();
    const eventId = await restock(500_000, 1_250_050, "2026-10-03");

    const { records, total } = await listMoneyRecords(ctx, {
      kind: "expense",
      from: null,
      to: null,
      categoryId: null,
      scope: null,
    });
    expect(total).toBe(1_250_050);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      date: "2026-10-03",
      amount: 1_250_050,
      category: { key: "restock", system: true },
      scope: { kind: "farm" },
      source: { kind: "restock", id: eventId },
    });

    const [event] = (await getResource(ctx, { resourceId: hay }))!.events;
    expect(event!.expense).toEqual({ id: records[0]!.id, amount: 1_250_050 });
    expect(
      store.audit.filter((e) => e.command === "resource.restock").map((e) => e.target.kind),
    ).toEqual(["Expense", "ResourceEvent", "Resource"]);
  });

  test("shows the amount of its Expense after a Member changes it", async () => {
    const { ctx, hay, restock } = await setup();
    await restock(1_000, 50_000);
    const expense = (await getResource(ctx, { resourceId: hay }))!.events[0]!.expense!;
    const record = ctx.repos.moneyRecords.get(expense.id);
    const { date, categoryId, scope, shepherdId } = (await record)!;
    await updateMoneyRecord(ctx, {
      recordId: expense.id,
      date,
      amount: 45_000,
      categoryId,
      scope,
      shepherdId,
      notes: "скидка",
    });
    expect((await getResource(ctx, { resourceId: hay }))!.events[0]!.expense!.amount).toBe(45_000);
  });

  test("loses its Expense when a Member cancels it, and the Expense has no separate delete", async () => {
    const { ctx, store, restock } = await setup();
    const withPrice = await restock(1_000, 50_000);
    const harvest = await restock(2_000);
    expect(store.moneyRecords.filter((r) => r.source?.kind === "restock")).toHaveLength(1);

    await cancelResourceEvent(ctx, { eventId: harvest });
    await cancelResourceEvent(ctx, { eventId: withPrice });
    const [record] = store.moneyRecords;
    expect(record!.deletedAt).toBe(store.time);
    expect(
      store.audit.filter((e) => e.command === "resource.cancelEvent").map((e) => e.target.kind),
    ).toEqual(["ResourceEvent", "Resource", "Expense", "ResourceEvent", "Resource"]);
  });

  test("checks the price before it writes anything", async () => {
    const { store, restock } = await setup();
    expect(await errorOf(restock(1_000, 0))).toBe("money.amountInvalid");
    expect(await errorOf(restock(1_000, 10.5))).toBe("money.amountInvalid");
    expect(store.resourceEvents).toHaveLength(0);
  });

  test("of the Farm's own harvest has no price and no Expense", async () => {
    const { store, restock } = await setup();
    await restock(1_000);
    expect(store.moneyRecords).toHaveLength(0);
  });
});

describe("the events", () => {
  test("check the quantity and the date", async () => {
    const { restock, use } = await setup();
    expect(await errorOf(restock(0))).toBe("resource.quantityInvalid");
    expect(await errorOf(restock(1.5))).toBe("resource.quantityInvalid");
    expect(await errorOf(restock(1_000_000_001))).toBe("resource.quantityInvalid");
    expect(await errorOf(use(-1))).toBe("resource.quantityInvalid");
    expect(await errorOf(restock(1, null, "2026-10-19"))).toBe("resource.dateInFuture");
    expect(await errorOf(restock(1, null, "2026-02-30"))).toBe("resource.dateInvalid");
  });

  test("a Usage goes to a Flock that is not Archived, and its history shows it", async () => {
    const { ctx, store, hay, flockId, use } = await setup();
    await use(3_000);
    expect(
      store.audit.filter((e) => e.command === "resource.use").map((e) => e.target),
    ).toContainEqual({ kind: "Flock", id: flockId });

    const [usage] = (await getResource(ctx, { resourceId: hay }))!.events;
    expect(usage).toMatchObject({
      kind: "usage",
      change: -3_000,
      flock: { id: flockId, name: "Северная" },
    });

    const empty = await createFlock(ctx, { name: "Южная", locationId: null });
    await archiveFlock(ctx, { flockId: empty, date: "2026-10-18" });
    expect(
      await errorOf(
        useResource(ctx, { resourceId: hay, date: "2026-10-18", quantity: 1, flockId: empty }),
      ),
    ).toBe("flock.archived");
    expect(
      await errorOf(
        useResource(ctx, {
          resourceId: hay,
          date: "2026-10-18",
          quantity: 1,
          flockId: "flock-0" as FlockId,
        }),
      ),
    ).toBe("flock.notFound");
  });

  test("the card lists them the newest first, each with the Stock after it", async () => {
    const { ctx, hay, restock, use } = await setup();
    await use(1_000, "2026-10-05");
    await restock(10_000, null, "2026-10-01");
    await use(2_000, "2026-10-05");

    const card = await getResource(ctx, { resourceId: hay });
    expect(
      card!.events.map(({ date, change, stockAfter }) => ({ date, change, stockAfter })),
    ).toEqual([
      { date: "2026-10-05", change: -2_000, stockAfter: 7_000 },
      { date: "2026-10-05", change: -1_000, stockAfter: 9_000 },
      { date: "2026-10-01", change: 10_000, stockAfter: 10_000 },
    ]);
  });

  test("of another Farm are not found", async () => {
    const { store, restock } = await setup();
    const eventId = await restock(1_000);
    const operator = store.addUser("operator2", { operator: true });
    const { farmId } = await createFarm(operator, { name: "Другая", ...settings });
    const stranger = await store.farmContext(store.addMember("stranger", farmId, "admin"), farmId);
    expect(
      await errorOf(cancelResourceEvent(stranger, { eventId: eventId as ResourceEventId })),
    ).toBe("resource.eventNotFound");
  });
});

describe("a Resource", () => {
  test("has a unique name and a unit", async () => {
    const { ctx, hay } = await setup();
    expect(await errorOf(createResource(ctx, { name: " сено ", unit: "тюк" }))).toBe(
      "resource.nameTaken",
    );
    expect(await errorOf(createResource(ctx, { name: " ", unit: "кг" }))).toBe(
      "resource.nameRequired",
    );
    expect(await errorOf(createResource(ctx, { name: "Зерно", unit: "" }))).toBe(
      "resource.unitRequired",
    );
    expect(await errorOf(createResource(ctx, { name: "Зерно", unit: "x".repeat(21) }))).toBe(
      "resource.unitTooLong",
    );
    await updateResource(ctx, { resourceId: hay, name: "Сено  луговое", unit: "тюк" });
    expect((await listResources(ctx))[0]).toMatchObject({ name: "Сено луговое", unit: "тюк" });
  });

  test("keeps its unit once it has an event", async () => {
    const { ctx, hay, restock } = await setup();
    await restock(1_000);
    expect(await errorOf(updateResource(ctx, { resourceId: hay, name: "Сено", unit: "тюк" }))).toBe(
      "resource.unitLocked",
    );
    await updateResource(ctx, { resourceId: hay, name: "Сено луговое", unit: "кг" });
  });

  test("gets no new events while it is Archived, and stays in the list", async () => {
    const { ctx, store, hay, restock } = await setup();
    const eventId = await restock(1_000);
    await archiveResource(ctx, { resourceId: hay });
    expect(await errorOf(restock(1_000))).toBe("resource.archived");
    expect((await listResources(ctx))[0]).toMatchObject({ archived: true, stock: 1_000 });

    await cancelResourceEvent(ctx, { eventId });
    await unarchiveResource(ctx, { resourceId: hay });
    await restock(500);
    expect(store.audit.filter((e) => e.target.id === hay).map((e) => e.command)).toEqual([
      "resource.create",
      "resource.restock",
      "resource.archive",
      "resource.cancelEvent",
      "resource.unarchive",
      "resource.restock",
    ]);
  });

  test("a command that changes nothing writes nothing", async () => {
    const { ctx, store, hay } = await setup();
    const before = store.audit.length;
    await updateResource(ctx, { resourceId: hay, name: "Сено", unit: "кг" });
    await unarchiveResource(ctx, { resourceId: hay });
    expect(store.audit).toHaveLength(before);
  });
});

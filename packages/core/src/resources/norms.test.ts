import { describe, expect, test } from "vite-plus/test";

import { createFarm } from "../farms/commands";
import { createFlock, moveSheep } from "../flocks/commands";
import type { FlockId, ResourceId } from "../ids";
import { registerSheep, type SheepRegistration } from "../sheep/commands";
import { InMemoryStore } from "../testing/in-memory";
import {
  archiveResource,
  createResource,
  recordRestock,
  recordUsage,
  setResourceNorms,
} from "./commands";
import { daysOfStock, groupCounts, usageDays } from "./norms";
import { getResource, getStockForecast, suggestUsage } from "./queries";
import { maxQuantity } from "./resource";

const norms = { ram: 3000, ewe: 2000, lamb: 500 };
const date = "2026-10-18";

async function setup() {
  const store = new InMemoryStore();
  const operator = store.addUser("operator", { operator: true });
  const { farmId } = await createFarm(operator, {
    name: "Арашан",
    currency: "KGS",
    timeZone: "Asia/Bishkek",
    lambAgeMonths: 4,
  });
  const editor = store.addMember("editor", farmId, "editor");
  const ctx = await store.farmContext(editor, farmId);
  const flockId = await createFlock(ctx, { name: "Северная", locationId: null });
  const resourceId = await createResource(ctx, { name: "Сено", unit: "кг" });
  const add = async (fields: Partial<SheepRegistration> = {}, flock = flockId) => {
    const sheepId = await registerSheep(ctx, {
      tag: null,
      name: null,
      sex: "ram",
      birthDate: null,
      notes: null,
      weight: null,
      origin: "born",
      initialEntry: true,
      ownerId: ctx.member.membershipId,
      ...fields,
    });
    await moveSheep(ctx, { sheepIds: [sheepId], flockId: flock, date });
    return sheepId;
  };
  const suggestion = (on = date) => suggestUsage(ctx, { resourceId, flockId, date: on });
  const use = (on: string, flock = flockId, resource = resourceId) =>
    recordUsage(ctx, {
      resourceId: resource,
      flockId: flock,
      date: on,
      quantity: 1000,
    });
  return { store, ctx, flockId, resourceId, add, suggestion, use };
}

describe("the Usage suggestion", () => {
  test("suggests 280.5 kg for 2 Rams, 40 Ewes and 15 Lambs for 3 days", async () => {
    const { ctx, resourceId, add, use, suggestion } = await setup();
    await setResourceNorms(ctx, { resourceId, norms });
    for (let i = 0; i < 2; i++) await add();
    for (let i = 0; i < 40; i++) await add({ sex: "ewe" });
    for (let i = 0; i < 15; i++) await add({ birthDate: "2026-09-01" });
    await use("2026-10-15");
    expect(await suggestion()).toEqual({
      norms,
      counts: { ram: 2, ewe: 40, lamb: 15 },
      perDay: 93500,
      days: 3,
      quantity: 280500,
      lastUsage: "2026-10-15",
    });
  });

  test("starts with one day, ignores other Flocks, Resources and later Usages", async () => {
    const { ctx, flockId, resourceId, use, suggestion } = await setup();
    const otherFlock = await createFlock(ctx, { name: "Южная", locationId: null });
    const otherResource = await createResource(ctx, { name: "Зерно", unit: "кг" });
    expect(await suggestion()).toMatchObject({ days: 1, lastUsage: null });
    await use("2026-10-10", otherFlock);
    await use("2026-10-10", flockId, otherResource);
    await use("2026-10-17");
    expect(await suggestion("2026-10-15")).toMatchObject({ days: 1, lastUsage: null });
    await use("2026-10-12");
    expect(await suggestion("2026-10-15")).toMatchObject({ days: 3, lastUsage: "2026-10-12" });
    await use(date);
    expect(await suggestion()).toMatchObject({ days: 0, quantity: 0, lastUsage: date });
    expect(
      await suggestUsage(ctx, { resourceId: "missing" as ResourceId, flockId, date }),
    ).toBeNull();
    expect(await suggestUsage(ctx, { resourceId, flockId: "missing" as FlockId, date })).toBeNull();
  });

  test("counts a male Lamb as a Lamb until the lamb age, and excludes Sheep off the Farm", async () => {
    const { ctx, resourceId, store, add, suggestion } = await setup();
    await setResourceNorms(ctx, { resourceId, norms });
    await add({ birthDate: "2026-06-18" });
    const sold = await add();
    const external = await add();
    store.sheep.find((sheep) => sheep.id === sold)!.status = "sold";
    store.sheep.find((sheep) => sheep.id === external)!.origin = "external";
    expect(await suggestion("2026-10-17")).toMatchObject({
      counts: { ram: 0, ewe: 0, lamb: 1 },
      quantity: 500,
    });
    expect(await suggestion()).toMatchObject({
      counts: { ram: 1, ewe: 0, lamb: 0 },
      quantity: 3000,
    });
    expect(groupCounts([{ sex: "ewe", birthDate: null }], 4, date)).toEqual({
      ram: 0,
      ewe: 1,
      lamb: 0,
    });
  });

  test("rejects an invalid calendar date in both queries", async () => {
    const { ctx, suggestion } = await setup();
    await expect(suggestion("2026-02-30")).rejects.toMatchObject({ code: "resource.dateInvalid" });
    await expect(getStockForecast(ctx, { date: "invalid" })).rejects.toMatchObject({
      code: "resource.dateInvalid",
    });
    expect(usageDays(["2026-10-20", "2026-10-10", "2026-10-15"], date)).toBe(3);
  });
});

describe("the Stock forecast", () => {
  test("sums the needs of two Flocks and floors the days, also for each Flock alone", async () => {
    const { ctx, resourceId, flockId, add } = await setup();
    const otherFlock = await createFlock(ctx, { name: "Южная", locationId: null });
    await setResourceNorms(ctx, { resourceId, norms });
    await add();
    await add({ sex: "ewe" }, otherFlock);
    await recordRestock(ctx, { resourceId, date, quantity: 26000, price: null });
    expect(await getStockForecast(ctx, { date })).toEqual([
      {
        resourceId,
        stock: 26000,
        dailyNeed: 5000,
        days: 5,
        flocks: [
          {
            flock: { id: flockId, name: "Северная", archived: false },
            counts: { ram: 1, ewe: 0, lamb: 0 },
            dailyNeed: 3000,
            days: 8,
          },
          {
            flock: { id: otherFlock, name: "Южная", archived: false },
            counts: { ram: 0, ewe: 1, lamb: 0 },
            dailyNeed: 2000,
            days: 13,
          },
        ],
      },
    ]);
  });

  test("omits Archived Resources and Flocks and empty Flocks", async () => {
    const { ctx, store, resourceId, flockId, add } = await setup();
    await setResourceNorms(ctx, { resourceId, norms });
    await add();
    await createFlock(ctx, { name: "Пустая", locationId: null });
    const other = await createResource(ctx, { name: "Зерно", unit: "кг" });
    await archiveResource(ctx, { resourceId: other });
    expect((await getStockForecast(ctx, { date }))[0]).toMatchObject({ dailyNeed: 3000, days: 0 });
    expect((await getStockForecast(ctx, { date }))[0]!.flocks).toHaveLength(1);
    store.flocks.find((flock) => flock.id === flockId)!.archivedAt = store.time;
    expect(await getStockForecast(ctx, { date })).toEqual([
      { resourceId, stock: 0, dailyNeed: 0, days: null, flocks: [] },
    ]);
  });

  test("has no days without Norms and zero days with no Stock", async () => {
    const { ctx, add } = await setup();
    await add();
    expect((await getStockForecast(ctx, { date }))[0]).toMatchObject({
      days: null,
      flocks: [{ days: null }],
    });
    expect(daysOfStock(0, 1000)).toBe(0);
    expect(daysOfStock(-1000, 1000)).toBe(0);
    expect(daysOfStock(1000, 0)).toBeNull();
  });
});

describe("setting Norms", () => {
  test("an Editor writes the Norms and an audit entry, keeps the Stock, and can make no change", async () => {
    const { ctx, store, resourceId } = await setup();
    await recordRestock(ctx, { resourceId, date, quantity: 10000, price: null });
    const before = store.audit.length;
    await setResourceNorms(ctx, { resourceId, norms });
    expect(await getResource(ctx, { resourceId })).toMatchObject({ norms, stock: 10000 });
    expect(store.audit.slice(before)).toMatchObject([
      { command: "resource.setNorms", target: { kind: "Resource", id: resourceId } },
    ]);
    await setResourceNorms(ctx, { resourceId, norms });
    expect(store.audit).toHaveLength(before + 1);
  });

  test.each([
    -1,
    0.5,
    maxQuantity + 1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects the Norm %s without writing", async (ram) => {
    const { ctx, store, resourceId } = await setup();
    const before = store.audit.length;
    await expect(
      setResourceNorms(ctx, { resourceId, norms: { ...norms, ram } }),
    ).rejects.toMatchObject({ code: "resource.normInvalid" });
    expect(store.audit).toHaveLength(before);
    expect((await getResource(ctx, { resourceId }))!.norms).toEqual({ ram: 0, ewe: 0, lamb: 0 });
  });

  test("rejects an Archived or missing Resource", async () => {
    const { ctx, resourceId } = await setup();
    await archiveResource(ctx, { resourceId });
    await expect(setResourceNorms(ctx, { resourceId, norms })).rejects.toMatchObject({
      code: "resource.archived",
    });
    await expect(
      setResourceNorms(ctx, { resourceId: "missing" as ResourceId, norms }),
    ).rejects.toMatchObject({ code: "resource.notFound" });
  });
});

import { describe, expect, test } from "vite-plus/test";

import { createFarm } from "../farms/commands";
import { createFlock } from "../flocks/commands";
import type { SheepId } from "../ids";
import { registerSheep } from "../sheep/commands";
import { getSheep } from "../sheep/queries";
import { InMemoryStore } from "../testing/in-memory";
import { buySheep, cancelDeal, sellSheep } from "./commands";
import { dealSheepPreview, getDeal, listDeals } from "./queries";

const settings = { currency: "KGS", timeZone: "Asia/Bishkek", lambAgeMonths: 4 };

/** A Farm with an Editor, on 2026-10-18 in Bishkek. */
async function setup() {
  const store = new InMemoryStore();
  const operator = store.addUser("operator", { operator: true });
  const { farmId } = await createFarm(operator, { name: "Арашан", ...settings });
  const editor = store.addMember("editor", farmId, "editor");
  const editorId = store.memberships.at(-1)!.id;
  const ctx = await store.farmContext(editor, farmId);
  const register = (tag: string) =>
    registerSheep(ctx, {
      tag,
      name: null,
      sex: "ewe",
      birthDate: null,
      notes: null,
      weight: null,
      ownerId: editorId,
      origin: "born",
      initialEntry: true,
    });
  const row = (tag: string) => ({
    tag,
    name: null,
    sex: "ram" as const,
    birthDate: null,
    notes: null,
    ownerId: editorId,
  });
  return { store, ctx, editorId, register, row };
}

describe("listDeals", () => {
  test("the Sales and the Purchases, the newest first, with the price of the Automatic record", async () => {
    const { ctx, register, row } = await setup();
    const flockId = await createFlock(ctx, { name: "Стадо", locationId: null });
    const tags = Array.from({ length: dealSheepPreview + 2 }, (_, i) => `A-${i + 1}`);
    const sheepIds: SheepId[] = [];
    for (const tag of tags) sheepIds.push(await register(tag));
    const saleId = await sellSheep(ctx, { sheepIds, date: "2026-10-15", price: 3_000_000 });
    const purchaseId = await buySheep(ctx, {
      sheep: [row("B-1")],
      date: "2026-10-10",
      price: 500_000,
      flockId,
    });
    const cancelled = await sellSheep(ctx, {
      sheepIds: [await register("C-1")],
      date: "2026-10-16",
      price: 100,
    });
    await cancelDeal(ctx, { dealId: cancelled });

    const deals = await listDeals(ctx, { kind: null });

    expect(deals.map((deal) => [deal.id, deal.kind, deal.date, deal.price])).toEqual([
      [saleId, "sale", "2026-10-15", 3_000_000],
      [purchaseId, "purchase", "2026-10-10", 500_000],
    ]);
    expect(deals[0]).toMatchObject({ sheepCount: tags.length, flock: null });
    expect(deals[0]!.sheep.map((sheep) => sheep.tag)).toEqual(tags.slice(0, dealSheepPreview));
    expect(deals[0]!.recordId).not.toBeNull();
    expect(deals[1]).toMatchObject({ sheepCount: 1, flock: { id: flockId, name: "Стадо" } });
    expect((await listDeals(ctx, { kind: "purchase" })).map((deal) => deal.id)).toEqual([
      purchaseId,
    ]);
  });
});

describe("getDeal", () => {
  test("the card of a deal shows all its Sheep with their Status and Owner", async () => {
    const { ctx, register, editorId } = await setup();
    const sheepId = await register("A-1");
    const saleId = await sellSheep(ctx, { sheepIds: [sheepId], date: "2026-10-15", price: 100 });

    const card = await getDeal(ctx, { dealId: saleId });

    expect(card).toMatchObject({ id: saleId, kind: "sale", price: 100, sheepCount: 1 });
    expect(card!.sheep).toEqual([
      {
        id: sheepId,
        tag: "A-1",
        name: null,
        sex: "ewe",
        origin: "born",
        status: "sold",
        owner: { id: editorId, name: "editor" },
      },
    ]);
  });

  test("the card of a Sheep links to its Sale and to its Purchase", async () => {
    const { ctx, row } = await setup();
    const purchaseId = await buySheep(ctx, {
      sheep: [row("B-1")],
      date: "2026-10-10",
      price: 100,
      flockId: null,
    });
    const [bought] = (await getDeal(ctx, { dealId: purchaseId }))!.sheep;
    const saleId = await sellSheep(ctx, { sheepIds: [bought!.id], date: "2026-10-15", price: 100 });

    const card = await getSheep(ctx, { sheepId: bought!.id });

    expect(card!.purchaseId).toBe(purchaseId);
    expect(card!.statusChanges).toMatchObject([{ to: "sold", saleId }]);
  });
});

import { describe, expect, test } from "vite-plus/test";

import { addBreed, deleteBreed, renameBreed } from "../breeds/commands";
import { arashanBreedId } from "../breeds/breed";
import type { CommandContext, FarmCommandContext } from "../context";
import { buySheep, cancelDeal, sellSheep } from "../deals/commands";
import { createFarm } from "../farms/commands";
import {
  archiveFlock,
  assignShepherd,
  createFlock,
  createShepherd,
  moveSheep,
  removeShepherdAssignment,
} from "../flocks/commands";
import type { FarmId, SheepId } from "../ids";
import { removeMember } from "../members/manage";
import {
  createMoneyCategory,
  createMoneyRecord,
  deleteMoneyCategory,
  deleteMoneyRecord,
} from "../money/commands";
import { wholeShare } from "../pedigree/composition";
import {
  archiveResource,
  cancelResourceEvent,
  createResource,
  recordRestock,
  recordUsage,
  updateResource,
} from "../resources/commands";
import { deleteSheep, registerSheep, type SheepRegistration, updateSheep } from "../sheep/commands";
import { changeSheepStatus } from "../sheep/lifecycle";
import { InMemoryStore } from "../testing/in-memory";
import { restoreFromTrash } from "./commands";
import { listTrash } from "./queries";
import type { TrashKind } from "./registry";

const settings = { currency: "KGS", timeZone: "Asia/Bishkek", lambAgeMonths: 4 };

/**
 * A Farm with an Admin and an Editor. The time is 2026-10-18 18:00 in Bishkek, the time zone of the
 * Farm, so today is 2026-10-18. `ctx` is the context of the Editor; `later` moves the clock one
 * minute forward, so that the records become Deleted in a known order.
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
  const flock = (name = "Стадо") => createFlock(ctx, { name, locationId: null });
  const later = () => {
    store.time += 60_000;
  };
  const restore = (kind: TrashKind, id: string) => restoreFromTrash(ctx, { kind, id });
  const trash = () => listTrash(ctx);
  return {
    store,
    farmId,
    admin,
    adminId,
    editorId,
    as,
    ctx,
    register,
    flock,
    later,
    restore,
    trash,
  };
}

/** The id of the category of the app with the key. */
const categoryId = (store: InMemoryStore, kind: "expense" | "income", key: string) =>
  store.moneyCategories.find((c) => c.kind === kind && c.key === key)!.id;

/** A manual Expense of «Стрижка» of the Farm, or of the scope that `change` gives. */
const expense = (
  ctx: FarmCommandContext,
  store: InMemoryStore,
  change: Partial<Parameters<typeof createMoneyRecord>[1]> = {},
) =>
  createMoneyRecord(ctx, {
    kind: "expense",
    date: "2026-10-10",
    amount: 50_000,
    categoryId: categoryId(store, "expense", "shearing"),
    scope: { kind: "farm" },
    shepherdId: null,
    notes: null,
    ...change,
  });

/** The audit entries that the store gets after this call, as "command kind". */
function auditFrom(store: InMemoryStore) {
  const start = store.audit.length;
  return () => store.audit.slice(start).map((e) => `${e.command} ${e.target.kind}`);
}

/** The records of the store as plain data, to show that a failed restore writes nothing. */
const snapshot = (store: InMemoryStore) => JSON.parse(JSON.stringify(store)) as unknown;

const sheepOf = (store: InMemoryStore, id: SheepId) => store.sheep.find((s) => s.id === id)!;

describe("listTrash", () => {
  test("lists the Deleted records of each kind, the one deleted last first", async () => {
    const { store, ctx, register, flock, later, trash } = await setup();
    const flockId = await flock();
    const lost = await register({ tag: "A-1", name: "Белка" });
    await deleteSheep(ctx, { sheepId: lost });
    later();
    const sold = [await register({ tag: "A-2" }), await register({ tag: "A-3" })];
    const saleId = await sellSheep(ctx, { sheepIds: sold, date: "2026-10-15", price: 3_000_000 });
    await cancelDeal(ctx, { dealId: saleId });
    later();
    const purchaseId = await buySheep(ctx, {
      sheep: [
        {
          tag: "B-1",
          name: null,
          sex: "ram",
          birthDate: null,
          notes: null,
          ownerId: ctx.member.membershipId,
        },
      ],
      date: "2026-10-16",
      price: 1_000_000,
      flockId,
    });
    await cancelDeal(ctx, { dealId: purchaseId });
    later();
    const recordId = await expense(ctx, store, { notes: "Стрижка весной" });
    await deleteMoneyRecord(ctx, { recordId });
    later();
    const resourceId = await createResource(ctx, { name: "Сено", unit: "тюк" });
    const restockId = await recordRestock(ctx, {
      resourceId,
      date: "2026-10-12",
      quantity: 10_000,
      price: 200_000,
    });
    await cancelResourceEvent(ctx, { eventId: restockId });
    later();
    const breedId = await addBreed(ctx, { name: "Гиссарская" });
    await deleteBreed(ctx, { breedId });
    later();
    const wool = await createMoneyCategory(ctx, { kind: "income", name: "Кожа" });
    await deleteMoneyCategory(ctx, { categoryId: wool });
    later();
    const shepherdId = await createShepherd(ctx, { name: "Асан", phone: null, notes: null });
    const assignmentId = await assignShepherd(ctx, {
      flockId,
      shepherdId,
      from: "2026-10-01",
      to: null,
    });
    await removeShepherdAssignment(ctx, { assignmentId });

    const items = await trash();

    // The Automatic records of the deals and of the Restock, and the Sheep of the Purchase, come
    // back with their event: they are not entries of their own.
    expect(items.map((item) => [item.kind, item.id])).toEqual([
      ["shepherdAssignment", assignmentId],
      ["moneyCategory", wool],
      ["breed", breedId],
      ["resourceEvent", restockId],
      ["moneyRecord", recordId],
      ["deal", purchaseId],
      ["deal", saleId],
      ["sheep", lost],
    ]);
    const records = Object.fromEntries(items.map((item) => [item.id, item.record]));
    expect(records[lost]).toEqual({
      id: lost,
      tag: "A-1",
      name: "Белка",
      sex: "ewe",
      origin: "born",
      status: "active",
    });
    expect(records[saleId]).toMatchObject({
      kind: "sale",
      date: "2026-10-15",
      price: 3_000_000,
      sheepCount: 2,
      sheep: [{ tag: "A-2" }, { tag: "A-3" }],
    });
    expect(records[purchaseId]).toMatchObject({
      kind: "purchase",
      price: 1_000_000,
      sheep: [{ tag: "B-1" }],
    });
    expect(records[recordId]).toMatchObject({
      kind: "expense",
      amount: 50_000,
      category: { key: "shearing" },
      notes: "Стрижка весной",
    });
    expect(records[restockId]).toMatchObject({
      kind: "restock",
      quantity: 10_000,
      resource: { name: "Сено", unit: "тюк" },
      flock: null,
    });
    expect(records[breedId]).toEqual({ name: "Гиссарская" });
    expect(records[wool]).toMatchObject({ kind: "income", name: "Кожа" });
    expect(records[assignmentId]).toMatchObject({
      flock: { id: flockId, name: "Стадо" },
      shepherd: { id: shepherdId, name: "Асан" },
      from: "2026-10-01",
      to: null,
    });
  });

  test("is empty for a Farm with no Deleted records", async () => {
    const { register, trash } = await setup();
    await register({ tag: "A-1" });

    expect(await trash()).toEqual([]);
  });
});

describe("restoreFromTrash", () => {
  test("a record that is not in the Trash, or of an unknown kind, is not found", async () => {
    const { ctx, register, restore } = await setup();
    const active = await register({ tag: "A-1" });
    const deleted = await register({ tag: "A-2" });
    await deleteSheep(ctx, { sheepId: deleted });

    await expect(restore("sheep", active)).rejects.toThrow("trash.notFound");
    await expect(restore("sheep", "no-such-id")).rejects.toThrow("trash.notFound");
    await expect(restore("deal", deleted)).rejects.toThrow("trash.notFound");
    await expect(restore("nothing" as TrashKind, deleted)).rejects.toThrow("trash.notFound");
    await restore("sheep", deleted);
    await expect(restore("sheep", deleted)).rejects.toThrow("trash.notFound");
  });

  test("a record of another Farm is not found", async () => {
    const { store, ctx, register, as } = await setup();
    const sheepId = await register({ tag: "A-1" });
    await deleteSheep(ctx, { sheepId });
    const operator = store.addUser("operator2", { operator: true });
    const other = await createFarm(operator, { name: "Другая", ...settings });
    const stranger = await as(store.addMember("stranger", other.farmId, "admin"), other.farmId);

    await expect(restoreFromTrash(stranger, { kind: "sheep", id: sheepId })).rejects.toThrow(
      "trash.notFound",
    );
    expect(sheepOf(store, sheepId).deletedAt).toBeDefined();
  });

  describe("a Sheep", () => {
    test("comes back with its Tag, its Owner and its Flock, with an audit entry", async () => {
      const { store, ctx, register, flock, restore, trash } = await setup();
      const flockId = await flock();
      const sheepId = await register({ tag: "A-1" });
      await moveSheep(ctx, { sheepIds: [sheepId], flockId, date: "2026-10-01" });
      await deleteSheep(ctx, { sheepId });
      const audit = auditFrom(store);

      await restore("sheep", sheepId);

      expect(sheepOf(store, sheepId)).toMatchObject({ tag: "A-1", status: "active", flockId });
      expect(sheepOf(store, sheepId).deletedAt).toBeUndefined();
      expect(await ctx.repos.sheep.listInFlock(flockId)).toHaveLength(1);
      expect(audit()).toEqual(["sheep.restore Sheep"]);
      expect(await trash()).toEqual([]);
    });

    test("fails if another Sheep took its Tag, and writes nothing", async () => {
      const { store, ctx, register, restore } = await setup();
      const sheepId = await register({ tag: "A-1" });
      await deleteSheep(ctx, { sheepId });
      await register({ tag: " a-1 " });
      const before = snapshot(store);

      await expect(restore("sheep", sheepId)).rejects.toThrow("sheep.tagTaken");
      expect(snapshot(store)).toEqual(before);
    });

    test("fails if its Owner left the Farm while it was Deleted", async () => {
      const { ctx, admin, as, editorId, register } = await setup();
      const sheepId = await register({ tag: "A-1" });
      const dead = await register({ tag: "A-2" });
      await changeSheepStatus(ctx, {
        sheepIds: [dead],
        status: "dead",
        date: "2026-10-17",
        reason: null,
      });
      await deleteSheep(ctx, { sheepId });
      await deleteSheep(ctx, { sheepId: dead });
      const adminCtx = await as(admin);
      // A Deleted Sheep does not keep its Owner in the Farm.
      await removeMember(adminCtx, { membershipId: editorId });

      await expect(restoreFromTrash(adminCtx, { kind: "sheep", id: sheepId })).rejects.toThrow(
        "sheep.ownerNotMember",
      );
      // A Dead Sheep is not on the Farm, so its Owner can be a Member who left.
      await restoreFromTrash(adminCtx, { kind: "sheep", id: dead });
    });

    test("fails while its Mother is Deleted, and comes back after her", async () => {
      const { ctx, register, restore } = await setup();
      const mother = await register({ tag: "M-1", birthDate: "2020-03-01", initialEntry: false });
      const lamb = await register({
        tag: "L-1",
        birthDate: "2026-03-01",
        initialEntry: false,
        motherId: mother,
      });
      await deleteSheep(ctx, { sheepId: lamb });
      await deleteSheep(ctx, { sheepId: mother });

      await expect(restore("sheep", lamb)).rejects.toThrow("trash.parentDeleted");
      await restore("sheep", mother);
      await restore("sheep", lamb);
    });

    test("fails if its Mother is no longer an Ewe", async () => {
      const { ctx, register, restore } = await setup();
      const mother = await register({ tag: "M-1" });
      const lamb = await register({ tag: "L-1", motherId: mother });
      await deleteSheep(ctx, { sheepId: lamb });
      // While the Lamb is Deleted, nothing makes the Mother keep her sex.
      await updateSheep(ctx, {
        sheepId: mother,
        tag: "M-1",
        name: null,
        sex: "ram",
        birthDate: null,
        notes: null,
        weight: null,
      });

      await expect(restore("sheep", lamb)).rejects.toThrow("pedigree.motherNotEwe");
    });

    test("fails while a Breed of its parts is Deleted", async () => {
      const { ctx, register, restore } = await setup();
      const breedId = await addBreed(ctx, { name: "Гиссарская" });
      const sheepId = await register({
        tag: "A-1",
        manualBreeds: [{ breedId, share: wholeShare }],
      });
      await deleteSheep(ctx, { sheepId });
      await deleteBreed(ctx, { breedId });

      await expect(restore("sheep", sheepId)).rejects.toThrow("trash.breedDeleted");
      await restore("breed", breedId);
      await restore("sheep", sheepId);
    });

    test("with a Passport, fails if it is no longer 100 percent Arashan", async () => {
      const { ctx, register, restore } = await setup();
      const breedId = await addBreed(ctx, { name: "Гиссарская" });
      const mother = await register({
        tag: "M-1",
        manualBreeds: [{ breedId: arashanBreedId, share: wholeShare }],
      });
      const child = await register({
        tag: "C-1",
        motherId: mother,
        manualBreeds: [{ breedId: arashanBreedId, share: wholeShare / 2 }],
        passport: { number: "KG-1", issueDate: "2026-09-01", scanId: null },
      });
      await deleteSheep(ctx, { sheepId: child });
      // The Deleted child is not a descendant now, so its Passport does not stop the change.
      await updateSheep(ctx, {
        sheepId: mother,
        tag: "M-1",
        name: null,
        sex: "ewe",
        birthDate: null,
        notes: null,
        weight: null,
        manualBreeds: [
          { breedId: arashanBreedId, share: wholeShare / 2 },
          { breedId, share: wholeShare / 2 },
        ],
      });

      await expect(restore("sheep", child)).rejects.toThrow("passport.notArashan");
    });

    test("fails if its Flock is Archived: an Archived Flock has no Sheep", async () => {
      const { ctx, register, flock, restore } = await setup();
      const flockId = await flock();
      const sheepId = await register({ tag: "A-1" });
      await moveSheep(ctx, { sheepIds: [sheepId], flockId, date: "2026-10-01" });
      await deleteSheep(ctx, { sheepId });
      await archiveFlock(ctx, { flockId, date: "2026-10-18" });

      await expect(restore("sheep", sheepId)).rejects.toThrow("flock.archived");
    });

    test("of a cancelled Purchase comes back only with the Purchase", async () => {
      const { store, ctx, editorId, restore } = await setup();
      const purchaseId = await buySheep(ctx, {
        sheep: [
          { tag: "B-1", name: null, sex: "ram", birthDate: null, notes: null, ownerId: editorId },
        ],
        date: "2026-10-16",
        price: 1_000_000,
        flockId: null,
      });
      await cancelDeal(ctx, { dealId: purchaseId });
      const sheepId = store.deals.find((d) => d.id === purchaseId)!.sheepIds[0]!;

      await expect(restore("sheep", sheepId)).rejects.toThrow("sheep.inDeal");
    });
  });

  describe("a deal", () => {
    test("a Sale sells its Sheep again, with its Income, and audits each record", async () => {
      const { store, ctx, register, flock, restore } = await setup();
      const flockId = await flock();
      const sheepIds = [await register({ tag: "A-1" }), await register({ tag: "A-2" })];
      await moveSheep(ctx, { sheepIds, flockId, date: "2026-10-01" });
      const saleId = await sellSheep(ctx, { sheepIds, date: "2026-10-15", price: 3_000_000 });
      await cancelDeal(ctx, { dealId: saleId });
      expect(sheepOf(store, sheepIds[0]!)).toMatchObject({ status: "active", flockId });
      const audit = auditFrom(store);

      await restore("deal", saleId);

      expect(store.deals.find((d) => d.id === saleId)!.deletedAt).toBeUndefined();
      for (const id of sheepIds) {
        expect(sheepOf(store, id)).toMatchObject({ status: "sold", flockId: null });
        const changes = await ctx.repos.sheep.statusChanges(id);
        expect(changes.at(-1)).toMatchObject({ to: "sold", date: "2026-10-15", saleId });
      }
      const income = await ctx.repos.moneyRecords.findBySource({ kind: "sale", id: saleId });
      expect(income).toMatchObject({ kind: "income", amount: 3_000_000, date: "2026-10-15" });
      expect(audit()).toEqual([
        "sale.restore Sale",
        "sale.restore Sheep",
        "sale.restore Sheep",
        "sale.restore Income",
      ]);
    });

    test("a Sale fails if a Sheep of it is not Active now, and writes nothing", async () => {
      const { store, ctx, register, restore } = await setup();
      const [first, second] = [await register({ tag: "A-1" }), await register({ tag: "A-2" })];
      const saleId = await sellSheep(ctx, {
        sheepIds: [first!, second!],
        date: "2026-10-15",
        price: 3_000_000,
      });
      await cancelDeal(ctx, { dealId: saleId });
      await changeSheepStatus(ctx, {
        sheepIds: [second!],
        status: "dead",
        date: "2026-10-17",
        reason: null,
      });
      const before = snapshot(store);

      await expect(restore("deal", saleId)).rejects.toThrow("sheep.notActive");
      expect(snapshot(store)).toEqual(before);
    });

    test("a Sale fails if a Sheep of it is Deleted now", async () => {
      const { ctx, register, restore } = await setup();
      const sheepId = await register({ tag: "A-1" });
      const saleId = await sellSheep(ctx, { sheepIds: [sheepId], date: "2026-10-15", price: 100 });
      await cancelDeal(ctx, { dealId: saleId });
      await deleteSheep(ctx, { sheepId });

      await expect(restore("deal", saleId)).rejects.toThrow("trash.sheepDeleted");
      await restore("sheep", sheepId);
      await restore("deal", saleId);
    });

    test("a Sale fails if a Sheep of it has a later event than the Sale", async () => {
      const { ctx, register, flock, restore } = await setup();
      const flockId = await flock();
      const sheepId = await register({ tag: "A-1" });
      const saleId = await sellSheep(ctx, { sheepIds: [sheepId], date: "2026-10-15", price: 100 });
      await cancelDeal(ctx, { dealId: saleId });
      await moveSheep(ctx, { sheepIds: [sheepId], flockId, date: "2026-10-17" });

      await expect(restore("deal", saleId)).rejects.toThrow("sheep.statusDateInvalid");
    });

    test("a Purchase brings back its Sheep, its Flock and its Expense", async () => {
      const { store, ctx, editorId, flock, restore, trash } = await setup();
      const flockId = await flock();
      const row = (tag: string) => ({
        tag,
        name: null,
        sex: "ram" as const,
        birthDate: null,
        notes: null,
        ownerId: editorId,
      });
      const purchaseId = await buySheep(ctx, {
        sheep: [row("B-1"), row("B-2")],
        date: "2026-10-16",
        price: 1_000_000,
        flockId,
      });
      await cancelDeal(ctx, { dealId: purchaseId });
      const audit = auditFrom(store);

      await restore("deal", purchaseId);

      const sheep = await ctx.repos.sheep.listInFlock(flockId);
      expect(sheep.map((s) => [s.tag, s.purchaseId])).toEqual([
        ["B-1", purchaseId],
        ["B-2", purchaseId],
      ]);
      const record = await ctx.repos.moneyRecords.findBySource({
        kind: "purchase",
        id: purchaseId,
      });
      expect(record).toMatchObject({ kind: "expense", amount: 1_000_000 });
      expect(audit()).toEqual([
        "purchase.restore Purchase",
        "purchase.restore Sheep",
        "purchase.restore Sheep",
        "purchase.restore Expense",
      ]);
      expect(await trash()).toEqual([]);
    });

    test("a Purchase fails if another Sheep took the Tag of one of its Sheep, and writes nothing", async () => {
      const { store, ctx, editorId, register, restore } = await setup();
      const row = (tag: string) => ({
        tag,
        name: null,
        sex: "ram" as const,
        birthDate: null,
        notes: null,
        ownerId: editorId,
      });
      const purchaseId = await buySheep(ctx, {
        sheep: [row("B-1"), row("B-2")],
        date: "2026-10-16",
        price: 1_000_000,
        flockId: null,
      });
      await cancelDeal(ctx, { dealId: purchaseId });
      await register({ tag: "B-2" });
      const before = snapshot(store);

      await expect(restore("deal", purchaseId)).rejects.toThrow("sheep.tagTaken");
      expect(snapshot(store)).toEqual(before);
    });
  });

  describe("an Expense or an Income", () => {
    test("comes back, with an audit entry", async () => {
      const { store, ctx, restore } = await setup();
      const recordId = await expense(ctx, store);
      await deleteMoneyRecord(ctx, { recordId });
      const audit = auditFrom(store);

      await restore("moneyRecord", recordId);

      expect(await ctx.repos.moneyRecords.get(recordId)).toMatchObject({ amount: 50_000 });
      expect(audit()).toEqual(["money.restore Expense"]);
    });

    test("of a Sheep fails while the Sheep is Deleted", async () => {
      const { store, ctx, register, restore } = await setup();
      const sheepId = await register({ tag: "A-1" });
      const recordId = await expense(ctx, store, { scope: { kind: "sheep", sheepId } });
      await deleteMoneyRecord(ctx, { recordId });
      await deleteSheep(ctx, { sheepId });

      await expect(restore("moneyRecord", recordId)).rejects.toThrow("trash.sheepDeleted");
    });

    test("that is Automatic comes back only with its event", async () => {
      const { store, ctx, register, restore } = await setup();
      const sheepId = await register({ tag: "A-1" });
      const saleId = await sellSheep(ctx, { sheepIds: [sheepId], date: "2026-10-15", price: 100 });
      await cancelDeal(ctx, { dealId: saleId });
      const income = store.moneyRecords.find((r) => r.source?.id === saleId)!;

      await expect(restore("moneyRecord", income.id)).rejects.toThrow("money.automatic");
    });
  });

  describe("a category, a Breed or an assignment", () => {
    test("a category comes back, unless a new category took its name", async () => {
      const { store, ctx, restore } = await setup();
      const first = await createMoneyCategory(ctx, { kind: "income", name: "Кожа" });
      await deleteMoneyCategory(ctx, { categoryId: first });
      const second = await createMoneyCategory(ctx, { kind: "income", name: "кожа" });

      await expect(restore("moneyCategory", first)).rejects.toThrow("moneyCategory.nameTaken");
      await deleteMoneyCategory(ctx, { categoryId: second });
      const audit = auditFrom(store);
      await restore("moneyCategory", first);
      expect(audit()).toEqual(["moneyCategory.restore IncomeCategory"]);
    });

    test("a Breed comes back, unless another Breed has its name now", async () => {
      const { store, ctx, restore } = await setup();
      const first = await addBreed(ctx, { name: "Гиссарская" });
      await deleteBreed(ctx, { breedId: first });
      const second = await addBreed(ctx, { name: "Гиссарская" });

      await expect(restore("breed", first)).rejects.toThrow("breed.nameTaken");
      await renameBreed(ctx, { breedId: second, name: "Эдильбаевская" });
      const audit = auditFrom(store);
      await restore("breed", first);
      expect(audit()).toEqual(["breed.restore Breed"]);
    });

    test("an assignment comes back, unless it overlaps another one or its Flock is Archived", async () => {
      const { store, ctx, flock, restore } = await setup();
      const flockId = await flock();
      const shepherdId = await createShepherd(ctx, { name: "Асан", phone: null, notes: null });
      const assignmentId = await assignShepherd(ctx, {
        flockId,
        shepherdId,
        from: "2026-10-01",
        to: null,
      });
      await removeShepherdAssignment(ctx, { assignmentId });
      const other = await assignShepherd(ctx, {
        flockId,
        shepherdId,
        from: "2026-10-05",
        to: null,
      });

      await expect(restore("shepherdAssignment", assignmentId)).rejects.toThrow(
        "flock.assignmentOverlaps",
      );
      await removeShepherdAssignment(ctx, { assignmentId: other });
      await archiveFlock(ctx, { flockId, date: "2026-10-18" });
      await expect(restore("shepherdAssignment", assignmentId)).rejects.toThrow("flock.archived");

      const closed = await assignShepherd(ctx, {
        flockId: await flock("Второе"),
        shepherdId,
        from: "2026-09-01",
        to: "2026-09-30",
      });
      await removeShepherdAssignment(ctx, { assignmentId: closed });
      const audit = auditFrom(store);
      await restore("shepherdAssignment", closed);
      expect(audit()).toEqual([
        "flock.restoreAssignment Flock",
        "flock.restoreAssignment Shepherd",
      ]);
    });
  });

  describe("a Resource event", () => {
    test("a Restock comes back with its Expense, and the Stock counts it again", async () => {
      const { store, ctx, flock, restore } = await setup();
      const flockId = await flock();
      const resourceId = await createResource(ctx, { name: "Сено", unit: "тюк" });
      const restockId = await recordRestock(ctx, {
        resourceId,
        date: "2026-10-10",
        quantity: 10_000,
        price: 200_000,
      });
      await recordUsage(ctx, { resourceId, date: "2026-10-12", quantity: 3_000, flockId });
      await cancelResourceEvent(ctx, { eventId: restockId });
      expect((await ctx.repos.resources.get(resourceId))!.stock).toBe(-3_000);
      const audit = auditFrom(store);

      await restore("resourceEvent", restockId);

      expect((await ctx.repos.resources.get(resourceId))!.stock).toBe(7_000);
      expect(
        await ctx.repos.moneyRecords.findBySource({ kind: "restock", id: restockId }),
      ).toMatchObject({ kind: "expense", amount: 200_000 });
      expect(audit()).toEqual([
        "resource.restoreEvent Expense",
        "resource.restoreEvent ResourceEvent",
        "resource.restoreEvent Resource",
      ]);
    });

    test("keeps the unit of its Resource: a cancelled event locks it too", async () => {
      const { ctx, restore } = await setup();
      const resourceId = await createResource(ctx, { name: "Сено", unit: "тюк" });
      const restockId = await recordRestock(ctx, {
        resourceId,
        date: "2026-10-10",
        quantity: 10_000,
        price: null,
      });
      await cancelResourceEvent(ctx, { eventId: restockId });

      // Else the 10 «тюк» of the Restock would come back as 10 «кг».
      await expect(updateResource(ctx, { resourceId, name: "Сено", unit: "кг" })).rejects.toThrow(
        "resource.unitLocked",
      );
      await restore("resourceEvent", restockId);
      expect((await ctx.repos.resources.get(resourceId))!).toMatchObject({
        unit: "тюк",
        stock: 10_000,
      });
    });

    test("fails if its Resource is Archived", async () => {
      const { ctx, restore } = await setup();
      const resourceId = await createResource(ctx, { name: "Сено", unit: "тюк" });
      const restockId = await recordRestock(ctx, {
        resourceId,
        date: "2026-10-10",
        quantity: 10_000,
        price: null,
      });
      await cancelResourceEvent(ctx, { eventId: restockId });
      await archiveResource(ctx, { resourceId });

      await expect(restore("resourceEvent", restockId)).rejects.toThrow("resource.archived");
    });
  });
});

import { describe, expect, test } from "vite-plus/test";

import type { CommandContext } from "../context";
import { createFarm } from "../farms/commands";
import { createFlock, moveSheep } from "../flocks/commands";
import type { FarmId, MembershipId, SheepId } from "../ids";
import { InMemoryStore } from "../testing/in-memory";
import {
  changeSheepOwner,
  deleteSheep,
  registerSheep,
  type SheepDetails,
  type SheepRegistration,
  updateSheep,
} from "./commands";
import { getSheep, listSheep } from "./queries";

const settings = { currency: "KGS", timeZone: "Asia/Bishkek", lambAgeMonths: 4 };

/**
 * A Farm with an Admin and an Editor. The time is 2026-10-18 18:00 in Bishkek, the time zone of the
 * Farm.
 */
async function setup() {
  const store = new InMemoryStore();
  const operator = store.addUser("operator", { operator: true });
  const { farmId } = await createFarm(operator, { name: "Арашан", ...settings });
  const admin = store.addMember("admin", farmId, "admin");
  const editor = store.addMember("editor", farmId, "editor");
  const membershipId = (username: string, farm: FarmId = farmId): MembershipId => {
    const user = store.users.find((u) => u.username === username)!;
    return store.memberships.find((m) => m.userId === user.id && m.farmId === farm)!.id;
  };
  const as = (user: CommandContext) => store.farmContext(user, farmId);
  /** Registers a Sheep as the Editor, with the Editor as its Owner. */
  const register = async (change: Partial<SheepRegistration> = {}) =>
    registerSheep(await as(editor), aSheep(membershipId("editor"), change));
  return { store, operator, farmId, admin, editor, membershipId, as, register };
}

/** The fields of an Ewe with the Tag "A-12" and no other data. */
function details(change: Partial<SheepDetails> = {}): SheepDetails {
  return {
    tag: "A-12",
    name: null,
    sex: "ewe",
    birthDate: null,
    notes: null,
    weight: null,
    ...change,
  };
}

/** An Initial entry of a Born Ewe with the Tag "A-12" and no other data. */
function aSheep(ownerId: MembershipId, change: Partial<SheepRegistration> = {}): SheepRegistration {
  return { ...details(), ownerId, origin: "born", initialEntry: true, ...change };
}

function stored(store: InMemoryStore, id: SheepId) {
  return store.sheep.find((s) => s.id === id);
}

describe("registerSheep", () => {
  test("an Editor registers a Sheep, with an audit entry", async () => {
    const { store, farmId, membershipId, register } = await setup();

    const sheepId = await register({
      tag: "  A-12  ",
      name: " Белка ",
      birthDate: "2026-03-01",
      notes: "  С рыжим пятном  ",
      weight: { kg: 41.5, date: "2026-10-01" },
    });

    expect(stored(store, sheepId)).toEqual({
      id: sheepId,
      farmId,
      tag: "A-12",
      name: "Белка",
      sex: "ewe",
      birthDate: "2026-03-01",
      origin: "born",
      initialEntry: true,
      purchaseId: null,
      status: "active",
      ownerId: membershipId("editor"),
      notes: "С рыжим пятном",
      weight: { kg: 41.5, date: "2026-10-01" },
      motherId: null,
      fatherId: null,
      manualBreeds: [],
      passport: null,
      grade: null,
      flockId: null,
      registeredAt: store.time,
    });
    expect(store.audit.at(-1)).toEqual({
      at: store.time,
      actorId: store.users.find((u) => u.username === "editor")?.id,
      farmId,
      command: "sheep.register",
      target: { kind: "Sheep", id: sheepId },
    });
  });

  test("empty texts are no values, and the spaces inside a Tag count as one", async () => {
    const { store, register } = await setup();

    const sheepId = await register({ tag: " KG   0012 ", name: "   ", notes: "" });

    expect(stored(store, sheepId)).toMatchObject({ tag: "KG 0012", name: null, notes: null });
  });

  describe("the Tag", () => {
    test("is optional: many Sheep have no Tag", async () => {
      const { store, register } = await setup();

      await register({ tag: null });
      await register({ tag: "  " });

      expect(store.sheep.map((s) => s.tag)).toEqual([null, null]);
    });

    test.each(["A-12", "a-12", " A-12 ", "А-12"])(
      "is unique in the Farm: %s is taken by A-12",
      async (tag) => {
        const { store, register } = await setup();
        await register({ tag: "A-12" });

        await expect(register({ tag })).rejects.toMatchObject({ code: "sheep.tagTaken" });
        expect(store.sheep).toHaveLength(1);
      },
    );

    test("stays taken by a Sheep that is not Active", async () => {
      const { store, register } = await setup();
      const sold = await register({ tag: "A-12" });
      stored(store, sold)!.status = "sold";

      await expect(register({ tag: "A-12" })).rejects.toMatchObject({ code: "sheep.tagTaken" });
    });

    test("of a Deleted Sheep is free", async () => {
      const { store, editor, as, register } = await setup();
      const mistake = await register({ tag: "A-12" });
      await deleteSheep(await as(editor), { sheepId: mistake });

      await expect(register({ tag: "A-12" })).resolves.toEqual(expect.any(String));
      expect(store.sheep.map((s) => s.tag)).toEqual(["A-12", "A-12"]);
    });

    test("of an External Sheep does not count", async () => {
      const { store, farmId, register } = await setup();
      const external = await register({ tag: "A-12" });
      Object.assign(stored(store, external)!, { origin: "external", ownerId: null });

      await expect(register({ tag: "A-12" })).resolves.toEqual(expect.any(String));
      expect(store.sheep.filter((s) => s.farmId === farmId)).toHaveLength(2);
    });

    test("of a Sheep of another Farm does not count", async () => {
      const { store, operator, register } = await setup();
      const { farmId: otherFarmId } = await createFarm(operator, { name: "Другая", ...settings });
      const other = store.addMember("other", otherFarmId, "admin");
      const otherOwner = store.memberships.at(-1)!.id;
      await registerSheep(await store.farmContext(other, otherFarmId), aSheep(otherOwner));

      await expect(register({ tag: "A-12" })).resolves.toEqual(expect.any(String));
    });

    test("has at most 30 characters", async () => {
      const { register } = await setup();

      await expect(register({ tag: "1".repeat(31) })).rejects.toMatchObject({
        code: "sheep.tagTooLong",
      });
      await expect(register({ tag: "1".repeat(30) })).resolves.toEqual(expect.any(String));
    });
  });

  test("the name is optional and not unique", async () => {
    const { store, register } = await setup();

    await register({ tag: "1", name: "Белка" });
    await register({ tag: "2", name: "Белка" });
    await register({ tag: "3", name: null });

    expect(store.sheep.map((s) => s.name)).toEqual(["Белка", "Белка", null]);
  });

  test.each([
    [{ name: "x".repeat(61) }, "sheep.nameTooLong"],
    [{ notes: "x".repeat(2001) }, "sheep.notesTooLong"],
  ])("a text that is too long fails: %o", async (change, code) => {
    const { register } = await setup();

    await expect(register(change)).rejects.toMatchObject({ code });
  });

  describe("the Owner", () => {
    test("is a Member of the Farm, of any Role", async () => {
      const { store, editor, membershipId, as } = await setup();

      const sheepId = await registerSheep(await as(editor), aSheep(membershipId("admin")));

      expect(stored(store, sheepId)?.ownerId).toBe(membershipId("admin"));
    });

    test("cannot be a Member of another Farm", async () => {
      const { store, operator, editor, as } = await setup();
      const { farmId: otherFarmId } = await createFarm(operator, { name: "Другая", ...settings });
      store.addMember("stranger", otherFarmId, "admin");
      const stranger = store.memberships.at(-1)!.id;

      await expect(registerSheep(await as(editor), aSheep(stranger))).rejects.toMatchObject({
        code: "sheep.ownerNotMember",
      });
    });

    test("cannot be a removed Member", async () => {
      const { store, editor, farmId, as } = await setup();
      store.addMember("gone", farmId, "editor");
      const gone = store.memberships.at(-1)!;
      gone.archivedAt = store.time;

      await expect(registerSheep(await as(editor), aSheep(gone.id))).rejects.toMatchObject({
        code: "sheep.ownerNotMember",
      });
    });

    test("cannot be an unknown id", async () => {
      const { editor, as } = await setup();

      await expect(
        registerSheep(await as(editor), aSheep("nobody" as MembershipId)),
      ).rejects.toMatchObject({ code: "sheep.ownerNotMember" });
    });
  });

  describe("the Initial entry", () => {
    test("registers a Bought Sheep without a Purchase and without a birth date", async () => {
      const { store, register } = await setup();

      const sheepId = await register({ origin: "bought", birthDate: null });

      expect(stored(store, sheepId)).toMatchObject({
        origin: "bought",
        initialEntry: true,
        birthDate: null,
      });
      // No Purchase and no Automatic record: the Sheep is the only record, with its audit entry.
      expect(store.audit.filter((e) => e.target.kind === "Sheep")).toHaveLength(1);
    });

    test("registers a Born Sheep without a birth date", async () => {
      const { store, register } = await setup();

      const sheepId = await register({ origin: "born", birthDate: null });

      expect(stored(store, sheepId)).toMatchObject({ origin: "born", birthDate: null });
    });
  });

  describe("outside the Initial entry", () => {
    test("a Born Sheep has a birth date", async () => {
      const { store, register } = await setup();

      await expect(register({ initialEntry: false, birthDate: null })).rejects.toMatchObject({
        code: "sheep.birthDateRequired",
      });
      const sheepId = await register({ initialEntry: false, birthDate: "2026-10-01" });
      expect(stored(store, sheepId)).toMatchObject({ initialEntry: false, origin: "born" });
    });

    test("a Bought Sheep comes from a Purchase", async () => {
      const { store, register } = await setup();

      await expect(
        register({ initialEntry: false, origin: "bought", birthDate: "2026-01-01" }),
      ).rejects.toMatchObject({ code: "sheep.purchaseRequired" });
      expect(store.sheep).toEqual([]);
    });
  });

  describe("the dates", () => {
    test.each(["2026-02-30", "18.10.2026", ""])("%s is not a date", async (birthDate) => {
      const { register } = await setup();

      await expect(register({ birthDate })).rejects.toMatchObject({ code: "sheep.dateInvalid" });
    });

    test("the birth date is not after today in the time zone of the Farm", async () => {
      const { store, register } = await setup();
      // 20:00 UTC is already October 19 in Bishkek.
      store.time = Date.UTC(2026, 9, 18, 20);

      await expect(register({ tag: "1", birthDate: "2026-10-19" })).resolves.toEqual(
        expect.any(String),
      );
      await expect(register({ tag: "2", birthDate: "2026-10-20" })).rejects.toMatchObject({
        code: "sheep.birthDateInFuture",
      });
    });
  });

  describe("the weight", () => {
    test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 301])("%d kg fails", async (kg) => {
      const { register } = await setup();

      await expect(register({ weight: { kg, date: "2026-10-01" } })).rejects.toMatchObject({
        code: "sheep.weightInvalid",
      });
    });

    test("is weighed not in the future and not before the birth", async () => {
      const { register } = await setup();

      await expect(
        register({ tag: "1", weight: { kg: 40, date: "2026-10-19" } }),
      ).rejects.toMatchObject({ code: "sheep.weighingDateInvalid" });
      await expect(
        register({ tag: "2", birthDate: "2026-05-01", weight: { kg: 40, date: "2026-04-30" } }),
      ).rejects.toMatchObject({ code: "sheep.weighingDateInvalid" });
      await expect(
        register({ tag: "3", weight: { kg: 40, date: "2026-02-31" } }),
      ).rejects.toMatchObject({ code: "sheep.dateInvalid" });
    });
  });
});

describe("updateSheep", () => {
  test("changes the fields, with an audit entry", async () => {
    const { store, editor, as, register } = await setup();
    const sheepId = await register();
    store.time += 1000;

    await updateSheep(await as(editor), {
      sheepId,
      tag: "B-7",
      name: "Белка",
      sex: "ram",
      birthDate: "2026-01-10",
      notes: "Хромает",
      weight: { kg: 50, date: "2026-10-18" },
    });

    expect(stored(store, sheepId)).toMatchObject({
      tag: "B-7",
      name: "Белка",
      sex: "ram",
      birthDate: "2026-01-10",
      notes: "Хромает",
      weight: { kg: 50, date: "2026-10-18" },
      registeredAt: store.time - 1000,
    });
    expect(store.audit.at(-1)).toMatchObject({
      at: store.time,
      command: "sheep.update",
      target: { kind: "Sheep", id: sheepId },
    });
  });

  test("a change that changes nothing writes nothing", async () => {
    const { store, editor, as, register } = await setup();
    const sheepId = await register({ name: "Белка" });
    const entries = store.audit.length;

    await updateSheep(await as(editor), { ...details(), name: " Белка ", sheepId });

    expect(store.audit).toHaveLength(entries);
  });

  test("keeps its own Tag, also in another case, but cannot take the Tag of another Sheep", async () => {
    const { store, editor, as, register } = await setup();
    const sheepId = await register({ tag: "A-12" });
    await register({ tag: "B-7" });
    const update = { ...details(), sheepId };

    await updateSheep(await as(editor), { ...update, tag: "а-12" });
    expect(stored(store, sheepId)?.tag).toBe("а-12");

    await expect(updateSheep(await as(editor), { ...update, tag: "b-7" })).rejects.toMatchObject({
      code: "sheep.tagTaken",
    });
  });

  test("the Origin of an Initial entry changes between Born and Bought", async () => {
    const { store, editor, as, register } = await setup();
    const sheepId = await register({ origin: "born" });

    await updateSheep(await as(editor), { ...details(), sheepId, origin: "bought" });

    expect(stored(store, sheepId)?.origin).toBe("bought");
  });

  test("the Origin of a Sheep outside the Initial entry does not change", async () => {
    const { editor, as, register } = await setup();
    const sheepId = await register({ initialEntry: false, birthDate: "2026-05-01" });
    const update = { ...details(), birthDate: "2026-05-01", sheepId };

    await expect(
      updateSheep(await as(editor), { ...update, origin: "bought" }),
    ).rejects.toMatchObject({ code: "sheep.originLocked" });
    await expect(
      updateSheep(await as(editor), { ...update, birthDate: null }),
    ).rejects.toMatchObject({ code: "sheep.birthDateRequired" });
  });

  test("the birth date is not after a change of the Owner", async () => {
    const { store, editor, membershipId, as, register } = await setup();
    const sheepId = await register({ birthDate: "2026-01-01" });
    await changeSheepOwner(await as(editor), {
      sheepId,
      ownerId: membershipId("admin"),
      date: "2026-02-01",
    });
    const update = { ...details(), sheepId };

    await expect(
      updateSheep(await as(editor), { ...update, birthDate: "2026-02-02" }),
    ).rejects.toMatchObject({ code: "sheep.birthDateAfterOwnerChange" });
    await updateSheep(await as(editor), { ...update, birthDate: "2026-02-01" });
    expect(stored(store, sheepId)?.birthDate).toBe("2026-02-01");
  });

  test("the birth date is not after a move into a Flock or out of it", async () => {
    const { store, editor, as, register } = await setup();
    const ctx = await as(editor);
    const sheepId = await register();
    const flockId = await createFlock(ctx, { name: "Стадо", locationId: null });
    await moveSheep(ctx, { sheepIds: [sheepId], flockId, date: "2026-10-01" });
    const update = { ...details(), sheepId };

    await expect(updateSheep(ctx, { ...update, birthDate: "2026-10-10" })).rejects.toMatchObject({
      code: "sheep.birthDateAfterFlockMove",
    });
    await updateSheep(ctx, { ...update, birthDate: "2026-10-01" });
    expect(stored(store, sheepId)?.birthDate).toBe("2026-10-01");
  });

  test("a Deleted Sheep or a Sheep of another Farm is not found", async () => {
    const { store, operator, editor, as, register } = await setup();
    const deleted = await register({ tag: "1" });
    await deleteSheep(await as(editor), { sheepId: deleted });
    const { farmId: otherFarmId } = await createFarm(operator, { name: "Другая", ...settings });
    const other = store.addMember("other", otherFarmId, "admin");
    const foreign = await registerSheep(
      await store.farmContext(other, otherFarmId),
      aSheep(store.memberships.at(-1)!.id),
    );
    const update = details();

    for (const sheepId of [deleted, foreign]) {
      await expect(updateSheep(await as(editor), { ...update, sheepId })).rejects.toMatchObject({
        code: "sheep.notFound",
      });
    }
  });
});

describe("changeSheepOwner", () => {
  test("gives the Sheep to another Member on a date, with an audit entry", async () => {
    const { store, admin, membershipId, as, register } = await setup();
    const sheepId = await register({ birthDate: "2026-01-10" });

    await changeSheepOwner(await as(admin), {
      sheepId,
      ownerId: membershipId("admin"),
      date: "2026-06-01",
    });

    expect(stored(store, sheepId)?.ownerId).toBe(membershipId("admin"));
    expect(store.ownerChanges).toEqual([
      {
        id: expect.any(String),
        sheepId,
        previousOwnerId: membershipId("editor"),
        ownerId: membershipId("admin"),
        date: "2026-06-01",
        at: store.time,
      },
    ]);
    expect(store.audit.at(-1)).toMatchObject({
      command: "sheep.changeOwner",
      target: { kind: "Sheep", id: sheepId },
    });
    const card = await getSheep(await as(admin), { sheepId });
    expect(card?.owners).toEqual([
      { owner: { id: membershipId("admin"), name: "admin" }, since: "2026-06-01" },
      { owner: { id: membershipId("editor"), name: "editor" }, since: null },
    ]);
  });

  test("the new Owner is another Member of the Farm now", async () => {
    const { store, farmId, editor, membershipId, as, register } = await setup();
    const sheepId = await register();
    store.addMember("gone", farmId, "editor");
    store.memberships.at(-1)!.archivedAt = store.time;
    const change = { sheepId, date: "2026-10-18" };

    await expect(
      changeSheepOwner(await as(editor), { ...change, ownerId: membershipId("editor") }),
    ).rejects.toMatchObject({ code: "sheep.sameOwner" });
    await expect(
      changeSheepOwner(await as(editor), { ...change, ownerId: membershipId("gone") }),
    ).rejects.toMatchObject({ code: "sheep.ownerNotMember" });
    expect(store.ownerChanges).toEqual([]);
  });

  test("the date is not in the future, not before the birth and not before the last change", async () => {
    const { store, farmId, editor, membershipId, as, register } = await setup();
    const sheepId = await register({ birthDate: "2026-03-01" });
    store.addMember("third", farmId, "editor");
    const ctx = await as(editor);
    await changeSheepOwner(ctx, { sheepId, ownerId: membershipId("admin"), date: "2026-06-01" });

    for (const date of ["2026-10-19", "2026-02-28", "2026-05-31"]) {
      await expect(
        changeSheepOwner(ctx, { sheepId, ownerId: membershipId("third"), date }),
      ).rejects.toMatchObject({ code: "sheep.ownerChangeDateInvalid" });
    }
    await expect(
      changeSheepOwner(ctx, { sheepId, ownerId: membershipId("third"), date: "2026-13-01" }),
    ).rejects.toMatchObject({ code: "sheep.dateInvalid" });
    // The same day as the last change is valid.
    await changeSheepOwner(ctx, { sheepId, ownerId: membershipId("third"), date: "2026-06-01" });
    expect(store.ownerChanges.map((c) => c.ownerId)).toEqual([
      membershipId("admin"),
      membershipId("third"),
    ]);
  });

  test("only an Active Sheep changes its Owner", async () => {
    const { store, editor, membershipId, as, register } = await setup();
    const sheepId = await register();
    stored(store, sheepId)!.status = "dead";

    await expect(
      changeSheepOwner(await as(editor), {
        sheepId,
        ownerId: membershipId("admin"),
        date: "2026-10-18",
      }),
    ).rejects.toMatchObject({ code: "sheep.notActive" });
  });
});

describe("deleteSheep", () => {
  test("the Sheep becomes Deleted: the app keeps it but hides it", async () => {
    const { store, editor, as, register } = await setup();
    const sheepId = await register();

    await deleteSheep(await as(editor), { sheepId });

    expect(stored(store, sheepId)?.deletedAt).toBe(store.time);
    expect(store.audit.at(-1)).toMatchObject({
      command: "sheep.delete",
      target: { kind: "Sheep", id: sheepId },
    });
    expect(await listSheep(await as(editor))).toEqual([]);
    expect(await getSheep(await as(editor), { sheepId })).toBeNull();
    await expect(deleteSheep(await as(editor), { sheepId })).rejects.toMatchObject({
      code: "sheep.notFound",
    });
  });

  test("an Admin and an Editor can delete", async () => {
    const { admin, editor, as, register } = await setup();

    for (const user of [admin, editor]) {
      const sheepId = await register({ tag: null });
      await expect(deleteSheep(await as(user), { sheepId })).resolves.toBeUndefined();
    }
  });
});

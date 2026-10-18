import { describe, expect, test } from "vite-plus/test";

import type { CommandContext } from "../context";
import type { CalendarDate } from "../dates";
import { createFarm } from "../farms/commands";
import type { FlockId, LocationId, SheepId, ShepherdId } from "../ids";
import { deleteSheep, registerSheep, type SheepRegistration } from "../sheep/commands";
import { getSheep } from "../sheep/queries";
import { InMemoryStore } from "../testing/in-memory";
import {
  archiveFlock,
  archiveLocation,
  archiveShepherd,
  assignShepherd,
  createFlock,
  createLocation,
  createShepherd,
  moveSheep,
  undoFlockMove,
} from "./commands";
import { getFlock, getSheepResponsible, listFlocks, listLocations, listShepherds } from "./queries";

const settings = { currency: "KGS", timeZone: "Asia/Bishkek", lambAgeMonths: 4 };

/**
 * A Farm with an Admin and an Editor. The time is 2026-10-18 18:00 in Bishkek, the time zone of the
 * Farm. The helpers act as the Editor.
 */
async function setup() {
  const store = new InMemoryStore();
  const operator = store.addUser("operator", { operator: true });
  const { farmId } = await createFarm(operator, { name: "Арашан", ...settings });
  const admin = store.addMember("admin", farmId, "admin");
  const editor = store.addMember("editor", farmId, "editor");
  const editorId = store.memberships.at(-1)!.id;
  const as = (user: CommandContext) => store.farmContext(user, farmId);
  const ctx = () => as(editor);
  const register = async (change: Partial<SheepRegistration> = {}) =>
    registerSheep(await ctx(), {
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
  const location = async (name: string, notes: string | null = null) =>
    createLocation(await ctx(), { name, notes });
  const shepherd = async (name: string, phone: string | null = null, notes: string | null = null) =>
    createShepherd(await ctx(), { name, phone, notes });
  const flock = async (name: string, locationId: LocationId | null = null) =>
    createFlock(await ctx(), { name, locationId });
  const assign = async (
    flockId: FlockId,
    shepherdId: ShepherdId,
    from: CalendarDate,
    to: CalendarDate | null = null,
  ) => assignShepherd(await ctx(), { flockId, shepherdId, from, to });
  const move = async (sheepIds: SheepId | SheepId[], flockId: FlockId | null, date: CalendarDate) =>
    moveSheep(await ctx(), { sheepIds: [sheepIds].flat(), flockId, date });
  const responsible = async (sheepId: SheepId, date: CalendarDate) =>
    getSheepResponsible(await ctx(), { sheepId, date });
  return {
    store,
    operator,
    farmId,
    admin,
    editor,
    as,
    ctx,
    register,
    location,
    shepherd,
    flock,
    assign,
    move,
    responsible,
  };
}

/** A record as another record shows it. */
function ref<Id extends string>(id: Id, name: string, archived = false) {
  return { id, name, archived };
}

/** Another Farm with its own Admin, and the context of the Admin's requests to it. */
async function otherFarm(store: InMemoryStore, operator: CommandContext) {
  const { farmId } = await createFarm(operator, { name: "Другая", ...settings });
  const stranger = store.addMember("stranger", farmId, "admin");
  return {
    farmId,
    stranger,
    ownerId: store.memberships.at(-1)!.id,
    ctx: () => store.farmContext(stranger, farmId),
  };
}

describe("listLocations", () => {
  test("gives the Locations by name, each with its Flocks that are not Archived", async () => {
    const { ctx, location, flock } = await setup();
    const fold = await location("Кошара", "У реки");
    const pasture = await location("Ала-Тоо");
    const summer = await location("Яйлоо");
    await archiveLocation(await ctx(), { locationId: summer });
    const lower = await flock("Нижнее", fold);
    const upper = await flock("Верхнее", fold);
    const old = await flock("Старое", fold);
    await archiveFlock(await ctx(), { flockId: old, date: "2026-10-18" });
    await flock("Без места");

    expect(await listLocations(await ctx())).toEqual([
      { ...ref(pasture, "Ала-Тоо"), notes: null, flocks: [] },
      {
        ...ref(fold, "Кошара"),
        notes: "У реки",
        flocks: [ref(upper, "Верхнее"), ref(lower, "Нижнее")],
      },
      { ...ref(summer, "Яйлоо", true), notes: null, flocks: [] },
    ]);
  });
});

describe("listShepherds", () => {
  test("gives the Shepherds by name, each with the Flocks of the open assignments", async () => {
    const { ctx, shepherd, flock, assign } = await setup();
    const upper = await flock("Верхнее");
    const lower = await flock("Нижнее");
    const middle = await flock("Среднее");
    const bakyt = await shepherd("Бакыт", "+996 555 123 456", "Старший");
    const azamat = await shepherd("Азамат");
    const ermek = await shepherd("Эрмек");
    await assign(upper, bakyt, "2026-09-01");
    await assign(lower, bakyt, "2026-08-01", "2026-08-31");
    await assign(middle, bakyt, "2026-10-01");
    await assign(lower, ermek, "2026-01-01");
    await archiveShepherd(await ctx(), { shepherdId: ermek, date: "2026-10-01" });

    expect(await listShepherds(await ctx())).toEqual([
      { ...ref(azamat, "Азамат"), phone: null, notes: null, flocks: [] },
      {
        ...ref(bakyt, "Бакыт"),
        phone: "+996 555 123 456",
        notes: "Старший",
        flocks: [ref(upper, "Верхнее"), ref(middle, "Среднее")],
      },
      { ...ref(ermek, "Эрмек", true), phone: null, notes: null, flocks: [] },
    ]);
  });
});

describe("listFlocks", () => {
  test("gives the Flocks by name, with the Location, the Shepherds of now and the head count", async () => {
    const { ctx, register, location, shepherd, flock, assign, move } = await setup();
    const fold = await location("Кошара");
    const summer = await location("Яйлоо");
    const upper = await flock("Верхнее", fold);
    const lower = await flock("Нижнее");
    const old = await flock("Старое", summer);
    const azamat = await shepherd("Азамат");
    const bakyt = await shepherd("Бакыт");
    await assign(upper, azamat, "2026-06-01");
    await assign(upper, bakyt, "2026-01-01", "2026-05-31");
    await assign(old, bakyt, "2026-06-01");
    await archiveFlock(await ctx(), { flockId: old, date: "2026-10-01" });
    await archiveLocation(await ctx(), { locationId: summer });
    const sheep: SheepId[] = [];
    for (const tag of ["1", "2", "3", "4", "5"]) sheep.push(await register({ tag }));
    await move(sheep.slice(0, 3), upper, "2026-10-01");
    await move(sheep[3]!, lower, "2026-10-01");
    // A Deleted Sheep and a Sheep in no Flock are in no head count.
    await move(sheep[4]!, upper, "2026-10-01");
    await deleteSheep(await ctx(), { sheepId: sheep[4]! });
    await register({ tag: "6" });

    expect(await listFlocks(await ctx())).toEqual([
      {
        ...ref(upper, "Верхнее"),
        location: ref(fold, "Кошара"),
        shepherds: [ref(azamat, "Азамат")],
        sheepCount: 3,
      },
      { ...ref(lower, "Нижнее"), location: null, shepherds: [], sheepCount: 1 },
      {
        ...ref(old, "Старое", true),
        location: ref(summer, "Яйлоо", true),
        shepherds: [],
        sheepCount: 0,
      },
    ]);
  });

  test("the lists show no record of another Farm", async () => {
    const { store, operator, ctx } = await setup();
    const other = await otherFarm(store, operator);
    const locationId = await createLocation(await other.ctx(), { name: "Кошара", notes: null });
    await createFlock(await other.ctx(), { name: "Верхнее", locationId });
    await createShepherd(await other.ctx(), { name: "Азамат", phone: null, notes: null });

    expect(await listLocations(await ctx())).toEqual([]);
    expect(await listFlocks(await ctx())).toEqual([]);
    expect(await listShepherds(await ctx())).toEqual([]);
  });
});

describe("getFlock", () => {
  test("gives the card: the assignments the newest first, and the Sheep by Tag", async () => {
    const { ctx, register, location, shepherd, flock, assign, move } = await setup();
    const fold = await location("Кошара");
    const upper = await flock("Верхнее", fold);
    const lower = await flock("Нижнее");
    const azamat = await shepherd("Азамат");
    const bakyt = await shepherd("Бакыт");
    const bakytNow = await assign(upper, bakyt, "2026-04-01");
    const azamatBefore = await assign(upper, azamat, "2026-01-01", "2026-03-31");
    const azamatNow = await assign(upper, azamat, "2026-06-01");
    await assign(lower, bakyt, "2026-01-01");
    const ten = await register({ tag: "10", sex: "ram", birthDate: "2026-03-01" });
    const belka = await register({ name: "Белка" });
    const two = await register({ tag: "2" });
    const altyn = await register({ name: "Алтын" });
    const elsewhere = await register({ tag: "1" });
    await move([ten, belka, two, altyn], upper, "2026-10-01");
    await move(elsewhere, lower, "2026-10-01");

    expect(await getFlock(await ctx(), { flockId: upper })).toEqual({
      ...ref(upper, "Верхнее"),
      location: ref(fold, "Кошара"),
      shepherds: [ref(azamat, "Азамат"), ref(bakyt, "Бакыт")],
      sheepCount: 4,
      assignments: [
        { id: azamatNow, shepherd: ref(azamat, "Азамат"), from: "2026-06-01", to: null },
        { id: bakytNow, shepherd: ref(bakyt, "Бакыт"), from: "2026-04-01", to: null },
        {
          id: azamatBefore,
          shepherd: ref(azamat, "Азамат"),
          from: "2026-01-01",
          to: "2026-03-31",
        },
      ],
      sheep: [
        { id: two, tag: "2", name: null, sex: "ewe", birthDate: null },
        { id: ten, tag: "10", name: null, sex: "ram", birthDate: "2026-03-01" },
        { id: altyn, tag: null, name: "Алтын", sex: "ewe", birthDate: null },
        { id: belka, tag: null, name: "Белка", sex: "ewe", birthDate: null },
      ],
    });
  });

  test("gives null for an unknown Flock or a Flock of another Farm", async () => {
    const { store, operator, ctx } = await setup();
    const other = await otherFarm(store, operator);
    const foreign = await createFlock(await other.ctx(), { name: "Верхнее", locationId: null });

    expect(await getFlock(await ctx(), { flockId: foreign })).toBeNull();
    expect(await getFlock(await ctx(), { flockId: "unknown" as FlockId })).toBeNull();
  });
});

describe("the card of a Sheep", () => {
  test("shows the stays in Flocks, the newest first, each with the Shepherds of the stay", async () => {
    const { ctx, register, shepherd, flock, assign, move } = await setup();
    const upper = await flock("Верхнее");
    const lower = await flock("Нижнее");
    const azamat = await shepherd("Азамат");
    const bakyt = await shepherd("Бакыт");
    const ermek = await shepherd("Эрмек");
    // Азамат herds the Flock only before the second stay, and Бакыт only after the first one.
    await assign(upper, azamat, "2026-01-01", "2026-05-31");
    await assign(upper, bakyt, "2026-06-02");
    // Эрмек's last day is the first day of the stay in Нижнее.
    await assign(lower, ermek, "2026-01-01", "2026-06-01");
    const sheepId = await register();
    await move(sheepId, upper, "2026-03-01");
    await move(sheepId, lower, "2026-06-01");
    await move(sheepId, null, "2026-09-01");
    await move(sheepId, upper, "2026-10-01");
    await archiveFlock(await ctx(), { flockId: lower, date: "2026-10-18" });

    const card = await getSheep(await ctx(), { sheepId });

    expect(card?.flock).toEqual(ref(upper, "Верхнее"));
    expect(card?.flocks).toEqual([
      {
        flock: ref(upper, "Верхнее"),
        from: "2026-10-01",
        to: null,
        shepherds: [ref(bakyt, "Бакыт")],
      },
      {
        flock: ref(lower, "Нижнее", true),
        from: "2026-06-01",
        to: "2026-09-01",
        shepherds: [ref(ermek, "Эрмек")],
      },
      {
        flock: ref(upper, "Верхнее"),
        from: "2026-03-01",
        to: "2026-06-01",
        shepherds: [ref(azamat, "Азамат")],
      },
    ]);
  });

  test("of a Sheep that was never in a Flock shows no stay", async () => {
    const { ctx, register } = await setup();
    const sheepId = await register();

    expect(await getSheep(await ctx(), { sheepId })).toMatchObject({ flock: null, flocks: [] });
  });
});

describe("getSheepResponsible", () => {
  test("nobody is responsible for a Sheep in no Flock", async () => {
    const { register, flock, move, responsible } = await setup();
    const never = await register({ tag: "1" });
    const later = await register({ tag: "2" });
    await move(later, await flock("Верхнее"), "2026-06-01");

    expect(await responsible(never, "2026-10-18")).toEqual([]);
    // Before its first move, the Sheep was in no Flock.
    expect(await responsible(later, "2026-05-31")).toEqual([]);
  });

  test("gives the Flock with only the Shepherds whose assignment covers the date", async () => {
    const { register, shepherd, flock, assign, move, responsible } = await setup();
    const upper = await flock("Верхнее");
    const azamat = await shepherd("Азамат");
    const bakyt = await shepherd("Бакыт");
    await assign(upper, azamat, "2026-01-01", "2026-05-31");
    await assign(upper, bakyt, "2026-06-01");
    const sheepId = await register();
    await move(sheepId, upper, "2026-02-01");

    expect(await responsible(sheepId, "2026-04-10")).toEqual([
      { flock: ref(upper, "Верхнее"), shepherds: [ref(azamat, "Азамат")] },
    ]);
    expect(await responsible(sheepId, "2026-07-01")).toEqual([
      { flock: ref(upper, "Верхнее"), shepherds: [ref(bakyt, "Бакыт")] },
    ]);
  });

  test("the first and the last day of an assignment count", async () => {
    const { register, shepherd, flock, assign, move, responsible } = await setup();
    const upper = await flock("Верхнее");
    const azamat = await shepherd("Азамат");
    await assign(upper, azamat, "2026-03-01", "2026-03-31");
    const sheepId = await register();
    await move(sheepId, upper, "2026-01-01");
    const shepherdsOn = async (date: CalendarDate) =>
      (await responsible(sheepId, date)).map((row) => row.shepherds);

    expect(await shepherdsOn("2026-02-28")).toEqual([[]]);
    expect(await shepherdsOn("2026-03-01")).toEqual([[ref(azamat, "Азамат")]]);
    expect(await shepherdsOn("2026-03-31")).toEqual([[ref(azamat, "Азамат")]]);
    expect(await shepherdsOn("2026-04-01")).toEqual([[]]);
  });

  test("on the day of a transfer, the Sheep was in both Flocks, each with its Shepherds", async () => {
    const { register, shepherd, flock, assign, move, responsible } = await setup();
    const upper = await flock("Верхнее");
    const lower = await flock("Нижнее");
    const azamat = await shepherd("Азамат");
    const bakyt = await shepherd("Бакыт");
    await assign(upper, azamat, "2026-01-01");
    await assign(lower, bakyt, "2026-01-01");
    const sheepId = await register();
    await move(sheepId, upper, "2026-02-01");
    await move(sheepId, lower, "2026-05-10");
    const inUpper = { flock: ref(upper, "Верхнее"), shepherds: [ref(azamat, "Азамат")] };
    const inLower = { flock: ref(lower, "Нижнее"), shepherds: [ref(bakyt, "Бакыт")] };

    expect(await responsible(sheepId, "2026-05-09")).toEqual([inUpper]);
    expect(await responsible(sheepId, "2026-05-10")).toEqual([inUpper, inLower]);
    expect(await responsible(sheepId, "2026-05-11")).toEqual([inLower]);
  });

  test("after the Sheep left all Flocks nobody is responsible, but on that day its Flock is", async () => {
    const { store, register, flock, move, responsible } = await setup();
    const upper = await flock("Верхнее");
    const sheepId = await register();
    await move(sheepId, upper, "2026-02-01");
    // A Sheep leaves its Flock before it stops being Active, for example when it dies.
    await move(sheepId, null, "2026-08-01");
    store.sheep.find((s) => s.id === sheepId)!.status = "dead";

    expect(await responsible(sheepId, "2026-08-01")).toEqual([
      { flock: ref(upper, "Верхнее"), shepherds: [] },
    ]);
    expect(await responsible(sheepId, "2026-08-02")).toEqual([]);
  });

  test("an undone move does not count", async () => {
    const { ctx, register, flock, move, responsible } = await setup();
    const upper = await flock("Верхнее");
    const lower = await flock("Нижнее");
    const sheepId = await register();
    await move(sheepId, upper, "2026-02-01");
    await move(sheepId, lower, "2026-09-01");
    await undoFlockMove(await ctx(), { sheepId });
    const inUpper = { flock: ref(upper, "Верхнее"), shepherds: [] };

    expect(await responsible(sheepId, "2026-09-01")).toEqual([inUpper]);
    expect(await responsible(sheepId, "2026-10-01")).toEqual([inUpper]);
  });

  test("an Archived Flock and an Archived Shepherd are still in the answer", async () => {
    const { ctx, register, shepherd, flock, assign, move, responsible } = await setup();
    const upper = await flock("Верхнее");
    const azamat = await shepherd("Азамат");
    await assign(upper, azamat, "2026-01-01");
    const sheepId = await register();
    await move(sheepId, upper, "2026-02-01");
    await move(sheepId, null, "2026-06-01");
    await archiveShepherd(await ctx(), { shepherdId: azamat, date: "2026-07-01" });
    await archiveFlock(await ctx(), { flockId: upper, date: "2026-10-18" });

    expect(await responsible(sheepId, "2026-03-01")).toEqual([
      { flock: ref(upper, "Верхнее", true), shepherds: [ref(azamat, "Азамат", true)] },
    ]);
  });

  test.each(["2026-02-30", "18.10.2026", ""])("%s is not a date", async (date) => {
    const { register, responsible } = await setup();
    const sheepId = await register();

    await expect(responsible(sheepId, date)).rejects.toMatchObject({ code: "sheep.dateInvalid" });
  });

  test("an External, a Deleted, an unknown Sheep or a Sheep of another Farm is not found", async () => {
    const { store, operator, ctx, register, responsible } = await setup();
    const external = await register({ tag: "1" });
    Object.assign(
      store.sheep.find((s) => s.id === external)!,
      {
        origin: "external",
        ownerId: null,
      },
    );
    const deleted = await register({ tag: "2" });
    await deleteSheep(await ctx(), { sheepId: deleted });
    const other = await otherFarm(store, operator);
    const foreign = await registerSheep(await other.ctx(), {
      tag: null,
      name: null,
      sex: "ram",
      birthDate: null,
      notes: null,
      weight: null,
      ownerId: other.ownerId,
      origin: "bought",
      initialEntry: true,
    });

    for (const sheepId of [external, deleted, "unknown" as SheepId, foreign]) {
      await expect(responsible(sheepId, "2026-10-18")).rejects.toMatchObject({
        code: "sheep.notFound",
      });
    }
  });
});

test("a Member of another Farm sees nothing of the Farm", async () => {
  const { store, operator, farmId } = await setup();
  const { stranger } = await otherFarm(store, operator);

  await expect(store.farmContext(stranger, farmId)).rejects.toMatchObject({
    code: "farm.notMember",
  });
});

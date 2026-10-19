import { describe, expect, test } from "vite-plus/test";

import type { CommandContext } from "../context";
import { createFarm } from "../farms/commands";
import type { LocationId, SheepId, ShepherdAssignmentId } from "../ids";
import {
  deleteSheep,
  registerExternalSheep,
  registerSheep,
  type SheepRegistration,
} from "../sheep/commands";
import { InMemoryStore } from "../testing/in-memory";
import {
  archiveFlock,
  archiveLocation,
  archiveShepherd,
  assignShepherd,
  createFlock,
  createLocation,
  createShepherd,
  maxSheepPerMove,
  moveSheep,
  recordFlockMove,
  removeShepherdAssignment,
  unarchiveFlock,
  unarchiveLocation,
  unarchiveShepherd,
  undoFlockMove,
  updateFlock,
  updateLocation,
  updateShepherd,
  updateShepherdAssignment,
} from "./commands";
import { getFlock } from "./queries";

const settings = { currency: "KGS", timeZone: "Asia/Bishkek", lambAgeMonths: 4 };

/**
 * A Farm with an Admin and an Editor. The time is 2026-10-18 18:00 in Bishkek, the time zone of the
 * Farm. `ctx` is the context of the Editor; the helpers make records as the Editor.
 */
async function setup() {
  const store = new InMemoryStore();
  const operator = store.addUser("operator", { operator: true });
  const { farmId } = await createFarm(operator, { name: "Арашан", ...settings });
  const admin = store.addMember("admin", farmId, "admin");
  const editor = store.addMember("editor", farmId, "editor");
  const editorId = store.memberships.at(-1)!.id;
  const as = (user: CommandContext) => store.farmContext(user, farmId);
  const ctx = await as(editor);
  /** Registers an Active Ewe as an Initial entry, with no Tag and no birth date. */
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
  const location = (name = "Кошара") => createLocation(ctx, { name, notes: null });
  const shepherd = (name = "Асан") => createShepherd(ctx, { name, phone: null, notes: null });
  const flock = (name = "Стадо", locationId: LocationId | null = null) =>
    createFlock(ctx, { name, locationId });
  return { store, operator, farmId, admin, editor, as, ctx, register, location, shepherd, flock };
}

/** Another Farm with its Admin, and the context of that Admin. */
async function otherFarm(store: InMemoryStore, operator: CommandContext) {
  const { farmId } = await createFarm(operator, { name: "Другая", ...settings });
  const user = store.addMember("other", farmId, "admin");
  const ownerId = store.memberships.at(-1)!.id;
  return { farmId, user, ownerId, ctx: await store.farmContext(user, farmId) };
}

/** The audit entries that the store gets after this call, as "command Kind id", sorted. */
function auditFrom(store: InMemoryStore) {
  const start = store.audit.length;
  return () =>
    store.audit
      .slice(start)
      .map((e) => `${e.command} ${e.target.kind} ${e.target.id}`)
      .sort();
}

const entries = (...lines: string[]) => lines.sort();

/** A deep copy of plain data, to compare the store before and after a command. */
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const sheepOf = (store: InMemoryStore, id: SheepId) => store.sheep.find((s) => s.id === id)!;
const assignmentOf = (store: InMemoryStore, id: ShepherdAssignmentId) =>
  store.assignments.find((a) => a.id === id)!;

describe("createLocation", () => {
  test("an Editor makes a Location, with an audit entry", async () => {
    const { store, farmId, ctx } = await setup();

    const locationId = await createLocation(ctx, {
      name: "  Летнее   пастбище ",
      notes: "  У реки  ",
    });

    expect(store.locations).toEqual([
      { id: locationId, farmId, name: "Летнее пастбище", notes: "У реки", archivedAt: null },
    ]);
    expect(store.audit.at(-1)).toEqual({
      at: store.time,
      actorId: store.users.find((u) => u.username === "editor")?.id,
      farmId,
      command: "location.create",
      target: { kind: "Location", id: locationId },
    });
  });

  test("empty notes are no notes", async () => {
    const { store, ctx } = await setup();

    await createLocation(ctx, { name: "Кошара", notes: "   " });

    expect(store.locations[0]?.notes).toBeNull();
  });

  test.each([
    [{ name: "" }, "location.nameRequired"],
    [{ name: "   " }, "location.nameRequired"],
    [{ name: "x".repeat(61) }, "location.nameTooLong"],
    [{ notes: "x".repeat(2001) }, "location.notesTooLong"],
  ])("%o fails with %s", async (change, code) => {
    const { store, ctx } = await setup();

    await expect(
      createLocation(ctx, { name: "Кошара", notes: null, ...change }),
    ).rejects.toMatchObject({ code });
    expect(store.locations).toEqual([]);
  });

  test("a name of 60 characters is good", async () => {
    const { ctx } = await setup();

    await expect(createLocation(ctx, { name: "x".repeat(60), notes: null })).resolves.toEqual(
      expect.any(String),
    );
  });

  test.each(["Тёплая кошара", "теплая кошара", "  ТЁПЛАЯ   КОШАРА "])(
    "the name is unique in the Farm: %s is taken by «Тёплая кошара»",
    async (name) => {
      const { store, location } = await setup();
      await location("Тёплая кошара");

      await expect(location(name)).rejects.toMatchObject({ code: "location.nameTaken" });
      expect(store.locations).toHaveLength(1);
    },
  );

  test("the name of an Archived Location stays taken", async () => {
    const { ctx, location } = await setup();
    const locationId = await location("Кошара");
    await archiveLocation(ctx, { locationId });

    await expect(location("Кошара")).rejects.toMatchObject({ code: "location.nameTaken" });
  });

  test("the name of a Location of another Farm is free", async () => {
    const { store, operator, location } = await setup();
    const other = await otherFarm(store, operator);
    await createLocation(other.ctx, { name: "Кошара", notes: null });

    await expect(location("Кошара")).resolves.toEqual(expect.any(String));
  });
});

describe("updateLocation", () => {
  test("changes the name and the notes, with an audit entry", async () => {
    const { store, ctx, location } = await setup();
    const locationId = await location("Кошара");
    const log = auditFrom(store);

    await updateLocation(ctx, { locationId, name: "Зимняя кошара", notes: "Крыша течёт" });

    expect(store.locations[0]).toMatchObject({ name: "Зимняя кошара", notes: "Крыша течёт" });
    expect(log()).toEqual([`location.update Location ${locationId}`]);
  });

  test("keeps its own name in another case, but cannot take the name of another Location", async () => {
    const { store, ctx, location } = await setup();
    const locationId = await location("Кошара");
    await location("Загон");

    await updateLocation(ctx, { locationId, name: "КОШАРА", notes: null });
    expect(store.locations[0]?.name).toBe("КОШАРА");

    await expect(
      updateLocation(ctx, { locationId, name: "загон", notes: null }),
    ).rejects.toMatchObject({ code: "location.nameTaken" });
  });

  test("an unknown Location is not found", async () => {
    const { ctx } = await setup();

    await expect(
      updateLocation(ctx, { locationId: "nowhere" as LocationId, name: "Кошара", notes: null }),
    ).rejects.toMatchObject({ code: "location.notFound" });
  });
});

describe("archiveLocation", () => {
  test("archives the Location and takes it out of the archive, with audit entries", async () => {
    const { store, ctx, location } = await setup();
    const locationId = await location();
    const log = auditFrom(store);

    await archiveLocation(ctx, { locationId });
    expect(store.locations[0]?.archivedAt).toBe(store.time);

    await unarchiveLocation(ctx, { locationId });
    expect(store.locations[0]?.archivedAt).toBeNull();
    expect(log()).toEqual(
      entries(
        `location.archive Location ${locationId}`,
        `location.unarchive Location ${locationId}`,
      ),
    );
  });

  test("a Location of a Flock cannot be archived, but the Location of an Archived Flock can", async () => {
    const { store, ctx, location, flock } = await setup();
    const locationId = await location();
    const flockId = await flock("Стадо", locationId);

    await expect(archiveLocation(ctx, { locationId })).rejects.toMatchObject({
      code: "location.inUse",
    });
    expect(store.locations[0]?.archivedAt).toBeNull();

    await archiveFlock(ctx, { flockId, date: "2026-10-18" });
    await archiveLocation(ctx, { locationId });
    expect(store.locations[0]?.archivedAt).toBe(store.time);
  });
});

describe("createShepherd", () => {
  test("an Editor adds a Shepherd, with an audit entry", async () => {
    const { store, farmId, ctx } = await setup();

    const shepherdId = await createShepherd(ctx, {
      name: "  Асан   Токтогулов ",
      phone: " +996 555 123 456 ",
      notes: " Хорошо стрижёт ",
    });

    expect(store.shepherds).toEqual([
      {
        id: shepherdId,
        farmId,
        name: "Асан Токтогулов",
        phone: "+996 555 123 456",
        notes: "Хорошо стрижёт",
        archivedAt: null,
      },
    ]);
    expect(store.audit.at(-1)).toMatchObject({
      command: "shepherd.create",
      target: { kind: "Shepherd", id: shepherdId },
    });
  });

  test("two Shepherds can have the same name", async () => {
    const { store, shepherd } = await setup();

    await shepherd("Асан");
    await shepherd("асан");

    expect(store.shepherds.map((s) => s.name)).toEqual(["Асан", "асан"]);
  });

  test.each([
    [{ name: " " }, "shepherd.nameRequired"],
    [{ name: "x".repeat(61) }, "shepherd.nameTooLong"],
    [{ phone: "1".repeat(31) }, "shepherd.phoneTooLong"],
    [{ notes: "x".repeat(2001) }, "shepherd.notesTooLong"],
  ])("%o fails with %s", async (change, code) => {
    const { store, ctx } = await setup();

    await expect(
      createShepherd(ctx, { name: "Асан", phone: null, notes: null, ...change }),
    ).rejects.toMatchObject({ code });
    expect(store.shepherds).toEqual([]);
  });
});

describe("updateShepherd", () => {
  test("changes the name, the phone and the notes, with an audit entry", async () => {
    const { store, ctx, shepherd } = await setup();
    const shepherdId = await shepherd("Асан");
    const log = auditFrom(store);

    await updateShepherd(ctx, { shepherdId, name: "Бакыт", phone: "0555", notes: "Новый" });

    expect(store.shepherds[0]).toMatchObject({ name: "Бакыт", phone: "0555", notes: "Новый" });
    expect(log()).toEqual([`shepherd.update Shepherd ${shepherdId}`]);
  });

  test("an unknown Shepherd is not found", async () => {
    const { ctx } = await setup();

    await expect(
      updateShepherd(ctx, {
        shepherdId: "nobody" as never,
        name: "Асан",
        phone: null,
        notes: null,
      }),
    ).rejects.toMatchObject({ code: "shepherd.notFound" });
  });
});

describe("archiveShepherd", () => {
  test("ends the open assignments on the date, with an entry for the Shepherd and each Flock", async () => {
    const { store, ctx, shepherd, flock } = await setup();
    const shepherdId = await shepherd();
    const [a, b, c] = [await flock("А"), await flock("Б"), await flock("В")];
    const openA = await assignShepherd(ctx, {
      flockId: a,
      shepherdId,
      from: "2026-09-01",
      to: null,
    });
    const openB = await assignShepherd(ctx, {
      flockId: b,
      shepherdId,
      from: "2026-10-01",
      to: null,
    });
    const closedC = await assignShepherd(ctx, {
      flockId: c,
      shepherdId,
      from: "2026-01-01",
      to: "2026-02-01",
    });
    const log = auditFrom(store);

    await archiveShepherd(ctx, { shepherdId, date: "2026-10-15" });

    expect(store.shepherds[0]?.archivedAt).toBe(store.time);
    expect(assignmentOf(store, openA)).toMatchObject({ from: "2026-09-01", to: "2026-10-15" });
    expect(assignmentOf(store, openB)).toMatchObject({ from: "2026-10-01", to: "2026-10-15" });
    expect(assignmentOf(store, closedC)).toMatchObject({ from: "2026-01-01", to: "2026-02-01" });
    expect(log()).toEqual(
      entries(
        `shepherd.archive Shepherd ${shepherdId}`,
        `shepherd.archive Flock ${a}`,
        `shepherd.archive Flock ${b}`,
      ),
    );
  });

  test("the date is a real date, not in the future and not before the start of an open assignment", async () => {
    const { store, ctx, shepherd, flock } = await setup();
    const shepherdId = await shepherd();
    const assignmentId = await assignShepherd(ctx, {
      flockId: await flock(),
      shepherdId,
      from: "2026-09-01",
      to: null,
    });
    const log = auditFrom(store);

    for (const date of ["2026-10-19", "2026-08-31", "2026-02-30"]) {
      await expect(archiveShepherd(ctx, { shepherdId, date })).rejects.toMatchObject({
        code: "flock.endDateInvalid",
      });
    }
    expect(store.shepherds[0]?.archivedAt).toBeNull();
    expect(assignmentOf(store, assignmentId).to).toBeNull();
    expect(log()).toEqual([]);

    // The first day of the assignment is good: the Shepherd herded the Flock for one day.
    await archiveShepherd(ctx, { shepherdId, date: "2026-09-01" });
    expect(assignmentOf(store, assignmentId).to).toBe("2026-09-01");
  });

  test("unarchiveShepherd takes the Shepherd out of the archive, and the ended assignments stay ended", async () => {
    const { store, ctx, shepherd, flock } = await setup();
    const shepherdId = await shepherd();
    const assignmentId = await assignShepherd(ctx, {
      flockId: await flock(),
      shepherdId,
      from: "2026-09-01",
      to: null,
    });
    await archiveShepherd(ctx, { shepherdId, date: "2026-10-01" });
    const log = auditFrom(store);

    await unarchiveShepherd(ctx, { shepherdId });

    expect(store.shepherds[0]?.archivedAt).toBeNull();
    expect(assignmentOf(store, assignmentId).to).toBe("2026-10-01");
    expect(log()).toEqual([`shepherd.unarchive Shepherd ${shepherdId}`]);
  });
});

describe("createFlock", () => {
  test("an Editor makes a Flock at a Location, with an audit entry", async () => {
    const { store, farmId, ctx, location } = await setup();
    const locationId = await location();

    const flockId = await createFlock(ctx, { name: "  Маточное   стадо ", locationId });

    expect(store.flocks).toEqual([
      { id: flockId, farmId, name: "Маточное стадо", locationId, archivedAt: null },
    ]);
    expect(store.audit.at(-1)).toMatchObject({
      command: "flock.create",
      target: { kind: "Flock", id: flockId },
    });
  });

  test("a Flock needs no Location", async () => {
    const { store, flock } = await setup();

    await flock("Стадо", null);

    expect(store.flocks[0]?.locationId).toBeNull();
  });

  test.each([
    ["", "flock.nameRequired"],
    ["   ", "flock.nameRequired"],
    ["x".repeat(61), "flock.nameTooLong"],
  ])("the name %j fails with %s", async (name, code) => {
    const { store, flock } = await setup();

    await expect(flock(name)).rejects.toMatchObject({ code });
    expect(store.flocks).toEqual([]);
  });

  test.each(["Ёлочное", "елочное", " ЁЛОЧНОЕ "])(
    "the name is unique in the Farm, also among the Archived Flocks: %s is taken by «Ёлочное»",
    async (name) => {
      const { store, ctx, flock } = await setup();
      const flockId = await flock("Ёлочное");
      await archiveFlock(ctx, { flockId, date: "2026-10-18" });

      await expect(flock(name)).rejects.toMatchObject({ code: "flock.nameTaken" });
      expect(store.flocks).toHaveLength(1);
    },
  );

  test("the Location is not Archived and is a Location of the Farm", async () => {
    const { store, operator, ctx, location, flock } = await setup();
    const archived = await location("Старая кошара");
    await archiveLocation(ctx, { locationId: archived });
    const other = await otherFarm(store, operator);
    const foreign = await createLocation(other.ctx, { name: "Чужая", notes: null });

    await expect(flock("А", archived)).rejects.toMatchObject({ code: "location.archived" });
    await expect(flock("Б", foreign)).rejects.toMatchObject({ code: "location.notFound" });
    await expect(flock("В", "nowhere" as LocationId)).rejects.toMatchObject({
      code: "location.notFound",
    });
    expect(store.flocks).toEqual([]);
  });
});

describe("updateFlock", () => {
  test("changes the name and the Location, with an audit entry", async () => {
    const { store, ctx, location, flock } = await setup();
    const flockId = await flock("Стадо", await location("Кошара"));
    const locationId = await location("Пастбище");
    const log = auditFrom(store);

    await updateFlock(ctx, { flockId, name: "Отара Асана", locationId });

    expect(store.flocks[0]).toMatchObject({ name: "Отара Асана", locationId });
    expect(log()).toEqual([`flock.update Flock ${flockId}`]);
  });

  test("keeps its own name in another case, but cannot take the name of another Flock", async () => {
    const { store, ctx, flock } = await setup();
    const flockId = await flock("Стадо");
    await flock("Ягнята");

    await updateFlock(ctx, { flockId, name: "СТАДО", locationId: null });
    expect(store.flocks[0]?.name).toBe("СТАДО");

    await expect(
      updateFlock(ctx, { flockId, name: "ягнята", locationId: null }),
    ).rejects.toMatchObject({ code: "flock.nameTaken" });
  });

  test("the new Location is not Archived", async () => {
    const { store, ctx, location, flock } = await setup();
    const flockId = await flock();
    const locationId = await location();
    await archiveLocation(ctx, { locationId });

    await expect(updateFlock(ctx, { flockId, name: "Стадо", locationId })).rejects.toMatchObject({
      code: "location.archived",
    });
    expect(store.flocks[0]?.locationId).toBeNull();
  });

  test("an unknown Flock is not found", async () => {
    const { ctx } = await setup();

    await expect(
      updateFlock(ctx, { flockId: "none" as never, name: "Стадо", locationId: null }),
    ).rejects.toMatchObject({ code: "flock.notFound" });
  });
});

describe("archiveFlock", () => {
  test("a Flock with Sheep cannot be archived; after its Sheep leave, it can", async () => {
    const { store, ctx, register, flock } = await setup();
    const flockId = await flock();
    const sheepId = await register();
    await moveSheep(ctx, { sheepIds: [sheepId], flockId, date: "2026-10-01" });

    await expect(archiveFlock(ctx, { flockId, date: "2026-10-18" })).rejects.toMatchObject({
      code: "flock.notEmpty",
    });
    expect(store.flocks[0]?.archivedAt).toBeNull();

    await moveSheep(ctx, { sheepIds: [sheepId], flockId: null, date: "2026-10-18" });
    await archiveFlock(ctx, { flockId, date: "2026-10-18" });
    expect(store.flocks[0]?.archivedAt).toBe(store.time);
  });

  test("ends the open assignments on the date, with an entry for the Flock and each Shepherd", async () => {
    const { store, ctx, shepherd, flock } = await setup();
    const flockId = await flock();
    const [s1, s2, s3] = [
      await shepherd("Асан"),
      await shepherd("Бакыт"),
      await shepherd("Нурлан"),
    ];
    const open1 = await assignShepherd(ctx, {
      flockId,
      shepherdId: s1,
      from: "2026-09-01",
      to: null,
    });
    const open2 = await assignShepherd(ctx, {
      flockId,
      shepherdId: s2,
      from: "2026-10-01",
      to: null,
    });
    const closed = await assignShepherd(ctx, {
      flockId,
      shepherdId: s3,
      from: "2026-01-01",
      to: "2026-02-01",
    });
    const log = auditFrom(store);

    await archiveFlock(ctx, { flockId, date: "2026-10-18" });

    expect(assignmentOf(store, open1).to).toBe("2026-10-18");
    expect(assignmentOf(store, open2).to).toBe("2026-10-18");
    expect(assignmentOf(store, closed).to).toBe("2026-02-01");
    expect(log()).toEqual(
      entries(
        `flock.archive Flock ${flockId}`,
        `flock.archive Shepherd ${s1}`,
        `flock.archive Shepherd ${s2}`,
      ),
    );
  });

  test("the date is a real date, not in the future and not before the start of an open assignment", async () => {
    const { store, ctx, shepherd, flock } = await setup();
    const flockId = await flock();
    const assignmentId = await assignShepherd(ctx, {
      flockId,
      shepherdId: await shepherd(),
      from: "2026-09-01",
      to: null,
    });
    const log = auditFrom(store);

    for (const date of ["2026-10-19", "2026-08-31", "18.10.2026"]) {
      await expect(archiveFlock(ctx, { flockId, date })).rejects.toMatchObject({
        code: "flock.endDateInvalid",
      });
    }
    expect(store.flocks[0]?.archivedAt).toBeNull();
    expect(assignmentOf(store, assignmentId).to).toBeNull();
    expect(log()).toEqual([]);
  });
});

describe("unarchiveFlock", () => {
  test("takes the Flock out of the archive, and the ended assignments stay ended", async () => {
    const { store, ctx, shepherd, flock } = await setup();
    const flockId = await flock();
    const assignmentId = await assignShepherd(ctx, {
      flockId,
      shepherdId: await shepherd(),
      from: "2026-09-01",
      to: null,
    });
    await archiveFlock(ctx, { flockId, date: "2026-10-01" });
    const log = auditFrom(store);

    await unarchiveFlock(ctx, { flockId });

    expect(store.flocks[0]?.archivedAt).toBeNull();
    expect(assignmentOf(store, assignmentId).to).toBe("2026-10-01");
    expect(log()).toEqual([`flock.unarchive Flock ${flockId}`]);
  });

  test("a Flock whose Location is Archived now stays in the archive", async () => {
    const { store, ctx, location, flock } = await setup();
    const locationId = await location();
    const flockId = await flock("Стадо", locationId);
    await archiveFlock(ctx, { flockId, date: "2026-10-18" });
    await archiveLocation(ctx, { locationId });

    await expect(unarchiveFlock(ctx, { flockId })).rejects.toMatchObject({
      code: "location.archived",
    });
    expect(store.flocks[0]?.archivedAt).not.toBeNull();

    // With no Location, the Flock comes out of the archive.
    await updateFlock(ctx, { flockId, name: "Стадо", locationId: null });
    await unarchiveFlock(ctx, { flockId });
    expect(store.flocks[0]?.archivedAt).toBeNull();
  });
});

describe("assignShepherd", () => {
  test("assigns a Shepherd to a Flock, with an audit entry for both", async () => {
    const { store, farmId, ctx, shepherd, flock } = await setup();
    const flockId = await flock();
    const shepherdId = await shepherd();
    const log = auditFrom(store);

    const assignmentId = await assignShepherd(ctx, {
      flockId,
      shepherdId,
      from: "2026-09-01",
      to: "2026-09-30",
    });

    expect(store.assignments).toEqual([
      { id: assignmentId, farmId, flockId, shepherdId, from: "2026-09-01", to: "2026-09-30" },
    ]);
    expect(log()).toEqual(
      entries(
        `flock.assignShepherd Flock ${flockId}`,
        `flock.assignShepherd Shepherd ${shepherdId}`,
      ),
    );
  });

  test("an assignment of one day, and an open one, are good", async () => {
    const { store, ctx, shepherd, flock } = await setup();
    const flockId = await flock();
    const shepherdId = await shepherd();

    await assignShepherd(ctx, { flockId, shepherdId, from: "2026-09-01", to: "2026-09-01" });
    await assignShepherd(ctx, { flockId, shepherdId, from: "2026-10-18", to: null });

    expect(store.assignments.map((a) => [a.from, a.to])).toEqual([
      ["2026-09-01", "2026-09-01"],
      ["2026-10-18", null],
    ]);
  });

  test("an Archived Flock and an Archived Shepherd get no assignment", async () => {
    const { store, ctx, shepherd, flock } = await setup();
    const archivedFlock = await flock("Старое");
    await archiveFlock(ctx, { flockId: archivedFlock, date: "2026-10-18" });
    const archivedShepherd = await shepherd("Ушёл");
    await archiveShepherd(ctx, { shepherdId: archivedShepherd, date: "2026-10-18" });
    const dates = { from: "2026-09-01", to: null };

    await expect(
      assignShepherd(ctx, { flockId: archivedFlock, shepherdId: await shepherd(), ...dates }),
    ).rejects.toMatchObject({ code: "flock.archived" });
    await expect(
      assignShepherd(ctx, { flockId: await flock(), shepherdId: archivedShepherd, ...dates }),
    ).rejects.toMatchObject({ code: "shepherd.archived" });
    expect(store.assignments).toEqual([]);
  });

  test.each([
    { from: "2026-10-19", to: null },
    { from: "2026-09-01", to: "2026-10-19" },
    { from: "2026-09-01", to: "2026-08-31" },
    { from: "2026-02-30", to: null },
    { from: "2026-09-01", to: "" },
  ])("the dates %o fail", async (dates) => {
    const { store, ctx, shepherd, flock } = await setup();

    await expect(
      assignShepherd(ctx, { flockId: await flock(), shepherdId: await shepherd(), ...dates }),
    ).rejects.toMatchObject({ code: "flock.assignmentDatesInvalid" });
    expect(store.assignments).toEqual([]);
  });

  test("today in the time zone of the Farm is not in the future", async () => {
    const { store, ctx, shepherd, flock } = await setup();
    // 20:00 UTC is already October 19 in Bishkek.
    store.time = Date.UTC(2026, 9, 18, 20);

    await expect(
      assignShepherd(ctx, {
        flockId: await flock(),
        shepherdId: await shepherd(),
        from: "2026-10-19",
        to: null,
      }),
    ).resolves.toEqual(expect.any(String));
  });

  test.each([
    [{ from: "2026-03-31", to: "2026-04-10" }, true],
    [{ from: "2026-02-01", to: "2026-03-01" }, true],
    [{ from: "2026-01-01", to: null }, true],
    [{ from: "2026-04-01", to: null }, false],
    [{ from: "2026-01-01", to: "2026-02-28" }, false],
  ])(
    "two assignments of one Shepherd to one Flock do not overlap: March and %o, overlap %s",
    async (dates, overlaps) => {
      const { ctx, shepherd, flock } = await setup();
      const flockId = await flock();
      const shepherdId = await shepherd();
      await assignShepherd(ctx, { flockId, shepherdId, from: "2026-03-01", to: "2026-03-31" });

      const assign = assignShepherd(ctx, { flockId, shepherdId, ...dates });

      if (overlaps) {
        await expect(assign).rejects.toMatchObject({ code: "flock.assignmentOverlaps" });
      } else {
        await expect(assign).resolves.toEqual(expect.any(String));
      }
    },
  );

  test("a Shepherd herds two Flocks at one time, and a Flock has two Shepherds at one time", async () => {
    const { store, ctx, shepherd, flock } = await setup();
    const [a, b] = [await flock("А"), await flock("Б")];
    const [s1, s2] = [await shepherd("Асан"), await shepherd("Бакыт")];
    const dates = { from: "2026-09-01", to: null };

    await assignShepherd(ctx, { flockId: a, shepherdId: s1, ...dates });
    await assignShepherd(ctx, { flockId: b, shepherdId: s1, ...dates });
    await assignShepherd(ctx, { flockId: a, shepherdId: s2, ...dates });

    expect(store.assignments).toHaveLength(3);
  });
});

describe("updateShepherdAssignment", () => {
  test("changes the dates, with an audit entry for the Flock and the Shepherd", async () => {
    const { store, ctx, shepherd, flock } = await setup();
    const flockId = await flock();
    const shepherdId = await shepherd();
    const assignmentId = await assignShepherd(ctx, {
      flockId,
      shepherdId,
      from: "2026-09-01",
      to: null,
    });
    const log = auditFrom(store);

    await updateShepherdAssignment(ctx, { assignmentId, from: "2026-08-15", to: "2026-10-10" });

    expect(assignmentOf(store, assignmentId)).toMatchObject({
      from: "2026-08-15",
      to: "2026-10-10",
    });
    expect(log()).toEqual(
      entries(
        `flock.updateAssignment Flock ${flockId}`,
        `flock.updateAssignment Shepherd ${shepherdId}`,
      ),
    );
  });

  test("checks the dates, and does not overlap another assignment of the Shepherd to the Flock", async () => {
    const { store, ctx, shepherd, flock } = await setup();
    const flockId = await flock();
    const shepherdId = await shepherd();
    await assignShepherd(ctx, { flockId, shepherdId, from: "2026-03-01", to: "2026-03-31" });
    const assignmentId = await assignShepherd(ctx, {
      flockId,
      shepherdId,
      from: "2026-05-01",
      to: "2026-05-31",
    });

    await expect(
      updateShepherdAssignment(ctx, { assignmentId, from: "2026-05-01", to: "2026-04-30" }),
    ).rejects.toMatchObject({ code: "flock.assignmentDatesInvalid" });
    await expect(
      updateShepherdAssignment(ctx, { assignmentId, from: "2026-03-31", to: "2026-05-31" }),
    ).rejects.toMatchObject({ code: "flock.assignmentOverlaps" });
    // Its own old dates do not count as an overlap.
    await updateShepherdAssignment(ctx, { assignmentId, from: "2026-04-01", to: "2026-05-20" });
    expect(assignmentOf(store, assignmentId)).toMatchObject({
      from: "2026-04-01",
      to: "2026-05-20",
    });
  });

  test("an assignment of an Archived Shepherd or an Archived Flock cannot go on to now", async () => {
    const { store, ctx, shepherd, flock } = await setup();
    const shepherdId = await shepherd("Ушёл");
    const ofShepherd = await assignShepherd(ctx, {
      flockId: await flock("А"),
      shepherdId,
      from: "2026-09-01",
      to: null,
    });
    await archiveShepherd(ctx, { shepherdId, date: "2026-10-01" });
    const flockId = await flock("Б");
    const ofFlock = await assignShepherd(ctx, {
      flockId,
      shepherdId: await shepherd("Асан"),
      from: "2026-09-01",
      to: null,
    });
    await archiveFlock(ctx, { flockId, date: "2026-10-01" });

    await expect(
      updateShepherdAssignment(ctx, { assignmentId: ofShepherd, from: "2026-09-01", to: null }),
    ).rejects.toMatchObject({ code: "shepherd.archived" });
    await expect(
      updateShepherdAssignment(ctx, { assignmentId: ofFlock, from: "2026-09-01", to: null }),
    ).rejects.toMatchObject({ code: "flock.archived" });
    expect(assignmentOf(store, ofShepherd).to).toBe("2026-10-01");
    expect(assignmentOf(store, ofFlock).to).toBe("2026-10-01");

    // Its last day can still change.
    await updateShepherdAssignment(ctx, {
      assignmentId: ofShepherd,
      from: "2026-09-01",
      to: "2026-10-05",
    });
    expect(assignmentOf(store, ofShepherd).to).toBe("2026-10-05");
  });

  test("an unknown assignment is not found", async () => {
    const { ctx } = await setup();

    await expect(
      updateShepherdAssignment(ctx, {
        assignmentId: "none" as ShepherdAssignmentId,
        from: "2026-09-01",
        to: null,
      }),
    ).rejects.toMatchObject({ code: "flock.assignmentNotFound" });
  });
});

describe("removeShepherdAssignment", () => {
  test("makes the assignment Deleted: the reads hide it, with an audit entry for the Flock and the Shepherd", async () => {
    const { store, ctx, shepherd, flock } = await setup();
    const flockId = await flock();
    const shepherdId = await shepherd();
    const assignmentId = await assignShepherd(ctx, {
      flockId,
      shepherdId,
      from: "2026-09-01",
      to: null,
    });
    const log = auditFrom(store);

    await removeShepherdAssignment(ctx, { assignmentId });

    expect(assignmentOf(store, assignmentId).deletedAt).toBe(store.time);
    expect(log()).toEqual(
      entries(
        `flock.removeAssignment Flock ${flockId}`,
        `flock.removeAssignment Shepherd ${shepherdId}`,
      ),
    );
    const card = await getFlock(ctx, { flockId });
    expect(card?.assignments).toEqual([]);
    expect(card?.shepherds).toEqual([]);
    await expect(removeShepherdAssignment(ctx, { assignmentId })).rejects.toMatchObject({
      code: "flock.assignmentNotFound",
    });
    // A Deleted assignment does not overlap a new one.
    await expect(
      assignShepherd(ctx, { flockId, shepherdId, from: "2026-09-01", to: null }),
    ).resolves.toEqual(expect.any(String));
  });
});

describe("moveSheep", () => {
  test("moves a Sheep into a Flock, with the move and an audit entry", async () => {
    const { store, ctx, register, flock } = await setup();
    const flockId = await flock();
    const sheepId = await register();
    const log = auditFrom(store);

    const result = await moveSheep(ctx, { sheepIds: [sheepId], flockId, date: "2026-10-01" });

    expect(result).toEqual({ moved: 1 });
    expect(sheepOf(store, sheepId).flockId).toBe(flockId);
    expect(store.flockMoves).toEqual([
      { id: expect.any(String), sheepId, flockId, date: "2026-10-01", at: store.time },
    ]);
    expect(log()).toEqual([`sheep.move Sheep ${sheepId}`]);
  });

  test("an Admin and an Editor can move Sheep", async () => {
    const { store, admin, editor, as, register, flock } = await setup();
    const flockId = await flock();

    for (const user of [admin, editor]) {
      const sheepId = await register();
      await moveSheep(await as(user), { sheepIds: [sheepId], flockId, date: "2026-10-18" });
      expect(sheepOf(store, sheepId).flockId).toBe(flockId);
    }
  });

  test("a bulk move of 50 Sheep is one command and writes one audit entry for each Sheep", async () => {
    const { store, ctx, register, flock } = await setup();
    const flockId = await flock();
    const sheepIds: SheepId[] = [];
    for (let i = 1; i <= 50; i++) sheepIds.push(await register({ tag: String(i) }));
    const start = store.audit.length;

    const result = await moveSheep(ctx, { sheepIds, flockId, date: "2026-10-18" });

    expect(result).toEqual({ moved: 50 });
    const audit = store.audit.slice(start);
    expect(audit).toHaveLength(50);
    expect(audit.every((e) => e.command === "sheep.move" && e.target.kind === "Sheep")).toBe(true);
    expect(new Set(audit.map((e) => e.target.id))).toEqual(new Set(sheepIds));
    expect(store.flockMoves).toHaveLength(50);
    expect(new Set(store.flockMoves.map((m) => m.sheepId))).toEqual(new Set(sheepIds));
    expect(store.flockMoves.every((m) => m.flockId === flockId && m.date === "2026-10-18")).toBe(
      true,
    );
    expect(sheepIds.every((id) => sheepOf(store, id).flockId === flockId)).toBe(true);
  });

  test("moves a Sheep out of all Flocks", async () => {
    const { store, ctx, register, flock } = await setup();
    const sheepId = await register();
    await moveSheep(ctx, { sheepIds: [sheepId], flockId: await flock(), date: "2026-10-01" });

    await moveSheep(ctx, { sheepIds: [sheepId], flockId: null, date: "2026-10-18" });

    expect(sheepOf(store, sheepId).flockId).toBeNull();
    expect(store.flockMoves.at(-1)).toMatchObject({ sheepId, flockId: null, date: "2026-10-18" });
  });

  test("a Sheep that is in the Flock already stays as it is, and does not count", async () => {
    const { store, ctx, register, flock } = await setup();
    const flockId = await flock();
    const inFlock = await register();
    const outside = await register();
    await moveSheep(ctx, { sheepIds: [inFlock], flockId, date: "2026-10-01" });
    const log = auditFrom(store);

    const result = await moveSheep(ctx, {
      sheepIds: [inFlock, outside],
      flockId,
      date: "2026-10-18",
    });

    expect(result).toEqual({ moved: 1 });
    expect(store.flockMoves.filter((m) => m.sheepId === inFlock)).toHaveLength(1);
    expect(log()).toEqual([`sheep.move Sheep ${outside}`]);
  });

  test("a Sheep that is twice in the list moves one time", async () => {
    const { store, ctx, register, flock } = await setup();
    const sheepId = await register();
    const flockId = await flock();
    const log = auditFrom(store);

    const result = await moveSheep(ctx, {
      sheepIds: [sheepId, sheepId, sheepId],
      flockId,
      date: "2026-10-18",
    });

    expect(result).toEqual({ moved: 1 });
    expect(store.flockMoves).toHaveLength(1);
    expect(log()).toEqual([`sheep.move Sheep ${sheepId}`]);
  });

  test(`one command moves at most ${maxSheepPerMove} Sheep, and a Sheep twice in the list counts once`, async () => {
    const { ctx, flock } = await setup();
    const flockId = await flock();
    const ids = (count: number) =>
      Array.from({ length: count }, (_, i) => `sheep-unknown-${i}` as SheepId);

    await expect(
      moveSheep(ctx, { sheepIds: ids(maxSheepPerMove + 1), flockId, date: "2026-10-18" }),
    ).rejects.toMatchObject({ code: "sheep.tooManyToMove" });
    // With a duplicate, the list has one item too many but not one Sheep too many: the command
    // goes on to the Sheep, which are unknown.
    const withDuplicate = [...ids(maxSheepPerMove), ids(1)[0]!];
    await expect(
      moveSheep(ctx, { sheepIds: withDuplicate, flockId, date: "2026-10-18" }),
    ).rejects.toMatchObject({ code: "sheep.notFound" });
  });

  test("an unknown, an External, a Deleted Sheep and a Sheep of another Farm are not found", async () => {
    const { store, operator, ctx, register, flock } = await setup();
    const flockId = await flock();
    const external = await register();
    Object.assign(sheepOf(store, external), { origin: "external", ownerId: null });
    const deleted = await register();
    await deleteSheep(ctx, { sheepId: deleted });
    const other = await otherFarm(store, operator);
    const foreign = await registerSheep(other.ctx, {
      tag: null,
      name: null,
      sex: "ram",
      birthDate: null,
      notes: null,
      weight: null,
      ownerId: other.ownerId,
      origin: "born",
      initialEntry: true,
    });

    for (const sheepId of ["unknown" as SheepId, external, deleted, foreign]) {
      await expect(
        moveSheep(ctx, { sheepIds: [sheepId], flockId, date: "2026-10-18" }),
      ).rejects.toMatchObject({ code: "sheep.notFound" });
    }
    expect(store.flockMoves).toEqual([]);
  });

  test.each(["sold", "slaughtered", "dead", "lost"] as const)(
    "a %s Sheep does not move",
    async (status) => {
      const { store, ctx, register, flock } = await setup();
      const sheepId = await register();
      sheepOf(store, sheepId).status = status;

      await expect(
        moveSheep(ctx, { sheepIds: [sheepId], flockId: await flock(), date: "2026-10-18" }),
      ).rejects.toMatchObject({ code: "sheep.notActive" });
    },
  );

  test("the Flock is a Flock of the Farm and is not Archived", async () => {
    const { store, ctx, register, flock } = await setup();
    const sheepId = await register();
    const archived = await flock("Старое");
    await archiveFlock(ctx, { flockId: archived, date: "2026-10-18" });

    await expect(
      moveSheep(ctx, { sheepIds: [sheepId], flockId: archived, date: "2026-10-18" }),
    ).rejects.toMatchObject({ code: "flock.archived" });
    await expect(
      moveSheep(ctx, { sheepIds: [sheepId], flockId: "none" as never, date: "2026-10-18" }),
    ).rejects.toMatchObject({ code: "flock.notFound" });
    expect(store.flockMoves).toEqual([]);
  });

  test("the date is not in the future, not before the birth and not before the last move", async () => {
    const { store, ctx, register, flock } = await setup();
    const sheepId = await register({ birthDate: "2026-03-01" });
    const [a, b] = [await flock("А"), await flock("Б")];
    await moveSheep(ctx, { sheepIds: [sheepId], flockId: a, date: "2026-06-01" });

    for (const date of ["2026-10-19", "2026-02-28", "2026-05-31"]) {
      await expect(moveSheep(ctx, { sheepIds: [sheepId], flockId: b, date })).rejects.toMatchObject(
        { code: "sheep.moveDateInvalid" },
      );
    }
    await expect(
      moveSheep(ctx, { sheepIds: [sheepId], flockId: b, date: "2026-02-30" }),
    ).rejects.toMatchObject({ code: "sheep.dateInvalid" });
    // The same day as the last move is good.
    await moveSheep(ctx, { sheepIds: [sheepId], flockId: b, date: "2026-06-01" });
    expect(sheepOf(store, sheepId).flockId).toBe(b);
  });

  test("today is the date in the time zone of the Farm", async () => {
    const { store, ctx, register, flock } = await setup();
    const sheepId = await register();
    // 20:00 UTC is already October 19 in Bishkek.
    store.time = Date.UTC(2026, 9, 18, 20);

    await moveSheep(ctx, { sheepIds: [sheepId], flockId: await flock(), date: "2026-10-19" });

    expect(store.flockMoves.at(-1)?.date).toBe("2026-10-19");
  });

  test("a Sheep that is not Active fails a move out of all Flocks too", async () => {
    const { store, ctx, register, flock } = await setup();
    const inFlock = await register();
    await moveSheep(ctx, { sheepIds: [inFlock], flockId: await flock(), date: "2026-10-01" });
    const sold = await register();
    sheepOf(store, sold).status = "sold";
    const moves = copy(store.flockMoves);
    const audit = copy(store.audit);

    await expect(
      moveSheep(ctx, { sheepIds: [inFlock, sold], flockId: null, date: "2026-10-18" }),
    ).rejects.toMatchObject({ code: "sheep.notActive" });
    await expect(
      moveSheep(ctx, { sheepIds: [sold], flockId: null, date: "2026-10-18" }),
    ).rejects.toMatchObject({ code: "sheep.notActive" });

    expect(store.flockMoves).toEqual(moves);
    expect(store.audit).toEqual(audit);
    expect(sheepOf(store, inFlock).flockId).not.toBeNull();
  });

  test("if one Sheep cannot move, no Sheep moves", async () => {
    const { store, ctx, register, flock } = await setup();
    const flockId = await flock();
    const good = await register();
    const dead = await register();
    sheepOf(store, dead).status = "dead";
    const late = await register();
    await moveSheep(ctx, { sheepIds: [late], flockId: await flock("Б"), date: "2026-10-18" });
    const moves = copy(store.flockMoves);
    const audit = copy(store.audit);

    for (const [sheepIds, date, code] of [
      [[good, dead], "2026-10-18", "sheep.notActive"],
      [[good, "unknown" as SheepId], "2026-10-18", "sheep.notFound"],
      [[good, late], "2026-10-17", "sheep.moveDateInvalid"],
    ] as const) {
      await expect(moveSheep(ctx, { sheepIds, flockId, date })).rejects.toMatchObject({ code });
    }

    expect(store.flockMoves).toEqual(moves);
    expect(store.audit).toEqual(audit);
    expect(sheepOf(store, good).flockId).toBeNull();
  });
});

describe("undoFlockMove", () => {
  test("takes the Sheep back to the Flock it was in before; the move becomes Deleted", async () => {
    const { store, ctx, register, flock } = await setup();
    const sheepId = await register();
    const [a, b] = [await flock("А"), await flock("Б")];
    await moveSheep(ctx, { sheepIds: [sheepId], flockId: a, date: "2026-10-01" });
    await moveSheep(ctx, { sheepIds: [sheepId], flockId: b, date: "2026-10-10" });
    const log = auditFrom(store);

    await undoFlockMove(ctx, { sheepId });

    expect(sheepOf(store, sheepId).flockId).toBe(a);
    expect(store.flockMoves.map((m) => [m.flockId, m.deletedAt])).toEqual([
      [a, undefined],
      [b, store.time],
    ]);
    expect(log()).toEqual([`sheep.undoMove Sheep ${sheepId}`]);
    // The Deleted move does not count: the Sheep can move again before its date.
    await moveSheep(ctx, { sheepIds: [sheepId], flockId: b, date: "2026-10-05" });
    expect(sheepOf(store, sheepId).flockId).toBe(b);
  });

  test("takes the Sheep out of all Flocks when the undone move was its first", async () => {
    const { store, ctx, register, flock } = await setup();
    const sheepId = await register();
    await moveSheep(ctx, { sheepIds: [sheepId], flockId: await flock(), date: "2026-10-01" });

    await undoFlockMove(ctx, { sheepId });

    expect(sheepOf(store, sheepId).flockId).toBeNull();
    await expect(undoFlockMove(ctx, { sheepId })).rejects.toMatchObject({
      code: "sheep.noMoveToUndo",
    });
  });

  test("a Sheep with no move has nothing to undo", async () => {
    const { ctx, register } = await setup();

    await expect(undoFlockMove(ctx, { sheepId: await register() })).rejects.toMatchObject({
      code: "sheep.noMoveToUndo",
    });
  });

  test("does not take the Sheep back to a Flock that is Archived now", async () => {
    const { store, ctx, register, flock } = await setup();
    const sheepId = await register();
    const [a, b] = [await flock("А"), await flock("Б")];
    await moveSheep(ctx, { sheepIds: [sheepId], flockId: a, date: "2026-10-01" });
    await moveSheep(ctx, { sheepIds: [sheepId], flockId: b, date: "2026-10-10" });
    await archiveFlock(ctx, { flockId: a, date: "2026-10-18" });
    const log = auditFrom(store);

    await expect(undoFlockMove(ctx, { sheepId })).rejects.toMatchObject({
      code: "flock.archived",
    });
    expect(sheepOf(store, sheepId).flockId).toBe(b);
    expect(store.flockMoves.every((m) => m.deletedAt === undefined)).toBe(true);
    expect(log()).toEqual([]);
  });

  test("only an Active Sheep of the Farm", async () => {
    const { store, ctx, register, flock } = await setup();
    const sheepId = await register();
    await moveSheep(ctx, { sheepIds: [sheepId], flockId: await flock(), date: "2026-10-01" });
    sheepOf(store, sheepId).status = "lost";

    await expect(undoFlockMove(ctx, { sheepId })).rejects.toMatchObject({
      code: "sheep.notActive",
    });
    await expect(undoFlockMove(ctx, { sheepId: "unknown" as SheepId })).rejects.toMatchObject({
      code: "sheep.notFound",
    });
  });
});

describe("recordFlockMove", () => {
  test("an External Sheep never enters a Flock through either move command", async () => {
    const { store, ctx, flock } = await setup();
    const sheepId = await registerExternalSheep(ctx, {
      tag: null,
      name: "External father",
      sex: "ram",
      birthDate: null,
      notes: null,
    });
    const flockId = await flock();
    const log = auditFrom(store);

    await expect(
      moveSheep(ctx, { sheepIds: [sheepId], flockId, date: "2026-10-18" }),
    ).rejects.toMatchObject({ code: "sheep.notFound" });
    await expect(
      recordFlockMove(ctx, sheepOf(store, sheepId), flockId, "2026-10-18"),
    ).rejects.toMatchObject({ code: "sheep.notFound" });

    expect(sheepOf(store, sheepId).flockId).toBeNull();
    expect(store.flockMoves).toEqual([]);
    expect(log()).toEqual([]);
  });
  test("moves the Sheep with the rules of a move, but writes no audit entry", async () => {
    const { store, ctx, register, flock } = await setup();
    const sheepId = await register();
    const flockId = await flock();
    const log = auditFrom(store);

    const moved = await recordFlockMove(ctx, sheepOf(store, sheepId), flockId, "2026-10-18");

    expect(moved).toBe(true);
    expect(sheepOf(store, sheepId).flockId).toBe(flockId);
    expect(store.flockMoves).toEqual([
      { id: expect.any(String), sheepId, flockId, date: "2026-10-18", at: store.time },
    ]);
    expect(log()).toEqual([]);
  });

  test("a move into the Flock that the Sheep is in writes nothing", async () => {
    const { store, ctx, register, flock } = await setup();
    const sheepId = await register();
    const flockId = await flock();
    await moveSheep(ctx, { sheepIds: [sheepId], flockId, date: "2026-10-01" });

    const moved = await recordFlockMove(ctx, sheepOf(store, sheepId), flockId, "2026-10-18");

    expect(moved).toBe(false);
    expect(store.flockMoves).toHaveLength(1);
  });

  test("checks the Sheep, the Flock and the date", async () => {
    const { store, ctx, register, flock } = await setup();
    const sheepId = await register({ birthDate: "2026-03-01" });
    const [a, b] = [await flock("А"), await flock("Б")];
    await moveSheep(ctx, { sheepIds: [sheepId], flockId: a, date: "2026-06-01" });
    const archived = await flock("Старое");
    await archiveFlock(ctx, { flockId: archived, date: "2026-10-18" });
    const sheep = () => copy(sheepOf(store, sheepId));

    for (const [flockId, date, code] of [
      [archived, "2026-10-18", "flock.archived"],
      [b, "2026-10-19", "sheep.moveDateInvalid"],
      [b, "2026-05-31", "sheep.moveDateInvalid"],
      [b, "2026-13-01", "sheep.dateInvalid"],
    ] as const) {
      await expect(recordFlockMove(ctx, sheep(), flockId, date)).rejects.toMatchObject({ code });
    }
    await expect(
      recordFlockMove(ctx, { ...sheep(), status: "dead" }, null, "2026-10-18"),
    ).rejects.toMatchObject({ code: "sheep.notActive" });
    expect(store.flockMoves).toHaveLength(1);
  });
});

describe("a command that changes nothing writes nothing", () => {
  test("the same fields, an archived record archived again, a record out of the archive taken out again", async () => {
    const { store, ctx, register, location, shepherd, flock } = await setup();
    const locationId = await location("Кошара");
    const archivedLocation = await location("Старая");
    await archiveLocation(ctx, { locationId: archivedLocation });
    const shepherdId = await createShepherd(ctx, { name: "Асан", phone: "0555", notes: null });
    const archivedShepherd = await shepherd("Ушёл");
    await archiveShepherd(ctx, { shepherdId: archivedShepherd, date: "2026-10-18" });
    const flockId = await flock("Стадо", locationId);
    const archivedFlock = await flock("Старое");
    await archiveFlock(ctx, { flockId: archivedFlock, date: "2026-10-18" });
    const assignmentId = await assignShepherd(ctx, {
      flockId,
      shepherdId,
      from: "2026-09-01",
      to: null,
    });
    const sheepId = await register();
    await moveSheep(ctx, { sheepIds: [sheepId], flockId, date: "2026-10-01" });
    const log = auditFrom(store);
    const records = copy({
      locations: store.locations,
      shepherds: store.shepherds,
      flocks: store.flocks,
      assignments: store.assignments,
      flockMoves: store.flockMoves,
    });

    await updateLocation(ctx, { locationId, name: " Кошара ", notes: "  " });
    await archiveLocation(ctx, { locationId: archivedLocation });
    await unarchiveLocation(ctx, { locationId });
    await updateShepherd(ctx, { shepherdId, name: "Асан", phone: " 0555 ", notes: null });
    await archiveShepherd(ctx, { shepherdId: archivedShepherd, date: "2026-10-18" });
    await unarchiveShepherd(ctx, { shepherdId });
    await updateFlock(ctx, { flockId, name: "Стадо ", locationId });
    await archiveFlock(ctx, { flockId: archivedFlock, date: "2026-10-18" });
    await unarchiveFlock(ctx, { flockId });
    await updateShepherdAssignment(ctx, { assignmentId, from: "2026-09-01", to: null });
    expect(await moveSheep(ctx, { sheepIds: [sheepId], flockId, date: "2026-10-18" })).toEqual({
      moved: 0,
    });

    expect(log()).toEqual([]);
    expect({
      locations: store.locations,
      shepherds: store.shepherds,
      flocks: store.flocks,
      assignments: store.assignments,
      flockMoves: store.flockMoves,
    }).toEqual(records);
  });
});

describe("the records of another Farm", () => {
  test("are not found", async () => {
    const { store, operator, ctx, register, shepherd, flock } = await setup();
    const other = await otherFarm(store, operator);
    const foreignLocation = await createLocation(other.ctx, { name: "Чужая", notes: null });
    const foreignShepherd = await createShepherd(other.ctx, {
      name: "Чужой",
      phone: null,
      notes: null,
    });
    const foreignFlock = await createFlock(other.ctx, { name: "Чужое", locationId: null });
    const assignment = await assignShepherd(other.ctx, {
      flockId: foreignFlock,
      shepherdId: foreignShepherd,
      from: "2026-09-01",
      to: null,
    });
    const foreignSheep = await registerSheep(other.ctx, {
      tag: null,
      name: null,
      sex: "ram",
      birthDate: null,
      notes: null,
      weight: null,
      ownerId: other.ownerId,
      origin: "born",
      initialEntry: true,
    });
    const ownFlock = await flock();
    const ownShepherd = await shepherd();
    const ownSheep = await register();
    const log = auditFrom(store);
    const today = "2026-10-18";

    const attempts: [() => Promise<unknown>, string][] = [
      [
        () => updateLocation(ctx, { locationId: foreignLocation, name: "Моя", notes: null }),
        "location.notFound",
      ],
      [() => archiveLocation(ctx, { locationId: foreignLocation }), "location.notFound"],
      [() => unarchiveLocation(ctx, { locationId: foreignLocation }), "location.notFound"],
      [() => createFlock(ctx, { name: "Новое", locationId: foreignLocation }), "location.notFound"],
      [
        () =>
          updateShepherd(ctx, {
            shepherdId: foreignShepherd,
            name: "Мой",
            phone: null,
            notes: null,
          }),
        "shepherd.notFound",
      ],
      [
        () => archiveShepherd(ctx, { shepherdId: foreignShepherd, date: today }),
        "shepherd.notFound",
      ],
      [() => unarchiveShepherd(ctx, { shepherdId: foreignShepherd }), "shepherd.notFound"],
      [
        () => updateFlock(ctx, { flockId: foreignFlock, name: "Моё", locationId: null }),
        "flock.notFound",
      ],
      [() => archiveFlock(ctx, { flockId: foreignFlock, date: today }), "flock.notFound"],
      [() => unarchiveFlock(ctx, { flockId: foreignFlock }), "flock.notFound"],
      [
        () =>
          assignShepherd(ctx, {
            flockId: foreignFlock,
            shepherdId: ownShepherd,
            from: today,
            to: null,
          }),
        "flock.notFound",
      ],
      [
        () =>
          assignShepherd(ctx, {
            flockId: ownFlock,
            shepherdId: foreignShepherd,
            from: today,
            to: null,
          }),
        "shepherd.notFound",
      ],
      [
        () => updateShepherdAssignment(ctx, { assignmentId: assignment, from: today, to: null }),
        "flock.assignmentNotFound",
      ],
      [
        () => removeShepherdAssignment(ctx, { assignmentId: assignment }),
        "flock.assignmentNotFound",
      ],
      [
        () => moveSheep(ctx, { sheepIds: [foreignSheep], flockId: ownFlock, date: today }),
        "sheep.notFound",
      ],
      [
        () => moveSheep(ctx, { sheepIds: [ownSheep], flockId: foreignFlock, date: today }),
        "flock.notFound",
      ],
      [() => undoFlockMove(ctx, { sheepId: foreignSheep }), "sheep.notFound"],
    ];

    for (const [attempt, code] of attempts) {
      await expect(attempt()).rejects.toMatchObject({ code });
    }
    expect(log()).toEqual([]);
  });

  test("a Member of another Farm cannot enter this one", async () => {
    const { store, operator, farmId } = await setup();
    const other = await otherFarm(store, operator);

    await expect(store.farmContext(other.user, farmId)).rejects.toMatchObject({
      code: "farm.notMember",
    });
  });
});

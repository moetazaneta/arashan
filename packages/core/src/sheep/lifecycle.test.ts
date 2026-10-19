import { describe, expect, test } from "vite-plus/test";

import type { CommandContext } from "../context";
import { createFarm } from "../farms/commands";
import { archiveFlock, createFlock, moveSheep, undoFlockMove } from "../flocks/commands";
import { getSheepResponsible } from "../flocks/queries";
import type { FarmId, SheepId } from "../ids";
import { removeMember } from "../members/manage";
import { changeSheepOwner, registerSheep, type SheepRegistration, updateSheep } from "./commands";
import {
  changeSheepStatus,
  markSheepFound,
  maxSheepPerStatusChange,
  undoSheepStatusChange,
} from "./lifecycle";
import { getSheep } from "./queries";
import { InMemoryStore } from "../testing/in-memory";

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
  return { store, operator, farmId, admin, editor, editorId, as, ctx, register, flock };
}

const sheepOf = (store: InMemoryStore, id: SheepId) => store.sheep.find((s) => s.id === id)!;

/** The audit entries that the store gets after this call, as "command id". */
function auditFrom(store: InMemoryStore) {
  const start = store.audit.length;
  return () => store.audit.slice(start).map((e) => `${e.command} ${e.target.id}`);
}

/** A deep copy of plain data, to compare the store before and after a command. */
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("changeSheepStatus", () => {
  test.each([
    ["slaughtered", "sheep.markSlaughtered"],
    ["dead", "sheep.markDead"],
    ["lost", "sheep.markLost"],
  ] as const)(
    "an Active Sheep becomes %s, with an event and an audit entry",
    async (status, command) => {
      const { store, ctx, register } = await setup();
      const sheepId = await register();
      const audit = auditFrom(store);

      const result = await changeSheepStatus(ctx, {
        sheepIds: [sheepId],
        status,
        date: "2026-10-15",
        reason: "  Причина  ",
      });

      expect(result).toEqual({ changed: 1 });
      expect(sheepOf(store, sheepId).status).toBe(status);
      expect(store.statusChanges).toEqual([
        {
          id: expect.any(String),
          sheepId,
          from: "active",
          to: status,
          date: "2026-10-15",
          reason: "Причина",
          flockMoveId: null,
          at: store.time,
        },
      ]);
      expect(audit()).toEqual([`${command} ${sheepId}`]);
    },
  );

  test("the Flock membership closes on the date of the change", async () => {
    const { store, ctx, register, flock } = await setup();
    const sheepId = await register();
    const flockId = await flock();
    await moveSheep(ctx, { sheepIds: [sheepId], flockId, date: "2026-09-01" });

    await changeSheepStatus(ctx, {
      sheepIds: [sheepId],
      status: "dead",
      date: "2026-10-10",
      reason: null,
    });

    expect(sheepOf(store, sheepId).flockId).toBeNull();
    const move = store.flockMoves.at(-1)!;
    expect(move).toMatchObject({ sheepId, flockId: null, date: "2026-10-10" });
    expect(store.statusChanges[0]!.flockMoveId).toBe(move.id);
    const card = await getSheep(ctx, { sheepId });
    expect(card?.flocks).toEqual([
      expect.objectContaining({
        flock: expect.objectContaining({ id: flockId }),
        to: "2026-10-10",
      }),
    ]);
    // The Sheep was still in its Flock on the day it died, and not after.
    const responsible = (date: string) => getSheepResponsible(ctx, { sheepId, date });
    expect((await responsible("2026-10-10")).map((r) => r.flock.id)).toEqual([flockId]);
    expect(await responsible("2026-10-11")).toEqual([]);
  });

  test("a bulk change changes each Sheep, with one audit entry for each", async () => {
    const { store, ctx, register, flock } = await setup();
    const flockId = await flock();
    const sheepIds: SheepId[] = [];
    for (let i = 0; i < 5; i++) sheepIds.push(await register());
    await moveSheep(ctx, { sheepIds: sheepIds.slice(0, 3), flockId, date: "2026-09-01" });
    const audit = auditFrom(store);

    const result = await changeSheepStatus(ctx, {
      // A Sheep twice counts once.
      sheepIds: [...sheepIds, sheepIds[0]!],
      status: "slaughtered",
      date: "2026-10-18",
      reason: "На мясо",
    });

    expect(result).toEqual({ changed: 5 });
    for (const id of sheepIds) {
      expect(sheepOf(store, id)).toMatchObject({ status: "slaughtered", flockId: null });
    }
    expect(store.statusChanges.filter((c) => c.flockMoveId !== null)).toHaveLength(3);
    expect(audit()).toEqual(sheepIds.map((id) => `sheep.markSlaughtered ${id}`));
  });

  test("if one Sheep cannot change, no Sheep changes", async () => {
    const { store, ctx, register } = await setup();
    const active = await register();
    const dead = await register();
    await changeSheepStatus(ctx, {
      sheepIds: [dead],
      status: "dead",
      date: "2026-10-01",
      reason: null,
    });
    const before = copy({ sheep: store.sheep, changes: store.statusChanges, audit: store.audit });

    await expect(
      changeSheepStatus(ctx, {
        sheepIds: [active, dead],
        status: "lost",
        date: "2026-10-18",
        reason: null,
      }),
    ).rejects.toThrow("sheep.notActive");

    expect({ sheep: store.sheep, changes: store.statusChanges, audit: store.audit }).toEqual(
      before,
    );
  });

  test.each(["slaughtered", "dead"] as const)("%s is final", async (status) => {
    const { ctx, register } = await setup();
    const sheepId = await register();
    await changeSheepStatus(ctx, { sheepIds: [sheepId], status, date: "2026-10-01", reason: null });

    for (const next of ["slaughtered", "dead", "lost"] as const) {
      await expect(
        changeSheepStatus(ctx, {
          sheepIds: [sheepId],
          status: next,
          date: "2026-10-18",
          reason: null,
        }),
      ).rejects.toThrow("sheep.notActive");
    }
    await expect(
      markSheepFound(ctx, { sheepId, date: "2026-10-18", reason: null }),
    ).rejects.toThrow("sheep.notLost");
  });

  test("the date is not in the future and not before the events of the Sheep", async () => {
    const { ctx, register, flock, editorId, admin, store, farmId } = await setup();
    const change = (sheepId: SheepId, date: string) =>
      changeSheepStatus(ctx, { sheepIds: [sheepId], status: "dead", date, reason: null });

    const young = await register({ birthDate: "2026-05-01", initialEntry: false });
    await expect(change(young, "2026-04-30")).rejects.toThrow("sheep.statusDateInvalid");
    await expect(change(young, "2026-10-19")).rejects.toThrow("sheep.statusDateInvalid");
    await expect(change(young, "18.10.2026")).rejects.toThrow("sheep.dateInvalid");

    const moved = await register();
    await moveSheep(ctx, { sheepIds: [moved], flockId: await flock(), date: "2026-10-05" });
    await expect(change(moved, "2026-10-04")).rejects.toThrow("sheep.statusDateInvalid");

    const given = await register();
    const adminId = store.memberships.find(
      (m) => m.farmId === farmId && m.id !== editorId && m.role === "admin",
    )!.id;
    await changeSheepOwner(await store.farmContext(admin, farmId), {
      sheepId: given,
      ownerId: adminId,
      date: "2026-10-07",
    });
    await expect(change(given, "2026-10-06")).rejects.toThrow("sheep.statusDateInvalid");

    // The same day as the last event is good.
    await change(moved, "2026-10-05");
    await change(given, "2026-10-07");
  });

  test("the reason is optional and has a limit", async () => {
    const { store, ctx, register } = await setup();
    const sheepId = await register();
    const change = (reason: string | null) =>
      changeSheepStatus(ctx, { sheepIds: [sheepId], status: "lost", date: "2026-10-18", reason });

    await expect(change("x".repeat(501))).rejects.toThrow("sheep.reasonTooLong");
    await change("   ");

    expect(store.statusChanges[0]!.reason).toBeNull();
  });

  test("a Sheep of another Farm or too many Sheep cannot change", async () => {
    const { store, operator, ctx, register } = await setup();
    const { farmId: otherId } = await createFarm(operator, { name: "Другая", ...settings });
    const other = store.addMember("other", otherId, "admin");
    const otherCtx = await store.farmContext(other, otherId);
    const sheepId = await register();
    const change = (sheepIds: SheepId[], context = ctx) =>
      changeSheepStatus(context, { sheepIds, status: "dead", date: "2026-10-18", reason: null });

    await expect(change([sheepId], otherCtx)).rejects.toThrow("sheep.notFound");
    await expect(
      change(
        Array.from({ length: maxSheepPerStatusChange + 1 }, (_, i) => `sheep-x${i}` as SheepId),
      ),
    ).rejects.toThrow("sheep.tooManyToChangeStatus");
    expect(sheepOf(store, sheepId).status).toBe("active");
  });

  test("a Member whose Sheep are all Dead can be removed", async () => {
    const { store, ctx, register, admin, editorId, farmId } = await setup();
    const sheepId = await register();
    const adminCtx = await store.farmContext(admin, farmId);
    await expect(removeMember(adminCtx, { membershipId: editorId })).rejects.toThrow(
      "member.ownsActiveSheep",
    );

    await changeSheepStatus(ctx, {
      sheepIds: [sheepId],
      status: "dead",
      date: "2026-10-18",
      reason: null,
    });

    await removeMember(adminCtx, { membershipId: editorId });
  });
});

describe("markSheepFound", () => {
  test("a Lost Sheep comes back as Active, in no Flock", async () => {
    const { store, ctx, register, flock } = await setup();
    const sheepId = await register();
    await moveSheep(ctx, { sheepIds: [sheepId], flockId: await flock(), date: "2026-09-01" });
    await changeSheepStatus(ctx, {
      sheepIds: [sheepId],
      status: "lost",
      date: "2026-10-01",
      reason: null,
    });
    const audit = auditFrom(store);

    await markSheepFound(ctx, { sheepId, date: "2026-10-12", reason: " У соседа " });

    expect(sheepOf(store, sheepId)).toMatchObject({ status: "active", flockId: null });
    expect(store.statusChanges.at(-1)).toMatchObject({
      from: "lost",
      to: "active",
      date: "2026-10-12",
      reason: "У соседа",
      flockMoveId: null,
    });
    expect(audit()).toEqual([`sheep.markFound ${sheepId}`]);
    const card = await getSheep(ctx, { sheepId });
    expect(card?.statusChanges.map((c) => `${c.from}→${c.to} ${c.date}`)).toEqual([
      "lost→active 2026-10-12",
      "active→lost 2026-10-01",
    ]);
  });

  test("the date is not before the day when the Sheep was Lost, and not in the future", async () => {
    const { ctx, register } = await setup();
    const sheepId = await register();
    await changeSheepStatus(ctx, {
      sheepIds: [sheepId],
      status: "lost",
      date: "2026-10-10",
      reason: null,
    });
    const found = (date: string) => markSheepFound(ctx, { sheepId, date, reason: null });

    await expect(found("2026-10-09")).rejects.toThrow("sheep.statusDateInvalid");
    await expect(found("2026-10-19")).rejects.toThrow("sheep.statusDateInvalid");
    await found("2026-10-10");
  });

  test("an Active Sheep cannot be found", async () => {
    const { ctx, register } = await setup();
    const sheepId = await register();

    await expect(
      markSheepFound(ctx, { sheepId, date: "2026-10-18", reason: null }),
    ).rejects.toThrow("sheep.notLost");
  });

  test("the Owner of a Lost Sheep stays a Member: give the Sheep away first", async () => {
    const { store, ctx, register, admin, editorId, farmId } = await setup();
    const sheepId = await register();
    await changeSheepStatus(ctx, {
      sheepIds: [sheepId],
      status: "lost",
      date: "2026-10-10",
      reason: null,
    });
    const adminCtx = await store.farmContext(admin, farmId);
    await expect(removeMember(adminCtx, { membershipId: editorId })).rejects.toThrow(
      "member.ownsLostSheep",
    );

    // A Lost Sheep can get a new Owner, but not before the loss.
    const adminId = store.memberships.find((m) => m.farmId === farmId && m.role === "admin")!.id;
    const give = (date: string) => changeSheepOwner(adminCtx, { sheepId, ownerId: adminId, date });
    await expect(give("2026-10-09")).rejects.toThrow("sheep.ownerChangeDateInvalid");
    await give("2026-10-11");
    await removeMember(adminCtx, { membershipId: editorId });

    // The found date is not before that change of the Owner.
    await expect(
      markSheepFound(adminCtx, { sheepId, date: "2026-10-10", reason: null }),
    ).rejects.toThrow("sheep.statusDateInvalid");
    await markSheepFound(adminCtx, { sheepId, date: "2026-10-11", reason: null });
    expect(sheepOf(store, sheepId)).toMatchObject({ status: "active", ownerId: adminId });
  });

  test("a found Sheep moves only from the day it was found", async () => {
    const { ctx, register, flock } = await setup();
    const sheepId = await register();
    await moveSheep(ctx, { sheepIds: [sheepId], flockId: await flock(), date: "2026-09-01" });
    await changeSheepStatus(ctx, {
      sheepIds: [sheepId],
      status: "lost",
      date: "2026-10-01",
      reason: null,
    });
    await markSheepFound(ctx, { sheepId, date: "2026-10-10", reason: null });
    const move = (date: string) => moveSheep(ctx, { sheepIds: [sheepId], flockId: null, date });

    // Out of all Flocks is no move for a Sheep in no Flock; a move into a Flock is one.
    const other = await flock("Другое");
    await expect(
      moveSheep(ctx, { sheepIds: [sheepId], flockId: other, date: "2026-10-05" }),
    ).rejects.toThrow("sheep.moveDateInvalid");
    await moveSheep(ctx, { sheepIds: [sheepId], flockId: other, date: "2026-10-10" });
    await move("2026-10-12");
  });
});

describe("undoSheepStatusChange", () => {
  test("a wrong change is undone: the Sheep is Active again and back in its Flock", async () => {
    const { store, ctx, register, flock } = await setup();
    const sheepId = await register();
    const flockId = await flock();
    await moveSheep(ctx, { sheepIds: [sheepId], flockId, date: "2026-09-01" });
    await changeSheepStatus(ctx, {
      sheepIds: [sheepId],
      status: "dead",
      date: "2026-10-10",
      reason: null,
    });
    const audit = auditFrom(store);

    await undoSheepStatusChange(ctx, { sheepId });

    expect(sheepOf(store, sheepId)).toMatchObject({ status: "active", flockId });
    expect(store.statusChanges[0]!.deletedAt).toBe(store.time);
    expect(store.flockMoves.at(-1)!.deletedAt).toBe(store.time);
    expect(audit()).toEqual([`sheep.undoStatusChange ${sheepId}`]);
    const card = await getSheep(ctx, { sheepId });
    expect(card?.statusChanges).toEqual([]);
    expect(card?.flocks).toEqual([expect.objectContaining({ from: "2026-09-01", to: null })]);
  });

  test("if the Flock is Archived now, the Sheep stays in no Flock", async () => {
    const { store, ctx, register, flock } = await setup();
    const sheepId = await register();
    const flockId = await flock();
    await moveSheep(ctx, { sheepIds: [sheepId], flockId, date: "2026-09-01" });
    await changeSheepStatus(ctx, {
      sheepIds: [sheepId],
      status: "lost",
      date: "2026-10-10",
      reason: null,
    });
    await archiveFlock(ctx, { flockId, date: "2026-10-18" });

    await undoSheepStatusChange(ctx, { sheepId });

    expect(sheepOf(store, sheepId)).toMatchObject({ status: "active", flockId: null });
    expect(store.flockMoves.at(-1)!.deletedAt).toBeUndefined();
  });

  test("the undo of a found Sheep makes it Lost again", async () => {
    const { store, ctx, register } = await setup();
    const sheepId = await register();
    await changeSheepStatus(ctx, {
      sheepIds: [sheepId],
      status: "lost",
      date: "2026-10-10",
      reason: null,
    });
    await markSheepFound(ctx, { sheepId, date: "2026-10-12", reason: null });

    await undoSheepStatusChange(ctx, { sheepId });
    expect(sheepOf(store, sheepId).status).toBe("lost");

    // Then the undo of the loss makes it Active.
    await undoSheepStatusChange(ctx, { sheepId });
    expect(sheepOf(store, sheepId).status).toBe("active");
    await expect(undoSheepStatusChange(ctx, { sheepId })).rejects.toThrow(
      "sheep.noStatusChangeToUndo",
    );
  });

  test("a found Sheep that moved after it was found is Lost again only after the undo of the moves", async () => {
    const { store, ctx, register, flock } = await setup();
    const sheepId = await register();
    await changeSheepStatus(ctx, {
      sheepIds: [sheepId],
      status: "lost",
      date: "2026-10-10",
      reason: null,
    });
    await markSheepFound(ctx, { sheepId, date: "2026-10-12", reason: null });
    // The moves come a minute after the found Sheep, as on a real clock.
    store.time += 60_000;
    await moveSheep(ctx, { sheepIds: [sheepId], flockId: await flock(), date: "2026-10-12" });
    await moveSheep(ctx, { sheepIds: [sheepId], flockId: null, date: "2026-10-13" });

    // Also out of all Flocks again, the stay in the Flock would fall inside the loss.
    await expect(undoSheepStatusChange(ctx, { sheepId })).rejects.toThrow("sheep.movedAfterFound");
    expect(sheepOf(store, sheepId).status).toBe("active");

    await undoFlockMove(ctx, { sheepId });
    await undoFlockMove(ctx, { sheepId });
    await undoSheepStatusChange(ctx, { sheepId });
    expect(sheepOf(store, sheepId)).toMatchObject({ status: "lost", flockId: null });
  });

  test("the Owner of a Sheep that becomes Active again is a Member now", async () => {
    const { store, ctx, register, admin, editorId, farmId } = await setup();
    const sheepId = await register();
    await changeSheepStatus(ctx, {
      sheepIds: [sheepId],
      status: "dead",
      date: "2026-10-10",
      reason: null,
    });
    const adminCtx = await store.farmContext(admin, farmId);
    await removeMember(adminCtx, { membershipId: editorId });

    await expect(undoSheepStatusChange(adminCtx, { sheepId })).rejects.toThrow(
      "sheep.ownerNotMember",
    );
    expect(sheepOf(store, sheepId).status).toBe("dead");
  });

  test("a Sheep with no change has nothing to undo", async () => {
    const { ctx, register } = await setup();
    const sheepId = await register();

    await expect(undoSheepStatusChange(ctx, { sheepId })).rejects.toThrow(
      "sheep.noStatusChangeToUndo",
    );
  });
});

describe("updateSheep after a change of the Status", () => {
  test("the birth date is not after a change of the Status", async () => {
    const { ctx, register } = await setup();
    const sheepId = await register({ birthDate: "2026-01-01" });
    await changeSheepStatus(ctx, {
      sheepIds: [sheepId],
      status: "lost",
      date: "2026-05-01",
      reason: null,
    });
    const update = (birthDate: string) =>
      updateSheep(ctx, {
        sheepId,
        tag: null,
        name: null,
        sex: "ewe",
        birthDate,
        notes: null,
        weight: null,
      });

    await expect(update("2026-05-02")).rejects.toThrow("sheep.birthDateAfterStatusChange");
    await update("2026-05-01");
  });
});

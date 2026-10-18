import { describe, expect, test } from "vite-plus/test";

import { api } from "./_generated/api";
import { errorCode, farmWithEditor, logIn, setup, type Test } from "./test.setup";

async function shepherdRow(t: Test, shepherdId: string) {
  return t.run((ctx) => ctx.db.get(ctx.db.normalizeId("shepherds", shepherdId)!));
}

async function assignmentRow(t: Test, assignmentId: string) {
  return t.run((ctx) => ctx.db.get(ctx.db.normalizeId("flockAssignments", assignmentId)!));
}

/** The audit entries of the Farm, oldest first. */
async function auditLog(t: Test) {
  const rows = await t.run((ctx) => ctx.db.query("auditLog").collect());
  return rows.map(({ command, targetKind, targetId }) => ({ command, targetKind, targetId }));
}

describe("shepherds", () => {
  test("a Shepherd comes back from the list by name, with null for each empty field", async () => {
    const t = setup();
    const { editor, farmId } = await farmWithEditor(t);

    const bakyt = await editor.mutation(api.shepherds.create, {
      farmId,
      name: "Бакыт",
      phone: " +996 555 123 456 ",
      notes: " Летом ",
    });
    const asan = await editor.mutation(api.shepherds.create, {
      farmId,
      name: " Асан ",
      phone: "",
      notes: null,
    });
    // Two Shepherds can have one name.
    const namesake = await editor.mutation(api.shepherds.create, {
      farmId,
      name: "Асан",
      phone: null,
      notes: "  ",
    });

    expect(await editor.query(api.shepherds.list, { farmId })).toEqual([
      { id: asan, name: "Асан", archived: false, phone: null, notes: null, flocks: [] },
      { id: namesake, name: "Асан", archived: false, phone: null, notes: null, flocks: [] },
      {
        id: bakyt,
        name: "Бакыт",
        archived: false,
        phone: "+996 555 123 456",
        notes: "Летом",
        flocks: [],
      },
    ]);
    const row = await shepherdRow(t, asan);
    expect(row).toMatchObject({ farmId, name: "Асан" });
    expect(row?.phone).toBeUndefined();
    expect(row?.notes).toBeUndefined();
    expect(row?.archivedAt).toBeUndefined();
  });

  test("an update that clears the phone removes the field; the same fields append no entry", async () => {
    const t = setup();
    const { admin, farmId } = await farmWithEditor(t);
    const shepherdId = await admin.mutation(api.shepherds.create, {
      farmId,
      name: "Асан",
      phone: "+996 555 123 456",
      notes: "Летом",
    });

    await admin.mutation(api.shepherds.update, {
      farmId,
      shepherdId,
      name: "Асан Бакиев",
      phone: null,
      notes: "Летом",
    });
    await admin.mutation(api.shepherds.update, {
      farmId,
      shepherdId,
      name: " Асан  Бакиев ",
      phone: " ",
      notes: " Летом ",
    });

    const row = await shepherdRow(t, shepherdId);
    expect(row).toMatchObject({ name: "Асан Бакиев", notes: "Летом" });
    expect(row?.phone).toBeUndefined();
    expect((await auditLog(t)).filter((entry) => entry.targetKind === "Shepherd")).toEqual([
      { command: "shepherd.create", targetKind: "Shepherd", targetId: shepherdId },
      { command: "shepherd.update", targetKind: "Shepherd", targetId: shepherdId },
    ]);
  });

  test("an Archived Shepherd's open assignments end on the date, and stay ended after unarchive", async () => {
    const t = setup();
    const { admin, farmId } = await farmWithEditor(t);
    const shepherdId = await admin.mutation(api.shepherds.create, {
      farmId,
      name: "Асан",
      phone: null,
      notes: null,
    });
    const north = await admin.mutation(api.flocks.create, {
      farmId,
      name: "Северная",
      locationId: null,
    });
    const south = await admin.mutation(api.flocks.create, {
      farmId,
      name: "Южная",
      locationId: null,
    });
    const assign = (flockId: string, from: string, to: string | null) =>
      admin.mutation(api.flocks.assignShepherd, { farmId, flockId, shepherdId, from, to });
    const northOpen = await assign(north, "2025-05-01", null);
    const southOpen = await assign(south, "2025-06-01", null);
    const ended = await assign(north, "2025-01-01", "2025-03-31");

    // Not before the start of an open assignment, and not in the future.
    for (const date of ["2025-05-15", "2999-01-01", "2025-02-30"]) {
      expect(
        await errorCode(admin.mutation(api.shepherds.archive, { farmId, shepherdId, date })),
      ).toBe("flock.endDateInvalid");
    }
    expect((await shepherdRow(t, shepherdId))?.archivedAt).toBeUndefined();
    const before = (await auditLog(t)).length;

    await admin.mutation(api.shepherds.archive, { farmId, shepherdId, date: "2025-08-31" });

    expect(await shepherdRow(t, shepherdId)).toMatchObject({ archivedAt: expect.any(Number) });
    expect(await assignmentRow(t, northOpen)).toMatchObject({
      from: "2025-05-01",
      to: "2025-08-31",
    });
    expect(await assignmentRow(t, southOpen)).toMatchObject({
      from: "2025-06-01",
      to: "2025-08-31",
    });
    expect(await assignmentRow(t, ended)).toMatchObject({ from: "2025-01-01", to: "2025-03-31" });
    expect((await auditLog(t)).slice(before)).toEqual([
      { command: "shepherd.archive", targetKind: "Shepherd", targetId: shepherdId },
      { command: "shepherd.archive", targetKind: "Flock", targetId: north },
      { command: "shepherd.archive", targetKind: "Flock", targetId: south },
    ]);
    expect(await admin.query(api.shepherds.list, { farmId })).toMatchObject([
      { id: shepherdId, archived: true, flocks: [] },
    ]);
    expect(await errorCode(assign(north, "2025-09-01", null))).toBe("shepherd.archived");
    expect(
      await errorCode(
        admin.mutation(api.flocks.updateAssignment, {
          farmId,
          assignmentId: northOpen,
          from: "2025-05-01",
          to: null,
        }),
      ),
    ).toBe("shepherd.archived");

    await admin.mutation(api.shepherds.unarchive, { farmId, shepherdId });

    expect((await shepherdRow(t, shepherdId))?.archivedAt).toBeUndefined();
    expect(await assignmentRow(t, northOpen)).toMatchObject({ to: "2025-08-31" });
    expect((await auditLog(t)).at(-1)).toEqual({
      command: "shepherd.unarchive",
      targetKind: "Shepherd",
      targetId: shepherdId,
    });
  });

  test("a bad name, phone or notes fail with the code of the rule, and nothing is written", async () => {
    const t = setup();
    const { admin, farmId } = await farmWithEditor(t);
    const create = (fields: { name?: string; phone?: string; notes?: string }) =>
      admin.mutation(api.shepherds.create, {
        farmId,
        name: "Асан",
        phone: null,
        notes: null,
        ...fields,
      });

    expect(await errorCode(create({ name: " " }))).toBe("shepherd.nameRequired");
    expect(await errorCode(create({ name: "А".repeat(61) }))).toBe("shepherd.nameTooLong");
    expect(await errorCode(create({ phone: "1".repeat(31) }))).toBe("shepherd.phoneTooLong");
    expect(await errorCode(create({ notes: "з".repeat(2001) }))).toBe("shepherd.notesTooLong");
    expect(await t.run((ctx) => ctx.db.query("shepherds").collect())).toEqual([]);
  });

  test("a Shepherd of another Farm, or a made-up id, is not found", async () => {
    const t = setup();
    const { admin, farmId } = await farmWithEditor(t);
    const other = await farmWithEditor(t, "Другая");
    const stranger = await other.admin.mutation(api.shepherds.create, {
      farmId: other.farmId,
      name: "Асан",
      phone: null,
      notes: null,
    });
    const flockId = await admin.mutation(api.flocks.create, {
      farmId,
      name: "Отара",
      locationId: null,
    });

    for (const shepherdId of [stranger, "not-an-id"]) {
      expect(
        await errorCode(
          admin.mutation(api.shepherds.update, {
            farmId,
            shepherdId,
            name: "Бакыт",
            phone: null,
            notes: null,
          }),
        ),
      ).toBe("shepherd.notFound");
      expect(
        await errorCode(
          admin.mutation(api.shepherds.archive, { farmId, shepherdId, date: "2025-06-01" }),
        ),
      ).toBe("shepherd.notFound");
      expect(await errorCode(admin.mutation(api.shepherds.unarchive, { farmId, shepherdId }))).toBe(
        "shepherd.notFound",
      );
      expect(
        await errorCode(
          admin.mutation(api.flocks.assignShepherd, {
            farmId,
            flockId,
            shepherdId,
            from: "2025-06-01",
            to: null,
          }),
        ),
      ).toBe("shepherd.notFound");
    }
    expect(await admin.query(api.shepherds.list, { farmId })).toEqual([]);
    const row = await shepherdRow(t, stranger);
    expect(row).toMatchObject({ name: "Асан" });
    expect(row?.archivedAt).toBeUndefined();
  });

  test("a User who is not a Member of the Farm sees and changes no Shepherd", async () => {
    const t = setup();
    const { admin, farmId } = await farmWithEditor(t);
    const shepherdId = await admin.mutation(api.shepherds.create, {
      farmId,
      name: "Асан",
      phone: null,
      notes: null,
    });
    const stranger = await logIn(t, "stranger");

    expect(await errorCode(stranger.query(api.shepherds.list, { farmId }))).toBe("farm.notMember");
    expect(
      await errorCode(
        stranger.mutation(api.shepherds.create, {
          farmId,
          name: "Бакыт",
          phone: null,
          notes: null,
        }),
      ),
    ).toBe("farm.notMember");
    expect(
      await errorCode(
        stranger.mutation(api.shepherds.archive, { farmId, shepherdId, date: "2025-06-01" }),
      ),
    ).toBe("farm.notMember");
  });
});

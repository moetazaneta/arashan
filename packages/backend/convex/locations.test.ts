import { describe, expect, test } from "vite-plus/test";

import { api } from "./_generated/api";
import { errorCode, farmWithEditor, logIn, setup, type Test } from "./test.setup";

async function locationRow(t: Test, locationId: string) {
  return t.run((ctx) => ctx.db.get(ctx.db.normalizeId("locations", locationId)!));
}

/** The audit entries of the Locations, oldest first. */
async function locationAudit(t: Test) {
  const rows = await t.run((ctx) => ctx.db.query("auditLog").collect());
  return rows
    .filter((row) => row.targetKind === "Location")
    .map(({ farmId, command, targetId }) => ({ farmId, command, targetId }));
}

describe("locations", () => {
  test("a Location comes back from the list by name, with null notes and its Flocks", async () => {
    const t = setup();
    const { editor, farmId } = await farmWithEditor(t);

    const yard = await editor.mutation(api.locations.create, {
      farmId,
      name: "  Двор   у дома ",
      notes: "  ",
    });
    const pasture = await editor.mutation(api.locations.create, {
      farmId,
      name: "Ала-Тоо",
      notes: " Летнее пастбище ",
    });
    const flockId = await editor.mutation(api.flocks.create, {
      farmId,
      name: "Отара",
      locationId: pasture,
    });

    expect(await editor.query(api.locations.list, { farmId })).toEqual([
      {
        id: pasture,
        name: "Ала-Тоо",
        archived: false,
        notes: "Летнее пастбище",
        flocks: [{ id: flockId, name: "Отара", archived: false }],
      },
      { id: yard, name: "Двор у дома", archived: false, notes: null, flocks: [] },
    ]);
    const row = await locationRow(t, yard);
    expect(row).toMatchObject({ farmId, name: "Двор у дома", nameKey: "двор у дома" });
    expect(row?.notes).toBeUndefined();
    expect(row?.archivedAt).toBeUndefined();
  });

  test("a name is taken whatever its case and «ё», also by an Archived Location", async () => {
    const t = setup();
    const { admin, farmId } = await farmWithEditor(t);
    const other = await farmWithEditor(t, "Другая");
    const trees = await admin.mutation(api.locations.create, { farmId, name: "Ёлки", notes: null });
    const fold = await admin.mutation(api.locations.create, {
      farmId,
      name: "Кошара",
      notes: null,
    });
    await admin.mutation(api.locations.archive, { farmId, locationId: trees });

    for (const name of ["ёлки", " ЕЛКИ ", "Елки"]) {
      expect(
        await errorCode(admin.mutation(api.locations.create, { farmId, name, notes: null })),
      ).toBe("location.nameTaken");
    }
    expect(
      await errorCode(
        admin.mutation(api.locations.update, {
          farmId,
          locationId: fold,
          name: "елки",
          notes: null,
        }),
      ),
    ).toBe("location.nameTaken");
    // A Location can change the case of its own name, and the key follows the name.
    await admin.mutation(api.locations.update, {
      farmId,
      locationId: fold,
      name: "КОШАРА",
      notes: null,
    });
    expect(await locationRow(t, fold)).toMatchObject({ name: "КОШАРА", nameKey: "кошара" });
    // Another Farm has its own names.
    expect(
      await other.admin.mutation(api.locations.create, {
        farmId: other.farmId,
        name: "Ёлки",
        notes: null,
      }),
    ).toEqual(expect.any(String));
  });

  test("an update that clears the notes removes the field; the same fields append no entry", async () => {
    const t = setup();
    const { admin, farmId } = await farmWithEditor(t);
    const locationId = await admin.mutation(api.locations.create, {
      farmId,
      name: "Кошара",
      notes: "Зимняя",
    });

    await admin.mutation(api.locations.update, {
      farmId,
      locationId,
      name: "Кошара 2",
      notes: null,
    });
    await admin.mutation(api.locations.update, {
      farmId,
      locationId,
      name: " Кошара  2 ",
      notes: "",
    });

    const row = await locationRow(t, locationId);
    expect(row).toMatchObject({ name: "Кошара 2", nameKey: "кошара 2" });
    expect(row?.notes).toBeUndefined();
    expect(await locationAudit(t)).toEqual([
      { farmId, command: "location.create", targetId: locationId },
      { farmId, command: "location.update", targetId: locationId },
    ]);
  });

  test("a Location that a Flock uses cannot be archived, and an Archived one takes no Flock", async () => {
    const t = setup();
    const { editor, farmId } = await farmWithEditor(t);
    const locationId = await editor.mutation(api.locations.create, {
      farmId,
      name: "Кошара",
      notes: null,
    });
    const flockId = await editor.mutation(api.flocks.create, { farmId, name: "Отара", locationId });

    expect(await errorCode(editor.mutation(api.locations.archive, { farmId, locationId }))).toBe(
      "location.inUse",
    );
    await editor.mutation(api.flocks.update, { farmId, flockId, name: "Отара", locationId: null });
    await editor.mutation(api.locations.archive, { farmId, locationId });
    // Archived again: nothing changes.
    await editor.mutation(api.locations.archive, { farmId, locationId });

    expect(await locationRow(t, locationId)).toMatchObject({ archivedAt: expect.any(Number) });
    expect(await editor.query(api.locations.list, { farmId })).toMatchObject([
      { id: locationId, archived: true, flocks: [] },
    ]);
    expect(
      await errorCode(editor.mutation(api.flocks.create, { farmId, name: "Новая", locationId })),
    ).toBe("location.archived");
    expect(
      await errorCode(
        editor.mutation(api.flocks.update, { farmId, flockId, name: "Отара", locationId }),
      ),
    ).toBe("location.archived");

    await editor.mutation(api.locations.unarchive, { farmId, locationId });

    expect((await locationRow(t, locationId))?.archivedAt).toBeUndefined();
    await editor.mutation(api.flocks.update, { farmId, flockId, name: "Отара", locationId });
    expect(await locationAudit(t)).toEqual([
      { farmId, command: "location.create", targetId: locationId },
      { farmId, command: "location.archive", targetId: locationId },
      { farmId, command: "location.unarchive", targetId: locationId },
    ]);
  });

  test("a bad name or notes fail with the code of the rule, and nothing is written", async () => {
    const t = setup();
    const { admin, farmId } = await farmWithEditor(t);
    const create = (name: string, notes: string | null = null) =>
      admin.mutation(api.locations.create, { farmId, name, notes });

    expect(await errorCode(create("   "))).toBe("location.nameRequired");
    expect(await errorCode(create("К".repeat(61)))).toBe("location.nameTooLong");
    expect(await errorCode(create("Кошара", "з".repeat(2001)))).toBe("location.notesTooLong");
    expect(await t.run((ctx) => ctx.db.query("locations").collect())).toEqual([]);
    expect(await locationAudit(t)).toEqual([]);
  });

  test("a Deleted Location leaves the list, is not found, and frees its name", async () => {
    const t = setup();
    const { admin, farmId } = await farmWithEditor(t);
    const locationId = await admin.mutation(api.locations.create, {
      farmId,
      name: "Кошара",
      notes: null,
    });
    await t.run((ctx) =>
      ctx.db.patch(ctx.db.normalizeId("locations", locationId)!, { deletedAt: Date.now() }),
    );

    expect(await admin.query(api.locations.list, { farmId })).toEqual([]);
    expect(await errorCode(admin.mutation(api.locations.archive, { farmId, locationId }))).toBe(
      "location.notFound",
    );
    expect(
      await admin.mutation(api.locations.create, { farmId, name: "кошара", notes: null }),
    ).toEqual(expect.any(String));
  });

  test("a Location of another Farm, or a made-up id, is not found", async () => {
    const t = setup();
    const { admin, farmId } = await farmWithEditor(t);
    const other = await farmWithEditor(t, "Другая");
    const stranger = await other.admin.mutation(api.locations.create, {
      farmId: other.farmId,
      name: "Кошара",
      notes: null,
    });

    for (const locationId of [stranger, "not-an-id"]) {
      expect(
        await errorCode(
          admin.mutation(api.locations.update, { farmId, locationId, name: "Двор", notes: null }),
        ),
      ).toBe("location.notFound");
      expect(await errorCode(admin.mutation(api.locations.archive, { farmId, locationId }))).toBe(
        "location.notFound",
      );
      expect(await errorCode(admin.mutation(api.locations.unarchive, { farmId, locationId }))).toBe(
        "location.notFound",
      );
      expect(
        await errorCode(admin.mutation(api.flocks.create, { farmId, name: "Отара", locationId })),
      ).toBe("location.notFound");
    }
    expect(await admin.query(api.locations.list, { farmId })).toEqual([]);
    const row = await locationRow(t, stranger);
    expect(row).toMatchObject({ name: "Кошара" });
    expect(row?.archivedAt).toBeUndefined();
  });

  test("a User who is not a Member of the Farm sees and changes no Location", async () => {
    const t = setup();
    const { admin, farmId } = await farmWithEditor(t);
    const locationId = await admin.mutation(api.locations.create, {
      farmId,
      name: "Кошара",
      notes: null,
    });
    const stranger = await logIn(t, "stranger");

    expect(await errorCode(stranger.query(api.locations.list, { farmId }))).toBe("farm.notMember");
    expect(
      await errorCode(
        stranger.mutation(api.locations.create, { farmId, name: "Двор", notes: null }),
      ),
    ).toBe("farm.notMember");
    expect(
      await errorCode(
        stranger.mutation(api.locations.update, { farmId, locationId, name: "Двор", notes: null }),
      ),
    ).toBe("farm.notMember");
    expect(await errorCode(stranger.mutation(api.locations.archive, { farmId, locationId }))).toBe(
      "farm.notMember",
    );
  });
});

import { breedNameKey } from "@arashan/core";
import type { FunctionArgs } from "convex/server";
import { describe, expect, test } from "vite-plus/test";

import { api } from "./_generated/api";
import { errorCode, farmWithEditor, setup, type Test } from "./test.setup";

/** A Ram Born on the Farm, with only the fields that a Sheep must have. */
const ram: Omit<FunctionArgs<typeof api.sheep.register>, "farmId" | "ownerId"> = {
  tag: null,
  name: null,
  sex: "ram",
  birthDate: "2025-03-01",
  notes: null,
  weight: null,
  origin: "born",
  initialEntry: false,
};

/** Arashan as the list shows it: each Farm has it, and the UI gives its name. */
const arashan = { id: "arashan", name: null, archived: false, inUse: false };

async function breedRow(t: Test, breedId: string) {
  return t.run((ctx) => ctx.db.get(ctx.db.normalizeId("breeds", breedId)!));
}

async function breedAudit(t: Test) {
  const rows = await t.run((ctx) => ctx.db.query("auditLog").collect());
  return rows.filter((row) => row.targetKind === "Breed");
}

describe("breeds", () => {
  test("the list has Arashan first, then the Breeds that the Members added, by name", async () => {
    const t = setup();
    const { admin, editor, farmId } = await farmWithEditor(t);

    const second = await editor.mutation(api.breeds.add, { farmId, name: " Эдильбаевская " });
    const first = await admin.mutation(api.breeds.add, { farmId, name: "Гиссарская" });

    expect(await editor.query(api.breeds.list, { farmId })).toEqual([
      arashan,
      { id: first, name: "Гиссарская", archived: false, inUse: false },
      { id: second, name: "Эдильбаевская", archived: false, inUse: false },
    ]);
    const row = await breedRow(t, second);
    expect(row).toMatchObject({
      farmId,
      name: "Эдильбаевская",
      nameKey: breedNameKey("Эдильбаевская"),
      createdAt: expect.any(Number),
    });
    expect(row).not.toHaveProperty("archivedAt");
  });

  test("a name is taken whatever its case, also by an Archived Breed, but not in another Farm", async () => {
    const t = setup();
    const { admin, farmId } = await farmWithEditor(t);
    const other = await farmWithEditor(t, "Другая");
    const breedId = await admin.mutation(api.breeds.add, { farmId, name: "Гиссарская" });
    const second = await admin.mutation(api.breeds.add, { farmId, name: "Эдильбаевская" });
    await admin.mutation(api.breeds.setArchived, { farmId, breedId, archived: true });

    for (const name of ["гиссарская", " ГИССАРСКАЯ "]) {
      expect(await errorCode(admin.mutation(api.breeds.add, { farmId, name }))).toBe(
        "breed.nameTaken",
      );
      expect(
        await errorCode(admin.mutation(api.breeds.rename, { farmId, breedId: second, name })),
      ).toBe("breed.nameTaken");
    }
    expect(
      await other.admin.mutation(api.breeds.add, { farmId: other.farmId, name: "Гиссарская" }),
    ).toEqual(expect.any(String));
  });

  test("a renamed Breed gets the key of its new name, and frees the old one", async () => {
    const t = setup();
    const { admin, farmId } = await farmWithEditor(t);
    const breedId = await admin.mutation(api.breeds.add, { farmId, name: "Гисарская" });

    await admin.mutation(api.breeds.rename, { farmId, breedId, name: "Гиссарская" });

    expect(await breedRow(t, breedId)).toMatchObject({
      name: "Гиссарская",
      nameKey: breedNameKey("Гиссарская"),
    });
    expect(await errorCode(admin.mutation(api.breeds.add, { farmId, name: "гиссарская" }))).toBe(
      "breed.nameTaken",
    );
    expect(await admin.mutation(api.breeds.add, { farmId, name: "Гисарская" })).toEqual(
      expect.any(String),
    );
  });

  test("an Archived Breed stays in the list, and can come out of the archive", async () => {
    const t = setup();
    const { admin, farmId } = await farmWithEditor(t);
    const breedId = await admin.mutation(api.breeds.add, { farmId, name: "Гиссарская" });

    await admin.mutation(api.breeds.setArchived, { farmId, breedId, archived: true });
    expect(await breedRow(t, breedId)).toMatchObject({ archivedAt: expect.any(Number) });
    expect(await admin.query(api.breeds.list, { farmId })).toEqual([
      arashan,
      { id: breedId, name: "Гиссарская", archived: true, inUse: false },
    ]);

    await admin.mutation(api.breeds.setArchived, { farmId, breedId, archived: false });
    expect(await breedRow(t, breedId)).not.toHaveProperty("archivedAt");
    expect(await admin.query(api.breeds.list, { farmId })).toEqual([
      arashan,
      { id: breedId, name: "Гиссарская", archived: false, inUse: false },
    ]);
  });

  test("a Breed that a Sheep uses is not deleted; an unused one leaves the list and keeps its row", async () => {
    const t = setup();
    const { admin, farmId, membershipId } = await farmWithEditor(t);
    const used = await admin.mutation(api.breeds.add, { farmId, name: "Гиссарская" });
    const unused = await admin.mutation(api.breeds.add, { farmId, name: "Эдильбаевская" });
    await admin.mutation(api.sheep.register, {
      farmId,
      ...ram,
      ownerId: await membershipId("admin"),
      manualBreeds: [{ breedId: used, share: 500_000 }],
    });

    expect(await errorCode(admin.mutation(api.breeds.markDeleted, { farmId, breedId: used }))).toBe(
      "breed.inUse",
    );
    await admin.mutation(api.breeds.markDeleted, { farmId, breedId: unused });

    expect(await admin.query(api.breeds.list, { farmId })).toEqual([
      arashan,
      { id: used, name: "Гиссарская", archived: false, inUse: true },
    ]);
    expect(await breedRow(t, unused)).toMatchObject({
      name: "Эдильбаевская",
      deletedAt: expect.any(Number),
    });
    expect(
      await errorCode(
        admin.mutation(api.breeds.rename, { farmId, breedId: unused, name: "Новая" }),
      ),
    ).toBe("breed.notFound");
    // A Deleted Breed does not keep its name taken.
    expect(await admin.mutation(api.breeds.add, { farmId, name: "Эдильбаевская" })).toEqual(
      expect.any(String),
    );
  });

  test("each change of a Breed appends one audit entry for it", async () => {
    const t = setup();
    const { admin, farmId } = await farmWithEditor(t);

    const breedId = await admin.mutation(api.breeds.add, { farmId, name: "Гиссарская" });
    await admin.mutation(api.breeds.rename, { farmId, breedId, name: "Гиссарская курдючная" });
    await admin.mutation(api.breeds.setArchived, { farmId, breedId, archived: true });
    await admin.mutation(api.breeds.setArchived, { farmId, breedId, archived: false });
    await admin.mutation(api.breeds.markDeleted, { farmId, breedId });

    expect(
      (await breedAudit(t)).map(({ farmId, command, targetId }) => [farmId, command, targetId]),
    ).toEqual([
      [farmId, "breed.add", breedId],
      [farmId, "breed.rename", breedId],
      [farmId, "breed.archive", breedId],
      [farmId, "breed.unarchive", breedId],
      [farmId, "breed.delete", breedId],
    ]);
  });

  test("a Breed of another Farm, or a made-up id, is not found, and Arashan cannot change", async () => {
    const t = setup();
    const { admin, farmId, membershipId } = await farmWithEditor(t);
    const other = await farmWithEditor(t, "Другая");
    const stranger = await other.admin.mutation(api.breeds.add, {
      farmId: other.farmId,
      name: "Гиссарская",
    });
    const ownerId = await membershipId("admin");

    for (const breedId of [stranger, "not-an-id"]) {
      expect(
        await errorCode(admin.mutation(api.breeds.rename, { farmId, breedId, name: "Новая" })),
      ).toBe("breed.notFound");
      expect(
        await errorCode(
          admin.mutation(api.breeds.setArchived, { farmId, breedId, archived: true }),
        ),
      ).toBe("breed.notFound");
      expect(await errorCode(admin.mutation(api.breeds.markDeleted, { farmId, breedId }))).toBe(
        "breed.notFound",
      );
      expect(
        await errorCode(
          admin.mutation(api.sheep.register, {
            farmId,
            ...ram,
            ownerId,
            manualBreeds: [{ breedId, share: 500_000 }],
          }),
        ),
      ).toBe("breed.notFound");
    }
    expect(
      await errorCode(admin.mutation(api.breeds.markDeleted, { farmId, breedId: "arashan" })),
    ).toBe("breed.arashanLocked");
    expect(await admin.query(api.breeds.list, { farmId })).toEqual([arashan]);
  });
});

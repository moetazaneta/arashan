import { describe, expect, test } from "vite-plus/test";

import type { CommandContext } from "../context";
import { createFarm } from "../farms/commands";
import type { BreedId } from "../ids";
import { deleteSheep, registerSheep } from "../sheep/commands";
import { InMemoryStore } from "../testing/in-memory";
import { arashanBreedId } from "./breed";
import { addBreed, deleteBreed, listBreeds, renameBreed, setBreedArchived } from "./commands";

const settings = { currency: "KGS", timeZone: "Asia/Bishkek", lambAgeMonths: 4 };

async function setup() {
  const store = new InMemoryStore();
  const operator = store.addUser("operator", { operator: true });
  const { farmId } = await createFarm(operator, { name: "Арашан", ...settings });
  const editor = store.addMember("editor", farmId, "editor");
  const ownerId = store.memberships.at(-1)!.id;
  const as = (user: CommandContext = editor) => store.farmContext(user, farmId);
  /** A Sheep of the Editor without known parents, with the part of the Breed by hand. */
  const sheepOf = async (breedId: BreedId, percent = 50) =>
    registerSheep(await as(), {
      tag: null,
      name: null,
      sex: "ewe",
      birthDate: null,
      notes: null,
      weight: null,
      ownerId,
      origin: "born",
      initialEntry: true,
      manualBreeds: [{ breedId, share: percent * 10_000 }],
    });
  return { store, operator, farmId, editor, as, sheepOf };
}

describe("listBreeds", () => {
  test("a new Farm has the Breed Arashan, first, with no name of its own", async () => {
    const { as } = await setup();

    expect(await listBreeds(await as())).toEqual([
      { id: arashanBreedId, name: null, archived: false, inUse: false },
    ]);
  });

  test("gives Arashan first, then the Breeds by name, also the Archived ones, and which are in use", async () => {
    const { as, sheepOf } = await setup();
    const kurdyuk = await addBreed(await as(), { name: "Курдючная" });
    const edilbay = await addBreed(await as(), { name: "Эдильбаевская" });
    const hissar = await addBreed(await as(), { name: "Гиссарская" });
    await setBreedArchived(await as(), { breedId: kurdyuk, archived: true });
    await sheepOf(edilbay);

    expect(await listBreeds(await as())).toEqual([
      { id: arashanBreedId, name: null, archived: false, inUse: false },
      { id: hissar, name: "Гиссарская", archived: false, inUse: false },
      { id: kurdyuk, name: "Курдючная", archived: true, inUse: false },
      { id: edilbay, name: "Эдильбаевская", archived: false, inUse: true },
    ]);
  });

  test("does not give the Breeds of another Farm", async () => {
    const { store, operator, as } = await setup();
    const { farmId: otherFarmId } = await createFarm(operator, { name: "Другая", ...settings });
    const other = store.addMember("other", otherFarmId, "admin");
    await addBreed(await store.farmContext(other, otherFarmId), { name: "Гиссарская" });

    expect(await listBreeds(await as())).toHaveLength(1);
  });
});

describe("addBreed", () => {
  test("an Editor adds a Breed, with an audit entry", async () => {
    const { store, farmId, as } = await setup();

    const breedId = await addBreed(await as(), { name: "  Эдильбаевская   порода " });

    expect(store.breeds).toEqual([
      {
        id: breedId,
        farmId,
        name: "Эдильбаевская порода",
        archivedAt: null,
        createdAt: store.time,
      },
    ]);
    expect(store.audit.at(-1)).toMatchObject({
      command: "breed.add",
      farmId,
      target: { kind: "Breed", id: breedId },
    });
  });

  test.each(["Гиссарская", "гиссарская", " ГИССАРСКАЯ "])(
    "the name is unique in the Farm: %s is taken",
    async (name) => {
      const { as } = await setup();
      await addBreed(await as(), { name: "Гиссарская" });

      await expect(addBreed(await as(), { name })).rejects.toMatchObject({
        code: "breed.nameTaken",
      });
    },
  );

  test("the name of an Archived Breed stays taken, and of a Deleted one is free", async () => {
    const { as } = await setup();
    const archived = await addBreed(await as(), { name: "Гиссарская" });
    await setBreedArchived(await as(), { breedId: archived, archived: true });
    const deleted = await addBreed(await as(), { name: "Курдючная" });
    await deleteBreed(await as(), { breedId: deleted });

    await expect(addBreed(await as(), { name: "Гиссарская" })).rejects.toMatchObject({
      code: "breed.nameTaken",
    });
    await expect(addBreed(await as(), { name: "Курдючная" })).resolves.toEqual(expect.any(String));
  });

  // "Aрашан" starts with a Latin A.
  test.each(["Арашан", "арашан", "Aрашан", "Arashan"])(
    "the name of Arashan is taken: %s",
    async (name) => {
      const { as } = await setup();

      await expect(addBreed(await as(), { name })).rejects.toMatchObject({
        code: "breed.nameTaken",
      });
    },
  );

  test.each([
    ["   ", "breed.nameRequired"],
    ["x".repeat(61), "breed.nameTooLong"],
  ])("the name %j fails", async (name, code) => {
    const { as } = await setup();

    await expect(addBreed(await as(), { name })).rejects.toMatchObject({ code });
  });
});

describe("renameBreed", () => {
  test("a Member renames a Breed, and a rename to the same name writes nothing", async () => {
    const { store, as } = await setup();
    const breedId = await addBreed(await as(), { name: "Гисарская" });

    await renameBreed(await as(), { breedId, name: "Гиссарская" });
    await renameBreed(await as(), { breedId, name: " Гиссарская " });

    expect(store.breeds[0]?.name).toBe("Гиссарская");
    expect(store.audit.filter((e) => e.target.id === breedId).map((e) => e.command)).toEqual([
      "breed.add",
      "breed.rename",
    ]);
  });

  test("a Breed can change the case of its own name, but not take the name of another", async () => {
    const { store, as } = await setup();
    const breedId = await addBreed(await as(), { name: "гиссарская" });
    await addBreed(await as(), { name: "Курдючная" });

    await renameBreed(await as(), { breedId, name: "Гиссарская" });
    await expect(renameBreed(await as(), { breedId, name: "курдючная" })).rejects.toMatchObject({
      code: "breed.nameTaken",
    });
    expect(store.breeds[0]?.name).toBe("Гиссарская");
  });
});

describe("setBreedArchived", () => {
  test("a Breed in use can become Archived, and come back", async () => {
    const { store, as, sheepOf } = await setup();
    const breedId = await addBreed(await as(), { name: "Гиссарская" });
    await sheepOf(breedId);

    await setBreedArchived(await as(), { breedId, archived: true });
    expect(store.breeds[0]?.archivedAt).toBe(store.time);
    await setBreedArchived(await as(), { breedId, archived: true });
    await setBreedArchived(await as(), { breedId, archived: false });

    expect(store.breeds[0]?.archivedAt).toBeNull();
    expect(store.audit.filter((e) => e.target.id === breedId).map((e) => e.command)).toEqual([
      "breed.add",
      "breed.archive",
      "breed.unarchive",
    ]);
  });
});

describe("deleteBreed", () => {
  test("a Breed in use can only become Archived", async () => {
    const { store, as, sheepOf } = await setup();
    const breedId = await addBreed(await as(), { name: "Гиссарская" });
    await sheepOf(breedId);

    await expect(deleteBreed(await as(), { breedId })).rejects.toMatchObject({
      code: "breed.inUse",
    });
    expect(store.breeds[0]?.deletedAt).toBeUndefined();
  });

  test("a Breed that no Sheep uses becomes Deleted, with an audit entry", async () => {
    const { store, as } = await setup();
    const breedId = await addBreed(await as(), { name: "Гиссарская" });

    await deleteBreed(await as(), { breedId });

    expect(store.breeds[0]?.deletedAt).toBe(store.time);
    expect(await listBreeds(await as())).toHaveLength(1);
    expect(store.audit.at(-1)).toMatchObject({ command: "breed.delete", target: { id: breedId } });
  });

  test("a Breed of a Deleted Sheep only is not in use", async () => {
    const { as, sheepOf } = await setup();
    const breedId = await addBreed(await as(), { name: "Гиссарская" });
    const sheepId = await sheepOf(breedId);
    await deleteSheep(await as(), { sheepId });

    await expect(deleteBreed(await as(), { breedId })).resolves.toBeUndefined();
  });
});

test("Arashan cannot be renamed, archived or deleted", async () => {
  const { as } = await setup();
  const breedId = arashanBreedId;

  await expect(renameBreed(await as(), { breedId, name: "Другая" })).rejects.toMatchObject({
    code: "breed.arashanLocked",
  });
  await expect(setBreedArchived(await as(), { breedId, archived: true })).rejects.toMatchObject({
    code: "breed.arashanLocked",
  });
  await expect(deleteBreed(await as(), { breedId })).rejects.toMatchObject({
    code: "breed.arashanLocked",
  });
});

test("a Breed of another Farm is not found", async () => {
  const { store, operator, as } = await setup();
  const { farmId: otherFarmId } = await createFarm(operator, { name: "Другая", ...settings });
  const other = store.addMember("other", otherFarmId, "admin");
  const breedId = await addBreed(await store.farmContext(other, otherFarmId), {
    name: "Гиссарская",
  });

  await expect(renameBreed(await as(), { breedId, name: "Моя" })).rejects.toMatchObject({
    code: "breed.notFound",
  });
  await expect(deleteBreed(await as(), { breedId })).rejects.toMatchObject({
    code: "breed.notFound",
  });
});

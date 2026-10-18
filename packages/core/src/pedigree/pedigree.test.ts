import { describe, expect, test } from "vite-plus/test";

import { addBreed, setBreedArchived } from "../breeds/commands";
import { arashanBreedId } from "../breeds/breed";
import { createFarm } from "../farms/commands";
import type { BreedId, SheepId } from "../ids";
import {
  changeSheepOwner,
  deleteSheep,
  type ExternalSheepRegistration,
  registerExternalSheep,
  registerSheep,
  type SheepRegistration,
  type SheepUpdate,
  updateSheep,
} from "../sheep/commands";
import { getSheep, getSheepPedigree, listParentOptions, listSheep } from "../sheep/queries";
import type { Passport } from "../sheep/sheep";
import { InMemoryStore } from "../testing/in-memory";
import type { BreedComposition, BreedShare } from "./composition";

// The rules of the pedigree, the Breed composition, the Passport and the Grade, on one pedigree of
// four generations (`pedigree`). The time is 2026-10-18 18:00 in Bishkek, the time zone of the Farm.

const settings = { currency: "KGS", timeZone: "Asia/Bishkek", lambAgeMonths: 4 };

/** A part in percent, as a test reads it. */
const part = (breedId: BreedId, percent: number): BreedShare => ({
  breedId,
  share: Math.round(percent * 10_000),
});

async function setup() {
  const store = new InMemoryStore();
  const operator = store.addUser("operator", { operator: true });
  const { farmId } = await createFarm(operator, { name: "Арашан", ...settings });
  const editor = store.addMember("editor", farmId, "editor");
  const ownerId = store.memberships.at(-1)!.id;
  const ctx = () => store.farmContext(editor, farmId);
  const edilbay = await addBreed(await ctx(), { name: "Эдильбаевская" });

  /** Registers an Initial entry of an Ewe of the Editor, with no other data. */
  const register = async (change: Partial<SheepRegistration> = {}) =>
    registerSheep(await ctx(), {
      tag: null,
      name: null,
      sex: "ewe",
      birthDate: null,
      notes: null,
      weight: null,
      ownerId,
      origin: "born",
      initialEntry: true,
      ...change,
    });
  const external = async (change: Partial<ExternalSheepRegistration> = {}) =>
    registerExternalSheep(await ctx(), {
      tag: null,
      name: null,
      sex: "ram",
      birthDate: null,
      notes: null,
      ...change,
    });
  /** Changes the Sheep: the fields that `change` does not have stay the same. */
  const update = async (sheepId: SheepId, change: Partial<Omit<SheepUpdate, "sheepId">> = {}) => {
    const sheep = store.sheep.find((s) => s.id === sheepId)!;
    const { tag, name, sex, birthDate, notes, weight } = sheep;
    return updateSheep(await ctx(), {
      sheepId,
      tag,
      name,
      sex,
      birthDate,
      notes,
      weight,
      ...change,
    });
  };
  const card = async (sheepId: SheepId) => (await getSheep(await ctx(), { sheepId }))!;
  /** The Breed composition of the Sheep in percent: Arashan, Эдильбаевская and Unknown. */
  const percents = async (sheepId: SheepId) => {
    const { composition } = await card(sheepId);
    return inPercent(composition, edilbay);
  };
  return {
    store,
    farmId,
    editor,
    ownerId,
    ctx,
    edilbay,
    register,
    external,
    update,
    card,
    percents,
  };
}

function inPercent(composition: BreedComposition, edilbay: BreedId) {
  const named: Record<string, number> = {};
  for (const { breedId, share } of composition.breeds) {
    const name = breedId === arashanBreedId ? "arashan" : breedId === edilbay ? "edilbay" : breedId;
    named[name] = share / 10_000;
  }
  if (composition.unknown > 0) named.unknown = composition.unknown / 10_000;
  return named;
}

/**
 * Four generations:
 *
 *   A  Ewe 2015, Arashan 100 % by hand      B  Ram 2014, External, Arashan 100 % by hand
 *   C  Ewe 2016, nothing by hand            D  Ram 2015, Эдильбаевская 100 % by hand
 *   AB Ewe 2018 = A × B                     CD Ram 2018 = C × D
 *   X  Ewe 2021 = AB × CD
 *   Y  Ewe 2026-03-01 = X × an unknown Father
 */
async function pedigree() {
  const farm = await setup();
  const { register, external, edilbay } = farm;
  const a = await register({
    tag: "A",
    birthDate: "2015-04-01",
    manualBreeds: [part(arashanBreedId, 100)],
  });
  const b = await external({
    tag: "B",
    sex: "ram",
    birthDate: "2014-04-01",
    manualBreeds: [part(arashanBreedId, 100)],
  });
  const c = await register({ tag: "C", birthDate: "2016-04-01" });
  const d = await register({
    tag: "D",
    sex: "ram",
    birthDate: "2015-04-01",
    manualBreeds: [part(edilbay, 100)],
  });
  const ab = await register({ tag: "AB", birthDate: "2018-04-01", motherId: a, fatherId: b });
  const cd = await register({
    tag: "CD",
    sex: "ram",
    birthDate: "2018-04-01",
    motherId: c,
    fatherId: d,
  });
  const x = await register({ tag: "X", birthDate: "2021-04-01", motherId: ab, fatherId: cd });
  const y = await register({ tag: "Y", birthDate: "2026-03-01", motherId: x });
  return { ...farm, a, b, c, d, ab, cd, x, y };
}

const aPassport = (change: Partial<Passport> = {}): Passport => ({
  number: "KG 000123",
  issueDate: "2026-05-01",
  scanId: null,
  ...change,
});

describe("the Breed composition", () => {
  test("of a child is the average of its parents, over four generations", async () => {
    const { percents, a, b, c, d, ab, cd, x, y } = await pedigree();

    expect(await percents(a)).toEqual({ arashan: 100 });
    expect(await percents(b)).toEqual({ arashan: 100 });
    expect(await percents(c)).toEqual({ unknown: 100 });
    expect(await percents(d)).toEqual({ edilbay: 100 });
    expect(await percents(ab)).toEqual({ arashan: 100 });
    expect(await percents(cd)).toEqual({ edilbay: 50, unknown: 50 });
    expect(await percents(x)).toEqual({ arashan: 50, edilbay: 25, unknown: 25 });
    // The unknown Father gives 50 percent Unknown.
    expect(await percents(y)).toEqual({ arashan: 25, edilbay: 12.5, unknown: 62.5 });
  });

  test("is 100 percent Unknown by default for a Sheep without known parents", async () => {
    const { register, percents } = await setup();

    expect(await percents(await register())).toEqual({ unknown: 100 });
  });

  test("changes for all descendants when a Sheep changes", async () => {
    const { update, percents, c, cd, x, y } = await pedigree();

    await update(c, { manualBreeds: [part(arashanBreedId, 100)] });

    expect(await percents(cd)).toEqual({ arashan: 50, edilbay: 50 });
    expect(await percents(x)).toEqual({ arashan: 75, edilbay: 25 });
    expect(await percents(y)).toEqual({ arashan: 37.5, edilbay: 12.5, unknown: 50 });
  });

  test("changes for all descendants when a parent changes", async () => {
    const { register, update, percents, cd, x, y } = await pedigree();
    const arashanRam = await register({
      sex: "ram",
      birthDate: "2017-01-01",
      manualBreeds: [part(arashanBreedId, 100)],
    });

    await update(x, { fatherId: arashanRam });

    expect(await percents(x)).toEqual({ arashan: 100 });
    expect(await percents(y)).toEqual({ arashan: 50, unknown: 50 });
    expect(await percents(cd)).toEqual({ edilbay: 50, unknown: 50 });
  });

  test("the table and the parent choices show the composition too", async () => {
    const { ctx, edilbay, x, b } = await pedigree();

    const row = (await listSheep(await ctx())).find((s) => s.id === x)!;
    const option = (await listParentOptions(await ctx())).find((s) => s.id === b)!;

    expect(inPercent(row.composition, edilbay)).toEqual({ arashan: 50, edilbay: 25, unknown: 25 });
    expect(inPercent(option.composition, edilbay)).toEqual({ arashan: 100 });
  });

  describe("by hand", () => {
    test("a Member gives only the Unknown part of the unknown Father: up to 50 percent", async () => {
      const { update, percents, y } = await pedigree();

      await expect(
        update(y, { manualBreeds: [part(arashanBreedId, 50.0001)] }),
      ).rejects.toMatchObject({
        code: "sheep.breedsTooLarge",
      });
      await update(y, { manualBreeds: [part(arashanBreedId, 50)] });

      expect(await percents(y)).toEqual({ arashan: 75, edilbay: 12.5, unknown: 12.5 });
    });

    test("a Sheep with both parents known has no part by hand", async () => {
      const { update, x } = await pedigree();

      await expect(update(x, { manualBreeds: [part(arashanBreedId, 1)] })).rejects.toMatchObject({
        code: "sheep.breedsTooLarge",
      });
    });

    test("a Sheep without known parents gets up to 100 percent, the rest stays Unknown", async () => {
      const { register, percents, edilbay } = await setup();

      const sheepId = await register({
        manualBreeds: [part(arashanBreedId, 60), part(edilbay, 30)],
      });

      expect(await percents(sheepId)).toEqual({ arashan: 60, edilbay: 30, unknown: 10 });
    });

    test("the parts by hand go away when both parents become known", async () => {
      const { store, register, update, percents, a } = await pedigree();
      const ram = await register({ sex: "ram", birthDate: "2014-01-01" });
      const lamb = await register({
        birthDate: "2026-04-01",
        motherId: a,
        manualBreeds: [part(arashanBreedId, 50)],
      });

      await update(lamb, { fatherId: ram });

      expect(store.sheep.find((s) => s.id === lamb)?.manualBreeds).toEqual([]);
      expect(await percents(lamb)).toEqual({ arashan: 50, unknown: 50 });
    });

    test("a Breed is one of the Farm, and a form cannot add an Archived one", async () => {
      const { ctx, register, update, store, edilbay } = await setup();
      const sheepId = await register({ manualBreeds: [part(edilbay, 50)] });
      const hissar = await addBreed(await ctx(), { name: "Гиссарская" });
      await setBreedArchived(await ctx(), { breedId: hissar, archived: true });
      await setBreedArchived(await ctx(), { breedId: edilbay, archived: true });

      await expect(
        register({ manualBreeds: [part("breed-x" as BreedId, 10)] }),
      ).rejects.toMatchObject({
        code: "breed.notFound",
      });
      await expect(register({ manualBreeds: [part(hissar, 10)] })).rejects.toMatchObject({
        code: "breed.archived",
      });
      // The Sheep keeps the part of an Archived Breed that it had.
      await update(sheepId, { manualBreeds: [part(edilbay, 40)] });
      expect(store.sheep.find((s) => s.id === sheepId)?.manualBreeds).toEqual([part(edilbay, 40)]);
    });
  });
});

describe("the parents", () => {
  test("are optional, and the card shows them and the children", async () => {
    const { card, a, ab, x, y } = await pedigree();

    const ofX = await card(x);
    expect(ofX.mother).toEqual({ id: ab, tag: "AB", name: null, sex: "ewe", origin: "born" });
    expect(ofX.father?.tag).toBe("CD");
    expect(ofX.children.map((child) => child.id)).toEqual([y]);
    expect((await card(y)).father).toBeNull();
    expect((await card(a)).mother).toBeNull();
  });

  test("the Mother is an Ewe, and the Father is a Ram", async () => {
    const { register, a, d } = await pedigree();

    await expect(register({ motherId: d })).rejects.toMatchObject({
      code: "pedigree.motherNotEwe",
    });
    await expect(register({ fatherId: a })).rejects.toMatchObject({
      code: "pedigree.fatherNotRam",
    });
  });

  test("a parent is a Sheep of the Farm, also an External one or one that is not Active", async () => {
    const { store, register, ab, b } = await pedigree();
    store.sheep.find((s) => s.id === ab)!.status = "sold";

    await expect(register({ motherId: "sheep-x" as SheepId })).rejects.toMatchObject({
      code: "pedigree.parentNotFound",
    });
    await expect(register({ motherId: ab, fatherId: b })).resolves.toEqual(expect.any(String));
  });

  test("were born before the child, if both dates are known", async () => {
    const { register, update, ab, b, x } = await pedigree();

    await expect(register({ birthDate: "2018-04-01", motherId: ab })).rejects.toMatchObject({
      code: "pedigree.parentBornAfterChild",
    });
    await expect(
      register({ birthDate: "2017-01-01", fatherId: b, motherId: ab }),
    ).rejects.toMatchObject({
      code: "pedigree.parentBornAfterChild",
    });
    // A date that nobody knows does not count.
    await expect(register({ birthDate: null, motherId: ab })).resolves.toEqual(expect.any(String));
    // The rule holds when a parent or a child changes the birth date later.
    await expect(update(x, { birthDate: "2017-01-01" })).rejects.toMatchObject({
      code: "pedigree.parentBornAfterChild",
    });
    await expect(update(ab, { birthDate: "2021-04-01" })).rejects.toMatchObject({
      code: "pedigree.parentBornAfterChild",
    });
  });

  test("a parent keeps its sex", async () => {
    const { update, a, d } = await pedigree();

    await expect(update(a, { sex: "ram" })).rejects.toMatchObject({
      code: "pedigree.parentSexLocked",
    });
    await expect(update(d, { sex: "ewe" })).rejects.toMatchObject({
      code: "pedigree.parentSexLocked",
    });
  });

  describe("a Sheep cannot be its own ancestor", () => {
    /** Three generations of Ewes without birth dates, so that the dates do not stop a cycle. */
    async function line() {
      const farm = await setup();
      const grandmother = await farm.register({ tag: "G" });
      const mother = await farm.register({ tag: "M", motherId: grandmother });
      const daughter = await farm.register({ tag: "D", motherId: mother });
      return { ...farm, grandmother, mother, daughter };
    }

    test("not its own parent", async () => {
      const { update, grandmother } = await line();

      await expect(update(grandmother, { motherId: grandmother })).rejects.toMatchObject({
        code: "pedigree.ownAncestor",
      });
    });

    test("not the parent of its ancestor, three generations up", async () => {
      const { store, update, grandmother, mother, daughter } = await line();

      await expect(update(grandmother, { motherId: daughter })).rejects.toMatchObject({
        code: "pedigree.ownAncestor",
      });
      await expect(update(mother, { motherId: daughter })).rejects.toMatchObject({
        code: "pedigree.ownAncestor",
      });
      expect(store.sheep.find((s) => s.id === grandmother)?.motherId).toBeNull();
    });

    test("a Sheep of another line is a good parent", async () => {
      const { register, update, grandmother } = await line();
      const other = await register({ tag: "O" });

      await expect(update(grandmother, { motherId: other })).resolves.toBeUndefined();
    });
  });

  test("a Sheep that is the parent of another Sheep cannot become Deleted", async () => {
    const { store, ctx, a, b, y } = await pedigree();

    await expect(deleteSheep(await ctx(), { sheepId: a })).rejects.toMatchObject({
      code: "sheep.isParent",
    });
    await expect(deleteSheep(await ctx(), { sheepId: b })).rejects.toMatchObject({
      code: "sheep.isParent",
    });
    await deleteSheep(await ctx(), { sheepId: y });

    expect(store.sheep.find((s) => s.id === y)?.deletedAt).toBe(store.time);
    expect(store.sheep.find((s) => s.id === a)?.deletedAt).toBeUndefined();
  });

  test("a Deleted Sheep cannot become a parent", async () => {
    const { ctx, register, y } = await pedigree();
    await deleteSheep(await ctx(), { sheepId: y });

    await expect(register({ motherId: y })).rejects.toMatchObject({
      code: "pedigree.parentNotFound",
    });
  });

  test("the pedigree tree shows three generations of ancestors", async () => {
    const { ctx, edilbay, y } = await pedigree();

    const tree = (await getSheepPedigree(await ctx(), { sheepId: y }))!;

    expect(tree.tag).toBe("Y");
    expect(tree.father).toBeNull();
    expect(tree.mother?.tag).toBe("X");
    expect([tree.mother?.mother?.tag, tree.mother?.father?.tag]).toEqual(["AB", "CD"]);
    const greatGrandparents = [tree.mother?.mother, tree.mother?.father].flatMap((node) => [
      node?.mother?.tag,
      node?.father?.tag,
    ]);
    expect(greatGrandparents).toEqual(["A", "B", "C", "D"]);
    // The last generation of the tree has no parents in it: its own card shows them.
    expect(tree.mother?.mother?.mother).not.toHaveProperty("mother");
    expect(inPercent(tree.mother!.father!.composition, edilbay)).toEqual({
      edilbay: 50,
      unknown: 50,
    });
  });
});

describe("an External Sheep", () => {
  test("has no Owner, is not in the table, and can be a parent", async () => {
    const { store, ctx, b, ab } = await pedigree();

    expect(store.sheep.find((s) => s.id === b)).toMatchObject({
      origin: "external",
      ownerId: null,
      initialEntry: false,
    });
    expect(store.audit.find((e) => e.target.id === b)?.command).toBe("sheep.registerExternal");
    const rows = await listSheep(await ctx());
    expect(rows.map((row) => row.tag)).not.toContain("B");
    expect(rows.map((row) => row.id)).toContain(ab);
    expect((await listParentOptions(await ctx())).map((option) => option.tag)).toContain("B");
  });

  test("has a Tag that is optional and not checked for uniqueness", async () => {
    const { register, external, store } = await setup();
    await register({ tag: "A-12" });

    await external({ tag: "A-12" });
    await external({ tag: "а-12" });
    await external({ tag: null });

    expect(store.sheep.map((s) => s.tag)).toEqual(["A-12", "A-12", "а-12", null]);
    // An External Sheep does not take a Tag of the Farm either.
    await expect(register({ tag: "B-1" })).resolves.toEqual(expect.any(String));
  });

  test("has a card, a Member can change it, but it has no Owner to change", async () => {
    const { ctx, card, update, ownerId, b } = await pedigree();

    expect((await card(b)).origin).toBe("external");
    await update(b, { name: "Чемпион" });
    expect((await card(b)).name).toBe("Чемпион");
    await expect(
      changeSheepOwner(await ctx(), { sheepId: b, ownerId, date: "2026-10-01" }),
    ).rejects.toMatchObject({ code: "sheep.notFound" });
  });
});

describe("the Passport", () => {
  test("only a Sheep with 100 percent Arashan can have one", async () => {
    const { update, card, ab, x } = await pedigree();

    await update(ab, { passport: aPassport({ number: "  KG   000123 " }) });
    expect((await card(ab)).passport).toEqual({
      number: "KG 000123",
      issueDate: "2026-05-01",
      scan: null,
    });

    await expect(update(x, { passport: aPassport() })).rejects.toMatchObject({
      code: "passport.notArashan",
    });
  });

  test("a Sheep with the Unknown part by hand set to Arashan can have one", async () => {
    const { register, card } = await setup();

    const sheepId = await register({
      manualBreeds: [part(arashanBreedId, 100)],
      passport: aPassport(),
    });

    expect((await card(sheepId)).hasPassport).toBe(true);
  });

  test("a change that makes the Sheep not 100 percent Arashan fails", async () => {
    const { update, ab, c } = await pedigree();
    await update(ab, { passport: aPassport() });

    await expect(update(ab, { motherId: c })).rejects.toMatchObject({
      code: "passport.notArashan",
    });
  });

  test("a change of an ancestor that makes a descendant with a Passport not 100 percent Arashan fails", async () => {
    const { store, register, update, percents, a, ab, b } = await pedigree();
    // AB × B: 100 percent Arashan, two generations under A.
    const pure = await register({
      birthDate: "2020-04-01",
      motherId: ab,
      fatherId: b,
      passport: aPassport(),
    });

    await expect(update(a, { manualBreeds: [part(arashanBreedId, 50)] })).rejects.toMatchObject({
      code: "passport.descendantNotArashan",
    });
    await expect(update(b, { manualBreeds: [] })).rejects.toMatchObject({
      code: "passport.descendantNotArashan",
    });
    expect(await percents(pure)).toEqual({ arashan: 100 });

    // Without the Passport of the descendant, the change goes through.
    await update(pure, { passport: null });
    await update(a, { manualBreeds: [part(arashanBreedId, 50)] });
    expect(await percents(pure)).toEqual({ arashan: 87.5, unknown: 12.5 });
    expect(store.sheep.find((s) => s.id === pure)?.passport).toBeNull();
  });

  test("a Sheep that is almost 100 percent Arashan does not give a pure child by rounding", async () => {
    const { register, a } = await pedigree();
    const ram = await register({
      sex: "ram",
      birthDate: "2015-01-01",
      manualBreeds: [{ breedId: arashanBreedId, share: 999_999 }],
    });

    await expect(
      register({ birthDate: "2020-01-01", motherId: a, fatherId: ram, passport: aPassport() }),
    ).rejects.toMatchObject({ code: "passport.notArashan" });
  });

  test("a change that keeps the ancestors 100 percent Arashan does not touch the Passports", async () => {
    const { register, update, ab, b } = await pedigree();
    await register({ birthDate: "2020-04-01", motherId: ab, fatherId: b, passport: aPassport() });

    await expect(update(ab, { name: "Белка" })).resolves.toBeUndefined();
  });

  test.each([
    [{ number: "  " }, "passport.numberRequired"],
    [{ number: "1".repeat(51) }, "passport.numberTooLong"],
    [{ issueDate: "2026-10-19" }, "passport.issueDateInvalid"],
    [{ issueDate: "2026-02-30" }, "passport.issueDateInvalid"],
  ])("the fields are checked: %o", async (change, code) => {
    const { update, ab } = await pedigree();

    await expect(update(ab, { passport: aPassport(change) })).rejects.toMatchObject({ code });
  });

  test("the issue date is not before the birth date", async () => {
    const { update, ab } = await pedigree();

    await expect(
      update(ab, { passport: aPassport({ issueDate: "2018-03-31" }) }),
    ).rejects.toMatchObject({
      code: "passport.issueDateInvalid",
    });
    await expect(
      update(ab, { passport: aPassport({ issueDate: "2018-04-01" }) }),
    ).resolves.toBeUndefined();
  });

  describe("the scan", () => {
    test("is a file of the storage, and the card gives its URL", async () => {
      const { store, update, card, ab } = await pedigree();
      const scanId = store.addFile({ size: 300_000, contentType: "image/jpeg" });

      await update(ab, { passport: aPassport({ scanId }) });

      expect((await card(ab)).passport?.scan).toEqual({
        id: scanId,
        url: `https://files.test/${scanId}`,
      });
    });

    test.each([
      ["no file", null],
      ["a file of more than 10 MB", { size: 10 * 1024 * 1024 + 1, contentType: "application/pdf" }],
      ["a file that is no PDF or photo", { size: 1000, contentType: "text/html" }],
      ["a HEIC photo, which browsers cannot show", { size: 1000, contentType: "image/heic" }],
    ])("fails for %s", async (_, file) => {
      const { store, update, ab } = await pedigree();
      const scanId = file === null ? ("file-x" as never) : store.addFile(file);

      await expect(update(ab, { passport: aPassport({ scanId }) })).rejects.toMatchObject({
        code: "passport.scanInvalid",
      });
    });

    test("of a type that the storage does not know is accepted by its size", async () => {
      const { store, update, ab } = await pedigree();
      const scanId = store.addFile({ size: 1000, contentType: null });

      await expect(update(ab, { passport: aPassport({ scanId }) })).resolves.toBeUndefined();
    });

    test("a change of other fields does not check the scan again", async () => {
      const { store, update, ab } = await pedigree();
      const scanId = store.addFile();
      await update(ab, { passport: aPassport({ scanId }) });
      store.files.delete(scanId);

      await expect(update(ab, { name: "Белка" })).resolves.toBeUndefined();
    });
  });
});

describe("the Grade", () => {
  test("is optional, and a Sheep keeps only the last one", async () => {
    const { store, register, update, card } = await setup();
    const sheepId = await register({ birthDate: "2025-03-01" });
    expect((await card(sheepId)).grade).toBeNull();

    await update(sheepId, { grade: { grade: "first", date: "2026-06-01" } });
    await update(sheepId, { grade: { grade: "elite", date: "2026-09-01" } });

    expect((await card(sheepId)).grade).toEqual({ grade: "elite", date: "2026-09-01" });
    expect(store.audit.filter((e) => e.target.id === sheepId).map((e) => e.command)).toEqual([
      "sheep.register",
      "sheep.update",
      "sheep.update",
    ]);
  });

  test("does not depend on the Passport", async () => {
    const { register, card } = await setup();

    const sheepId = await register({ grade: { grade: "second", date: "2026-06-01" } });

    expect((await card(sheepId)).hasPassport).toBe(false);
    expect((await card(sheepId)).grade?.grade).toBe("second");
  });

  test.each(["2026-10-19", "2025-02-28", "2026-13-01"])(
    "the grading date %s is not in the future and not before the birth date",
    async (date) => {
      const { register } = await setup();

      await expect(
        register({ birthDate: "2025-03-01", grade: { grade: "elite", date } }),
      ).rejects.toMatchObject({ code: "sheep.gradeDateInvalid" });
    },
  );
});

test("a change of the pedigree is one audit entry of the Sheep, and a change to the same is none", async () => {
  const { store, update, x, ab } = await pedigree();
  const before = store.audit.length;

  await update(x, { motherId: ab });
  expect(store.audit).toHaveLength(before);

  await update(x, { grade: { grade: "first", date: "2026-06-01" } });
  expect(store.audit.slice(before).map((e) => [e.command, e.target.id])).toEqual([
    ["sheep.update", x],
  ]);
});

import { describe, expect, test } from "vite-plus/test";

import type { CommandContext } from "../context";
import { addSample, deleteSample, listSamples } from "./commands";
import { InMemorySampleRepository } from "./in-memory";
import type { SampleId } from "./sample";

function setup() {
  const samples = new InMemorySampleRepository();
  const ctx: CommandContext = { repos: { samples }, now: () => 1_700_000_000_000 };
  return { ctx, samples };
}

describe("addSample", () => {
  test("adds a Sample with the trimmed name", async () => {
    const { ctx } = setup();

    const id = await addSample(ctx, { name: "  Первый  " });

    expect(await listSamples(ctx)).toEqual([{ id, name: "Первый" }]);
  });

  test("rejects an empty name", async () => {
    const { ctx } = setup();

    await expect(addSample(ctx, { name: "   " })).rejects.toMatchObject({
      name: "DomainError",
      code: "sample.nameRequired",
    });
  });

  test("rejects a name that another Sample has", async () => {
    const { ctx } = setup();
    await addSample(ctx, { name: "Первый" });

    await expect(addSample(ctx, { name: " Первый " })).rejects.toMatchObject({
      code: "sample.nameTaken",
    });
  });

  test("accepts the name of a Deleted Sample", async () => {
    const { ctx } = setup();
    const id = await addSample(ctx, { name: "Первый" });
    await deleteSample(ctx, { id });

    await expect(addSample(ctx, { name: "Первый" })).resolves.toBeTypeOf("string");
  });
});

describe("deleteSample", () => {
  test("marks the Sample Deleted at the time now, and the list hides it", async () => {
    const { ctx, samples } = setup();
    const id = await addSample(ctx, { name: "Первый" });

    await deleteSample(ctx, { id });

    expect(await listSamples(ctx)).toEqual([]);
    expect(samples.records).toEqual([{ id, name: "Первый", deletedAt: 1_700_000_000_000 }]);
  });

  test("rejects a Sample that does not exist", async () => {
    const { ctx } = setup();

    await expect(deleteSample(ctx, { id: "missing" as SampleId })).rejects.toMatchObject({
      code: "sample.notFound",
    });
  });

  test("rejects a Sample that is already Deleted", async () => {
    const { ctx } = setup();
    const id = await addSample(ctx, { name: "Первый" });
    await deleteSample(ctx, { id });

    await expect(deleteSample(ctx, { id })).rejects.toMatchObject({ code: "sample.notFound" });
  });
});

import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vite-plus/test";

import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

function setup() {
  return convexTest(schema, modules);
}

describe("samples", () => {
  test("add stores the Sample, and list returns it by name", async () => {
    const t = setup();

    const first = await t.mutation(api.samples.add, { name: " Первый " });
    const second = await t.mutation(api.samples.add, { name: "Второй" });

    expect(await t.query(api.samples.list, {})).toEqual([
      { id: second, name: "Второй" },
      { id: first, name: "Первый" },
    ]);
  });

  test("a broken rule reaches the client as a ConvexError with the code", async () => {
    const t = setup();
    await t.mutation(api.samples.add, { name: "Первый" });

    const error = await t.mutation(api.samples.add, { name: "Первый" }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConvexError);
    expect((error as ConvexError<{ code: string }>).data).toEqual({ code: "sample.nameTaken" });
  });

  test("delete keeps the record, and the reads hide it", async () => {
    const t = setup();
    const id = await t.mutation(api.samples.add, { name: "Первый" });

    await t.mutation(api.samples.delete, { id });

    expect(await t.query(api.samples.list, {})).toEqual([]);
    const rows = await t.run((ctx) => ctx.db.query("samples").collect());
    expect(rows).toMatchObject([{ name: "Первый", deletedAt: expect.any(Number) }]);
    await expect(t.mutation(api.samples.add, { name: "Первый" })).resolves.toBeTypeOf("string");
  });

  test("delete of an unknown id is a domain error", async () => {
    const t = setup();

    const error = await t
      .mutation(api.samples.delete, { id: "not-an-id" })
      .catch((e: unknown) => e);

    expect((error as ConvexError<{ code: string }>).data).toEqual({ code: "sample.notFound" });
  });
});

import { getAppVersion } from "@arashan/core";
import { convexTest } from "convex-test";
import { expect, test } from "vite-plus/test";

import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

test("the version query returns the app version of the core", async () => {
  const t = convexTest(schema, modules);

  expect(await t.query(api.app.version, {})).toBe(getAppVersion());
});

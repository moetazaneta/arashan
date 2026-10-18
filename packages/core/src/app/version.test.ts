import { expect, test } from "vite-plus/test";

import { getAppVersion } from "./version";

test("the app version is a semantic version", () => {
  expect(getAppVersion()).toMatch(/^\d+\.\d+\.\d+$/);
});

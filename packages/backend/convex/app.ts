import { getAppVersion } from "@arashan/core";

import { query } from "./lib/functions";

export const version = query({
  args: {},
  handler: () => getAppVersion(),
});

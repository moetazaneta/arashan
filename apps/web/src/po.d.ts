// A catalog, compiled by @lingui/vite-plugin when a module imports it.
declare module "*.po" {
  import type { Messages } from "@lingui/core";
  export const messages: Messages;
}

import { defineConfig } from "@lingui/conf";
import { formatter } from "@lingui/format-po";

// The UI text is Russian in the code, and English is a translation (ADR 0004). All the UI text is in
// this app: the core gives error codes, and the client has no text.
export default defineConfig({
  sourceLocale: "ru",
  locales: ["ru", "en"],
  catalogs: [{ path: "<rootDir>/src/locales/{locale}/messages", include: ["<rootDir>/src"] }],
  // No line numbers, so that a change elsewhere in a file does not change the catalogs.
  format: formatter({ lineNumbers: false }),
});

import { defineConfig } from "vite-plus";

// Generated files (TanStack Router's route tree and Convex's `_generated`), the vendored agent skills,
// and Markdown, which the formatter would rewrap.
const staticCheckIgnorePatterns = [
  "apps/web/src/routeTree.gen.ts",
  "packages/backend/convex/_generated/**",
  ".agents/**",
  ".claude/**",
  ".github/skills/**",
  "**/*.md",
];

// A workspace package is imported by its name, through its package.json, never by path.
const byNameOnly = {
  group: ["**/packages/*/src/**", "**/apps/*/src/**"],
  message: "Import a workspace package by its name, never by path.",
};

export default defineConfig({
  // A bare `vp dev`, `vp build` or `vp preview` at the root acts on the web app. With any option,
  // such as `--port`, vp ignores this: use `vp -C apps/web dev`.
  defaultPackage: "./apps/web",
  test: {
    // Each package's own vite.config.ts, as its own Vitest project.
    projects: ["apps/*", "packages/*"],
  },
  run: {
    tasks: {
      // What CI runs on every pull request and push to main, and what to run before opening a PR.
      // Each step is cached: a step whose inputs didn't change replays its last output. `i18n`
      // checks the message catalogs of the web app (ADR 0004).
      ready: ["vp check", "vp run -r unit", "vp run -r i18n", "vp build"],
    },
  },
  fmt: {
    ignorePatterns: staticCheckIgnorePatterns,
  },
  lint: {
    ignorePatterns: staticCheckIgnorePatterns,
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      "no-restricted-imports": ["error", { patterns: [byNameOnly] }],
    },
    // An override replaces the options of a rule, so each one repeats `byNameOnly`.
    overrides: [
      {
        // The views get data only through the hooks of @arashan/client (ADR 0006).
        files: ["apps/web/src/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                byNameOnly,
                {
                  group: ["convex", "convex/*", "@convex-dev/*", "**/_generated/*"],
                  message:
                    "A view uses only the hooks of @arashan/client, never Convex (ADR 0006).",
                },
                {
                  group: ["@arashan/backend", "@arashan/backend/*"],
                  message:
                    "A view uses only the hooks of @arashan/client, never the backend (ADR 0006).",
                },
              ],
            },
          ],
        },
      },
      {
        // The core is pure TypeScript, so that it can run anywhere (ADR 0001).
        files: ["packages/core/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                byNameOnly,
                {
                  group: [
                    "convex",
                    "convex/*",
                    "react",
                    "react/*",
                    "react-dom",
                    "@tanstack/*",
                    "@arashan/*",
                  ],
                  message: "The core imports no framework and no other layer (ADR 0001).",
                },
              ],
            },
          ],
        },
      },
    ],
    options: { typeAware: true, typeCheck: true },
  },
});

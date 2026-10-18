import { defineConfig } from "vite-plus";

// Generated files (TanStack Router's route tree), the vendored agent skills, and Markdown, which the
// formatter would rewrap.
const staticCheckIgnorePatterns = [
  "apps/web/src/routeTree.gen.ts",
  ".agents/**",
  ".claude/**",
  "**/*.md",
];

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
      // Each step is cached: a step whose inputs didn't change replays its last output.
      ready: ["vp check", "vp run -r unit", "vp build"],
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
      // A workspace package is imported by its name, through its package.json, never by path.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/packages/*/src/**", "**/apps/*/src/**"],
              message: "Import a workspace package by its name, never by path.",
            },
          ],
        },
      ],
    },
    options: { typeAware: true, typeCheck: true },
  },
});

import { convexDev } from "@arashan/backend/vite";
import { lingui } from "@lingui/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig(({ command }) => ({
  plugins: [
    // The router plugin must run before React's.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    lingui({
      // The plugin looks for lingui.config.ts from this directory, also when vp runs from the root.
      cwd: import.meta.dirname,
      // Compiles the macros without Babel.
      macroTransform: true,
      // A production build fails if a message has no English translation.
      failOnMissing: command === "build",
      failOnCompileError: true,
    }),
    tailwindcss(),
    // `vp dev` starts the Convex backend too.
    convexDev(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  run: {
    tasks: {
      // This package's tests as a cached task, so `vp run ready` replays them when nothing they read
      // changed.
      unit: "vp test",
      // Fails if the catalogs differ from what `lingui extract --clean` writes, or if a message has
      // no English translation. Neither command writes a file.
      i18n: ["lingui check sync --clean", "lingui check missing"],
    },
  },
  test: {
    name: "web",
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
}));

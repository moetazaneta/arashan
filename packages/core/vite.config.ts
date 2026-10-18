import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    // This package's tests as a cached task, so `vp run ready` replays them when nothing they read
    // changed.
    tasks: { unit: "vp test" },
  },
  test: {
    name: "core",
    include: ["src/**/*.test.ts"],
  },
});

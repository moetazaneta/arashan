/// <reference types="vite-plus/client" />

// The modules of this directory, for convex-test. Convex skips this file: it skips each file name with
// more than one dot.
export const modules = import.meta.glob(["./**/*.*s", "!./**/*.test.*s"]);

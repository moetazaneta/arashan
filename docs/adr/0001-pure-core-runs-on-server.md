# Business logic is in a pure TypeScript core that runs on the server

All business rules are in `packages/core`, a TypeScript package without Convex imports. Convex functions are thin wrappers: they read the arguments, call the core, and return the result. We did this to keep the option to replace Convex, and to keep each client thin, so that a client cannot skip a rule.

## Considered Options

- **Core on the client.** Rejected: each new client needs its own copy of the rules, and a client can skip the rules.
- **Business logic directly in Convex functions.** Rejected: to replace Convex, we must write all the logic again.
- **Core in Rust, with WASM for the web.** Rejected: the cost is too high. The first reason for it was a GPUI client, and we removed GPUI from the goals.

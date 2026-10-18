# Arashan

A CRM for a sheep farm: it keeps the records of the rams.

## Requirements

- [Vite+](https://viteplus.dev) (`vp`). It installs Node.js from `.node-version` and pnpm from
  `package.json` on its own.

## Start

```sh
vp install
vp dev
```

`vp dev` serves the web app on http://localhost:5173 and starts the Convex backend with `convex dev`.
Without a Convex account, `convex dev` makes a local deployment. The first start downloads the Convex
backend.

## Commands

| Command        | What it does                                                    |
| -------------- | --------------------------------------------------------------- |
| `vp dev`       | Serves the web app with hot reload, and starts `convex dev`.    |
| `vp check`     | Formats, lints and type checks every package. `--fix` fixes.    |
| `vp test`      | Runs the tests of every package.                                |
| `vp build`     | Builds the web app into `apps/web/dist`.                        |
| `vp run ready` | `vp check`, the tests, the i18n check and `vp build`, as CI.    |

## Layout

| Path               | What it holds                                                     |
| ------------------ | ----------------------------------------------------------------- |
| `apps/web`         | The web app: React, TanStack Router, Tailwind CSS and shadcn/ui.  |
| `packages/client`  | The domain hooks that the views use.                              |
| `packages/backend` | The Convex backend.                                               |
| `packages/core`    | The business rules, in pure TypeScript.                           |
| `docs/`            | Docs, in Markdown. Start with `docs/architecture.md`.             |

[`AGENTS.md`](./AGENTS.md) has the rules for the repository: commands, layout, tests and commits.

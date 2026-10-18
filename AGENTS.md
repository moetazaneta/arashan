# Arashan

A CRM for a sheep farm: it keeps the records of the rams. Read [`GLOSSARY.md`](./GLOSSARY.md) and
[`docs/adr/`](./docs/adr) before starting, when they exist: they have the domain's terms and the
decisions behind the code.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

# Commands

Vite+ first: run everything through `vp`, never `pnpm`, `npm`, `npx` or `pnpm exec` directly. pnpm
is still the package manager underneath (its version is pinned in `package.json`), but `vp` drives
it, and docs, PR descriptions and CI use `vp` too.

| Instead of                              | Run                                                              |
| --------------------------------------- | ---------------------------------------------------------------- |
| `pnpm install`                          | `vp install`                                                     |
| `pnpm add`, `pnpm remove`               | `vp add --filter <package> …`, `vp remove --filter <package> …` |
| `pnpm check`, `pnpm test`, `pnpm build` | `vp check`, `vp test`, `vp build`                                |
| `pnpm dev`, `pnpm preview`              | `vp dev`, `vp preview`                                           |
| `npx shadcn@latest …`, `pnpm dlx …`     | `vp -C apps/web dlx shadcn@latest …`                             |

**No script or task shadows a built-in.** `vp dev` always runs the built-in, never the `dev`
script, so a script named after a built-in (`dev`, `build`, `preview`, `check`, `lint`, `fmt`,
`test`, `pack`, `install`, …) would make `vp dev` and `vp run dev` do different things. No
`package.json` or `vite.config.ts` in the workspace defines one. Something that has to run before
or after a built-in gets its own name, such as `dev:fresh`, and runs with `vp run <name>`.

Before you push, `vp run ready` passes: `vp check`, each package's tests, the check of the message
catalogs and `vp build`, as CI runs them. `vp check --fix` formats and applies lint fixes.

- **`vp dev` starts the web app and `convex dev`.** Without a configured deployment, `convex dev`
  makes a local one that needs no account. It writes `packages/backend/.env.local` and updates
  `packages/backend/convex/_generated`, which is committed: commit its changes.
- **Translations:** the UI text is Russian in the code (ADR 0004). After you change it, run
  `vp -C apps/web exec lingui extract --clean` and write the English text in
  `apps/web/src/locales/en/messages.po`. CI fails if the catalogs are not extracted or if one message
  has no English translation.

# Workspace

A Vite+ workspace on pnpm, in four layers. [`docs/architecture.md`](./docs/architecture.md) shows
how a query and a command go through them, and how to add a slice. Read it before you change a layer.

| Package                                 | What goes in it                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| `apps/web` (`@arashan/web`)             | The views and all the UI text: React, TanStack Router, Tailwind, shadcn/ui, Lingui. |
| `packages/client` (`@arashan/client`)   | The domain hooks for the views: TanStack Query, with the Convex transport inside.   |
| `packages/backend` (`@arashan/backend`) | Convex: thin functions, the repository adapters and the database schema.            |
| `packages/core` (`@arashan/core`)       | The business rules in pure TypeScript: no Convex, no React, no dependencies.        |

- **The layer boundaries are lint rules.** A view in `apps/web/src` imports only `@arashan/client`
  and the types of `@arashan/core`, never Convex or `@arashan/backend` (ADR 0006). The core imports
  no framework and no other layer (ADR 0001). Rules go in the core, never in a Convex function or a
  view.
- **The core gives error codes, never text.** A new code goes in `packages/core/src/errors.ts`, and
  its message in `apps/web/src/errors.ts`.
- **No command erases a record** (ADR 0005). Each table spreads `deletable`, and each read of a
  repository hides the Deleted records.

- **An app holds only what is particular to it**, such as its screens. Code that is not part of
  one app goes in a package under `packages/`, named `@arashan/<name>`, even while only one app
  uses it: code that more than one app needs, or a layer of the architecture, such as a core layer
  with the business logic. The apps never import each other, and a package is imported by its
  name, never by path. A `no-restricted-imports` rule in the root `vite.config.ts` enforces the
  second part.
- **`@/` is `apps/web/src`, in the web app only.** Packages use relative imports.
- **A dependency goes in the package that imports it:** `vp add --filter @arashan/web <name>`,
  with `-D` for a dev dependency. Versions come from the catalog in `pnpm-workspace.yaml`, pinned
  to an exact version. `vp add` writes `catalog:` for a dependency the catalog has; add a new one
  to the catalog first. The root `package.json` has only the toolchain.
- **Run commands from the root.** `vp check` and `vp test` cover every package, and `vp dev`,
  `vp build` and `vp preview` act on `apps/web` (`defaultPackage` in the root `vite.config.ts`).
  That default applies to a bare command only: with any option, name the app, as in
  `vp -C apps/web dev --port 5199`. `vp -C <dir> <command>` runs any command as if from that
  package.
- **A new package** gets a `vite.config.ts` with a `test` block named after it and a `unit` task
  (`run: { tasks: { unit: "vp test" } }`), as `apps/web` has, so `vp test` and `vp run ready`
  pick it up.
- **Tailwind scans `apps/web/src` only.** A package with class names needs an `@source` line in
  `apps/web/src/styles.css`.
- **shadcn/ui** components go to `apps/web/src/components/ui` with
  `vp -C apps/web dlx shadcn@latest add <name>`. The style is `base-nova`, on Base UI. The shadcn
  skill in `.agents/skills/shadcn` has the rules.

# Language

- **Everything in the repository is in English:** docs, code, identifiers, comments, commit
  messages, PR titles and descriptions. The owner may talk to you in Russian; what you write into
  the repository stays in English.

# Docs

- Docs live in [`docs/`](./docs) as Markdown, in English.
- Write plainly: say what something does and why, in short sentences. No marketing tone.

# Testing

`vp test` runs each package's tests: the core's with repositories in memory, the backend's with
`convex-test`, and the web app's in jsdom with Testing Library and fake hooks
(`apps/web/src/test/fake-client.ts`).

- **Test meaningful logic or observable behavior.**
- **Don't test the implementation:** don't render components to static markup to assert props or
  attributes, and don't add tests that merely assert callback wiring or mirror the implementation.

# Commits

Every commit message and every PR title is `<type>(<scope>): <summary>`, per
[Conventional Commits](https://www.conventionalcommits.org). The scope is optional, and a `!` before
the colon marks a breaking change.

- **Squash merges:** the PR's title becomes the commit on `main`, so the title follows the format
  too. The merge keeps GitHub's ` (#N)` suffix. Merge with the title as the subject, since for a
  PR with a single commit GitHub uses that commit's message instead:

  ```sh
  n=<PR>; gh pr merge $n --repo moetazaneta/arashan --squash --subject "$(gh pr view $n --repo moetazaneta/arashan --json title -q .title) (#$n)"
  ```

- **Types:** `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `revert`,
  `style`. `refactor` changes no behaviour and `perf` only speed or memory; `build` is dependencies,
  bundling and the `vite.config.ts` tasks, `ci` the workflows; `style` is formatting alone; `revert`
  repeats the reverted title; `chore` is the rest.
- **Scopes:** optional. Name the area the change is in, such as `web`. Leave the scope out when a
  change spans many areas.
- **Summary:** imperative mood, lowercase start, no trailing period, about 72 characters at most.
  Issue references go in the body (`Closes #N`), not in the summary.
- **Breaking changes:** `!` after the type or scope, plus a `BREAKING CHANGE:` footer that explains
  the migration.

# Agent skills

## Issue tracker

Issues live in this repo's GitHub Issues (`gh` CLI). See `docs/agents/issue-tracker.md`.

## Triage labels

Default labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

## Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

# Thread rules

These rules apply to every agent thread in this repo.

- Use subagents and workflows to work faster.
- When the owner gives a new rule about this workflow, write it into this file, so that the rule
  is not lost.

## Definition of done

A thread is not done until it does all these steps:

1. **Open a GitHub PR for the task.** For a UI change, put "before" and "after" screenshots in the
   PR description.
2. **Babysit the PR until all CI pipelines pass.** Use `watch_pull_request` if it is available. If
   a check fails, fix the cause, push the fix and watch again. Fix the problems that review
   comments find.
3. **For a large or hard task, get a review from `codex 6.1 sol`, effort `low`,** before the merge.
   Fix the problems that it finds.
4. **When all checks are green and all problems are fixed, merge the PR,** with the squash command
   in [Commits](#commits).

## Orchestrator thread

The main thread is an orchestrator. It routes each task from the owner to a T3 Code thread.

- Launch a new T3 thread for each new task. Use `t3_thread_launch` with a worktree for code
  changes.
- If a message adds to an existing task or blocks it, send it to that thread.
- Keep the list of active threads in the memory file `orchestrator-thread-registry.md`, and
  monitor the threads.
- Select the model and effort from the difficulty of the task:
  - Easy task: Opus 5.5, effort `medium`.
  - Medium task: Opus 5.5, effort `high`.
  - Hard task: Opus 5.5, effort `xhigh`. Also use `/advisor`, and get a review from
    `codex 6.1 sol`, effort `low`.

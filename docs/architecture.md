# Architecture

Arashan has four layers. Each layer is a package of the workspace, and it imports only the layers below
it. The decisions behind the layers are in [`adr/`](./adr).

```
apps/web          the views: React, TanStack Router, shadcn/ui, Lingui
   │  imports only the hooks
packages/client   the domain hooks: TanStack Query, with the Convex transport inside
   │  Convex API
packages/backend  Convex: thin functions, repository adapters, the database schema
   │  calls
packages/core     pure TypeScript: the model, the rules, the commands and queries, the ports
```

## The layers

### `packages/core` (`@arashan/core`)

The core contains all the business rules (ADR 0001). It imports no framework: no Convex, no React and
no TanStack. The core has no dependencies, and a lint rule rejects these imports. The core gives error
codes, never text for people (ADR 0004).

| File                 | What it contains                                                         |
| -------------------- | ------------------------------------------------------------------------ |
| `src/errors.ts`      | `errorCodes`, the list of all domain error codes, and `DomainError`.     |
| `src/context.ts`     | `QueryContext` and `CommandContext`: what the backend gives to the core. |
| `src/ids.ts`         | `Id<Kind>`, the id of a record of one kind.                              |
| `src/<module>/`      | The types of a module, its repository ports, its commands and queries.   |
| `src/index.ts`       | The public API. The other layers import only from here.                  |

A command is a function `(ctx: CommandContext, input) => Promise<result>`, and a query is a function
`(ctx: QueryContext, input) => Promise<result>`. The context holds the repositories, and a command
context also holds the clock. Later slices add the actor, the Farm, the permission check and the audit
log to the context. Thus the signatures of the commands stay the same.

A repository port is an interface for each kind of record, for example `SampleRepository`. The reader
part (`SampleReader`) is all that a query gets.

### `packages/backend` (`@arashan/backend`)

The backend is Convex. Its functions are thin: each one validates its arguments with `v`, calls one
function of the core, and returns the result.

| File                        | What it contains                                                         |
| --------------------------- | ------------------------------------------------------------------------ |
| `convex/schema.ts`          | The tables.                                                              |
| `convex/lib/functions.ts`   | `query` and `command`: the builders for all public functions.            |
| `convex/lib/repositories.ts`| The Convex adapters of the repository ports.                             |
| `convex/lib/records.ts`     | `deletable`: the fields that make a record Deleted.                      |
| `convex/<module>.ts`        | The public functions of a module.                                        |
| `convex/_generated/`        | The code that Convex generates. It is in git; CI checks that it is new.  |
| `vite-plugin.ts`            | The plugin that starts `convex dev` with `vp dev`.                       |

A public function uses the builders in `convex/lib/functions.ts`, not the builders in
`convex/_generated/server`. The builders make the context for the core, and they send a `DomainError`
to the client as a `ConvexError` with its code.

The package exports `./api` (the Convex API, for the client) and `./vite` (the plugin, for the web
app).

### `packages/client` (`@arashan/client`)

The client contains the hooks that the views use, for example `useSamples` and `useAddSample`
(ADR 0006). The hooks use TanStack Query and return the types of the core. The Convex transport stays
in this package.

- `createClient(url)` and `ClientProvider` connect the hooks to a Convex deployment.
- A mutation hook turns a domain error from the backend into a `DomainError` of the core.
- `toDomainError(error)` does the same for the error of a query hook.

### `apps/web` (`@arashan/web`)

The web app contains the views and all the text of the UI. A view gets data only from the hooks of
`@arashan/client`, and it can use the types of `@arashan/core`. A lint rule rejects imports of
`convex`, `convex/*`, `@convex-dev/*`, `@arashan/backend` and `_generated` in `apps/web/src`.

## How a query goes through the layers

The version of the app is the example.

1. The core query `getAppVersion()` gives the version of `@arashan/core`.
2. The Convex query `app.version` calls it.
3. The hook `useAppVersion()` subscribes to `app.version`.
4. The view `AppVersion` shows «Версия 0.1.0».

## How a command goes through the layers

The sample command «add a Sample» is the example.

1. The view calls `useAddSample().mutate({ name })`.
2. The hook calls the Convex mutation `samples.add`.
3. The builder `command` makes a `CommandContext` with the Convex adapters and the clock. Then it
   calls the core command `addSample(ctx, args)`.
4. The core checks the rules through the repository port. If a rule fails, the core throws
   `new DomainError("sample.nameTaken")`.
5. The builder sends the error to the client as `ConvexError({ code: "sample.nameTaken" })`.
6. The hook turns it back into a `DomainError`.
7. The view shows the message for the code, in the language of the UI.

## Deleted records

No command erases a record (ADR 0005). A Deleted record keeps its row, and its `deletedAt` field
has the time when it became Deleted.

- Each table spreads `deletable` from `convex/lib/records.ts` into its fields.
- The indexes of a table start with `deletedAt`, so a read can skip the Deleted rows.
- Each read method of a repository port hides the Deleted records. A method that must show them, for
  example for the Trash, says so in its name, for example `listDeleted`.
- The core sets the time from `ctx.now()`, and the adapter writes it.

## Domain errors

To add a domain error:

1. Add its code to `errorCodes` in `packages/core/src/errors.ts`.
2. Throw `new DomainError(code)` in the core.
3. Add its message to `errorMessages` in `apps/web/src/errors.ts`. The type check fails until the code
   has a message.
4. Extract the catalogs, and write the English translation.

## Translations

The UI text is Russian in the code, and English is a translation (ADR 0004). The web app uses
Lingui 6: macros such as `Trans` and `msg`, and `@lingui/vite-plugin`, which compiles the catalogs
when a module imports them.

- After you change the UI text, run `vp -C apps/web exec lingui extract --clean`.
- Then write the English text in `apps/web/src/locales/en/messages.po`.
- `vp run -r i18n` fails if the catalogs are not extracted (`lingui check sync --clean`), or if one
  message has no English translation (`lingui check missing`). CI runs it.
- `vp build` also fails if one message has no English translation.

## Local development

`vp dev` starts the web app and `convex dev`. The plugin in `packages/backend/vite-plugin.ts` starts
`convex dev` and gives the web app the URL of the deployment as `VITE_CONVEX_URL`. If the web app has
its own `VITE_CONVEX_URL`, the plugin does not change it.

- Without a configured deployment, `convex dev` makes a local deployment that needs no Convex
  account. The first start downloads the Convex backend.
- `convex dev` writes the deployment to `packages/backend/.env.local`. The data of a local deployment
  is in `packages/backend/.convex/`. Git ignores both.
- `convex dev` pushes the functions and the schema on each change, and it updates
  `convex/_generated`. Commit the changes in `convex/_generated`.
- To use a cloud deployment, run `vp -C packages/backend exec convex dev --configure` one time.

## Tests

| Package            | What the tests do                                                            |
| ------------------ | ---------------------------------------------------------------------------- |
| `packages/core`    | Unit tests of the rules, with repositories in memory.                        |
| `packages/backend` | `convex-test` tests of the functions, the adapters and the error codes.      |
| `packages/client`  | Unit tests of the error conversion.                                          |
| `apps/web`         | The views in jsdom, with the fake hooks in `apps/web/src/test/fake-client.ts`. |

## The sample module

The `sample` module shows how a command goes through the layers. It is not part of the domain.
Delete it when the first real slice adds its own commands:

- `packages/core/src/sample/` and its code in `src/errors.ts`, `src/context.ts` and `src/index.ts`
- `packages/backend/convex/samples.ts`, its tests, its table in `convex/schema.ts`, and its adapter
- `packages/client/src/samples.ts`
- `apps/web/src/components/samples-card.tsx`, and its messages in `apps/web/src/errors.ts`

## How to add a slice

1. **Core:** the types, the repository port, the commands and queries, the error codes, and the
   unit tests.
2. **Backend:** the table (with `deletable`), the adapter, the repository in the contexts of
   `convex/lib/functions.ts`, the thin functions, and the `convex-test` tests.
3. **Client:** the hooks.
4. **Web:** the views, the error messages, and the translations.

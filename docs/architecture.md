# Architecture

Arashan has four layers. Each layer is a package of the workspace, and it imports only the layers below
it. The decisions behind the layers are in [`adr/`](./adr).

```
apps/web          the views: React, TanStack Router, shadcn/ui, Lingui
   │  imports only the hooks
packages/client   the domain hooks: TanStack Query, with the Convex and Clerk transport inside
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

| File                     | What it contains                                                          |
| ------------------------ | ------------------------------------------------------------------------- |
| `src/errors.ts`          | `errorCodes`, the list of all domain error codes, and `DomainError`.      |
| `src/context.ts`         | The contexts that the backend gives to the core (see below).              |
| `src/ids.ts`             | `Id<Kind>`, the id of a record of one kind, and the ids of each kind.     |
| `src/access/`            | `requireUser`, `requireOperator`, `enterFarm`, and `can` with the matrix. |
| `src/audit/`             | The audit log: `AuditEntry`, the port `AuditLog`, `CommandName`.          |
| `src/<module>/`          | The types of a module, its repository ports, its commands and queries.    |
| `src/testing/`           | The repositories in memory, for the tests of the core. Not exported.      |
| `src/index.ts`           | The public API. The other layers import only from here.                   |

A command is a function `(ctx, input) => Promise<result>`, and a query is a function
`(ctx, input) => Promise<result>`. The context tells the core who makes the request, and it holds the
repositories and the clock:

| Context              | For                                   | Contains                                                  |
| -------------------- | ------------------------------------- | --------------------------------------------------------- |
| `QueryContext`       | a query with no Farm                  | `identity`, the readers of all repositories, `now`, `tokens` |
| `CommandContext`     | a command with no Farm                | `identity`, all repositories with the audit log, `now`, `tokens` |
| `FarmQueryContext`   | a query of one Farm                   | `member`, `farm`, the readers bound to the Farm, `now`    |
| `FarmCommandContext` | a command of one Farm                 | `member`, `farm`, the repositories bound to the Farm, `now`, `tokens` |
| `SystemContext`      | an internal function of the CLI       | all repositories, `now`, no identity                      |

A repository port is an interface for each kind of record, for example `FarmRepository`. The reader
part (`FarmReader`) is all that a query gets.

### `packages/backend` (`@arashan/backend`)

The backend is Convex. Its functions are thin: each one validates its arguments with `v`, calls one
function of the core, and returns the result.

| File                         | What it contains                                                         |
| ---------------------------- | ------------------------------------------------------------------------ |
| `convex/schema.ts`           | The tables.                                                              |
| `convex/auth.config.ts`      | Convex accepts the session tokens of Clerk (ADR 0003).                   |
| `convex/lib/functions.ts`    | The builders for all public and internal functions.                      |
| `convex/lib/repositories.ts` | The Convex adapters of the repository ports.                             |
| `convex/lib/tokens.ts`       | The random tokens of invite links, and their SHA-256 hashes.             |
| `convex/lib/clerk.ts`        | The calls to the Clerk Backend API, for an action.                       |
| `convex/lib/records.ts`      | `deletable`: the fields that make a record Deleted.                      |
| `convex/<module>.ts`         | The public functions of a module.                                        |
| `convex/_generated/`         | The code that Convex generates. It is in git; CI checks that it is new.  |
| `vite-plugin.ts`             | The plugin that starts `convex dev` with `vp dev`.                       |

A function uses the builders in `convex/lib/functions.ts`, not the builders in
`convex/_generated/server`:

| Builder         | Makes                       | The core gets                                                     |
| --------------- | --------------------------- | ----------------------------------------------------------------- |
| `query`         | a public query              | `QueryContext`                                                    |
| `command`       | a public mutation           | `CommandContext`                                                  |
| `farmQuery`     | a public query of a Farm    | `FarmQueryContext`, after `enterFarm`                             |
| `farmCommand`   | a public mutation of a Farm | `FarmCommandContext`, after `enterFarm`                           |
| `internalFarmCommand` | an internal mutation of a Farm | The same. Only a `farmAction` calls it, with its identity. |
| `farmAction`    | a public action of a Farm   | Nothing: it calls an internal function of the Farm first (see below). |
| `systemCommand` | an internal mutation        | `SystemContext`. Only the CLI calls it (`convex run`).            |

Each builder sends a `DomainError` to the client as a `ConvexError` with its code. The package exports
`./api` (the Convex API, for the client) and `./vite` (the plugin, for the web app).

### `packages/client` (`@arashan/client`)

The client contains the hooks that the views use, for example `useFarm` and `useCreateFarm`
(ADR 0006). The hooks use TanStack Query and return the types of the core. The Convex and Clerk
transport stays in this package.

- `createClient({ convexUrl, clerkPublishableKey })` and `ClientProvider` connect the hooks to a
  Convex deployment and to Clerk. `ClientProvider` gets the language of the Clerk forms.
- `useSession()` gives the state of the session: `loading`, `signedOut`, `registering`, `failed` or
  `ready` with the User and the User's Farms. After a log-in, `ClientProvider` calls `users.register`
  one time, which makes the User at the first log-in.
- `SignInForm` is the Clerk form to log in or to make an account. `useSignOut()` logs out and clears
  the data of the session.
- A mutation hook turns a domain error from the backend into a `DomainError` of the core. A hook
  of an action, such as `useSetMemberPassword`, is a mutation hook too.
- `toDomainError(error)` does the same for the error of a query hook.
- The client exports the values of the core that the views need, such as `defaultLambAgeMonths`.

### `apps/web` (`@arashan/web`)

The web app contains the views and all the text of the UI. A view gets data only from the hooks of
`@arashan/client`, and it can use the types of `@arashan/core`. A lint rule rejects imports of
`convex`, `convex/*`, `@convex-dev/*`, `@clerk/*`, `@arashan/backend` and `_generated` in
`apps/web/src`.

The Clerk form has the text of Clerk, in Russian or English (`@clerk/localizations`), not the text
of the Lingui catalogs. This is the only text of the UI that is not in the catalogs (ADR 0004).

## Who makes a request

Clerk identifies the person, and Convex validates the Clerk session token (ADR 0003). The builders
turn the token into an `Identity`: the key (`tokenIdentifier`), the Clerk user id, and the username
from the claim `preferred_username` (see [environment.md](./environment.md)).

- **User.** At the first log-in, `users.register` makes the User. At a later log-in, it copies the
  new username. `requireUser(ctx)` gives the User, or the error `auth.signedOut` or
  `user.notRegistered`.
- **Operator.** A flag of the User, not a Role in a Farm. `requireOperator(ctx)` gives the Operator,
  or `auth.operatorOnly`. Only the CLI sets the flag, for the Clerk user id of the person (Clerk
  dashboard → Users → the user → User ID):

  ```sh
  vp -C packages/backend exec convex run users:setOperator '{"clerkUserId": "user_…"}'
  vp -C packages/backend exec convex run users:setOperator '{"clerkUserId": "user_…", "isOperator": false}'
  ```

  The command takes the Clerk user id and not the username, because the app copies a username only
  at a log-in: a stored username can belong to another person now. For a cloud deployment, add
  `--prod` or set the deployment as for any `convex` command.

## Farms, Members and permissions

Each record belongs to one Farm (ADR 0002), and a User acts in a Farm as a Member with one Role.

- **Each request of a Farm contains the Farm.** `farmQuery` and `farmCommand` add the argument
  `farmId` and call `enterFarm(ctx, farmId)` of the core. It gives the Member (`membershipId`,
  `userId`, `farmId`, `role`) and the Farm, or the error `farm.notMember`. The error is the same for
  a Farm that does not exist, and the Operator is no exception.
- **The repositories of a Farm are bound to it.** After `enterFarm`, the builder makes the
  readers (`FarmReaders` in `context.ts`) or the repositories (`FarmRepositories`) of the Farm with
  the id of the Farm. Their methods never take a `farmId`, so a request of one Farm cannot reach a
  record of another.
- **`can(actor, action, target)`** checks the permission matrix of `access/permissions.ts`: the Roles
  that can do each action. It is false when the target belongs to another Farm. `authorize` throws
  `access.denied`. Each command of a Farm calls `authorize` first.

| Action                | Admin | Editor |
| --------------------- | ----- | ------ |
| `farm.view`           | yes   | yes    |
| `farm.updateSettings` | yes   | no     |
| `member.list`         | yes   | no     |
| `member.invite`       | yes   | no     |
| `member.changeRole`   | yes   | no     |
| `member.remove`       | yes   | no     |
| `member.setPassword`  | yes   | no     |

A new action adds a row to the matrix and to the table of its test (`permissions.test.ts`).

**Invites.** A one-time link to a Farm, valid for 7 days. The link carries a random token, and the
database keeps only its SHA-256 hash. The Operator makes a Farm and gets the link of its first Admin
(`farms.create`). If the link expires or is lost, the Operator makes a new one (`farms.inviteAdmin`),
and the older links stop. A logged-in User who opens the link sees the Farm and joins it
(`invites.accept`). An Admin makes the links of new Editors (`members.invite`); these links do not
stop the older ones, so that an Admin can invite many people at one time.

**Members.** An Admin sees the Members (`members.list`), changes the Role of a Member
(`members.changeRole`) and removes a Member (`members.remove`).

- A removed Member's Membership becomes Archived (`archivedAt`). `enterFarm` refuses it with
  `farm.notMember`, and the Farm goes out of the User's list. The Membership stays, so the history
  and the old records still show the Member. A User has at most one Membership in a Farm: when a
  removed Member accepts a new link, the old Membership comes back with the Role of the link.
- A Farm always has at least one Admin. The core refuses to remove the last Admin, or to make the
  last Admin an Editor, with `member.lastAdmin`.
- **A new password for a Member** (ADR 0003): an Admin sets it through the Clerk Backend API, for
  example for a Member with no email who forgot the password. Clerk ends the Member's sessions.
  The account of a User is the same in all Farms, so the core refuses (`member.passwordNotAllowed`)
  the Admin's own account, the Operator's, and the account of a User who is or was a Member of
  another Farm. The action `members.setPassword` runs in three steps:
  1. The internal mutation `members.requestPassword` checks the rules, and writes a pending
     `passwordResets` row and the audit entry `member.requestPassword`, in one transaction.
  2. The action calls Clerk, and waits at most 20 seconds.
  3. The internal mutation `members.finishPassword` writes the outcome and its audit entry: `done`
     (`member.setPassword`, Clerk answered 2xx), `failed` (`member.setPasswordFailed`, Clerk answered
     4xx and changed nothing) or `unknown` (`member.setPasswordUnknown`: a timeout, a network error
     or an answer 5xx, so Clerk can still set the password). It checks no permission again: the
     history must show the outcome whatever happened in the meantime.

  While a reset of a User is unfinished (`pending` or `unknown`, for at most
  `passwordResetLifetimeMs`, 24 hours), `invites.accept` and `users:setOperator` refuse that User
  with `user.passwordResetPending`. Thus the rule above still holds when Clerk sets the password. A
  normal reset finishes in seconds.

## The audit log

Each command that writes a record appends at least one audit entry: the actor (the User, or null
for the CLI), the time, the command, the Farm, and the target (the kind and the id of the record).

- In a command of no Farm, call `recordAudit(ctx, entry)`. In a command of a Farm, call
  `recordFarmAudit(ctx, { command, target })`: it takes the actor and the Farm from the Member.
- A command that changes many records (for example a Sale of many Sheep) appends one entry for each
  target.
- **The builders check the rule.** They count the writes of a command. A command that writes a record
  but appends no audit entry fails with an error, and the transaction writes nothing.
- A command that changes nothing writes no entry, for example `users.register` at a log-in with the
  same username.
- The table `auditLog` is append-only, so it has no `deletable`. Its index
  `by_farmId_targetKind_targetId` gives the history of one record of one Farm (the tab «История»).
- A new command adds its name to `CommandName` in `audit/audit.ts`.

## How a query goes through the layers

The settings of a Farm are the example.

1. The view calls `useFarm(farmId)`.
2. The hook subscribes to the Convex query `farms.get` with `{ farmId }`.
3. The builder `farmQuery` reads the identity, and calls `enterFarm` of the core. A User who is not a
   Member gets `farm.notMember`.
4. The core query `getFarm(ctx)` calls `authorize(ctx.member, "farm.view", …)` and returns the Farm.
5. The view shows the Farm, or the message for the code of the error.

## How a command goes through the layers

The change of the settings of a Farm is the example.

1. The view calls `useUpdateFarmSettings(farmId).mutate(settings)`.
2. The hook calls the Convex mutation `farms.updateSettings` with `{ farmId, ...settings }`.
3. The builder `farmCommand` calls `enterFarm`, binds the repositories to the Farm, and calls the
   core command `updateFarmSettings(ctx, settings)`.
4. The core checks the permission (`access.denied` for an Editor) and the settings (for example
   `farm.timeZoneInvalid`), writes them, and appends the audit entry `farm.updateSettings`.
5. If a rule fails, the builder sends `ConvexError({ code })`, and the transaction writes nothing.
6. The hook turns it back into a `DomainError`, and the view shows the message for the code, in the
   language of the UI.

## Deleted records

No command erases a record (ADR 0005). A Deleted record keeps its row, and its `deletedAt` field
has the time when it became Deleted.

- Each table spreads `deletable` from `convex/lib/records.ts` into its fields. The exception is
  `auditLog`: nothing changes an entry, so nothing makes it Deleted.
- The indexes let a read skip the Deleted rows. A table of the records of one Farm starts each index
  with `farmId`, then `deletedAt`, so a read stays in one Farm and can also list the Deleted records
  of the Farm (the Trash). A table of no Farm, such as `users`, starts with `deletedAt`.
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
- A local deployment needs `CLERK_JWT_ISSUER_DOMAIN`. Before `convex dev` starts, the plugin sets it
  from `VITE_CLERK_PUBLISHABLE_KEY` of `apps/web/.env.local`, if the deployment does not have it. See
  [environment.md](./environment.md).
- `convex dev` writes the deployment to `packages/backend/.env.local`. The data of a local deployment
  is in `packages/backend/.convex/`. Git ignores both.
- `convex dev` pushes the functions and the schema on each change, and it updates
  `convex/_generated`. Commit the changes in `convex/_generated`.
- To use a cloud deployment, run `vp -C packages/backend exec convex dev --configure` one time.

## Tests

| Package            | What the tests do                                                              |
| ------------------ | ------------------------------------------------------------------------------ |
| `packages/core`    | Unit tests of the rules, with repositories in memory (`src/testing/`).         |
| `packages/backend` | `convex-test` tests of the functions, the adapters, the error codes, the audit rows and the audit check. A test logs in with `logIn` of `convex/test.setup.ts`. |
| `packages/client`  | Unit tests of the error conversion.                                            |
| `apps/web`         | The views in jsdom, with the fake hooks in `apps/web/src/test/fake-client.ts`. |

## How to add a slice

1. **Core:** the types, the repository port, the commands and queries, the error codes, and the
   unit tests. A command of a Farm takes `FarmCommandContext` and calls `authorize` with a new row
   of the permission matrix. It appends an audit entry with a new `CommandName`.
2. **Backend:** the table (with `deletable`, and indexes that start with `farmId` for the records of
   a Farm), the adapter, the repository in `FarmRepositories` (bound to the Farm in
   `farmRepositories`), the thin functions with `farmQuery` or `farmCommand`, and the `convex-test`
   tests.
3. **Client:** the hooks. A hook of a Farm takes the `farmId`.
4. **Web:** the views, the error messages, and the translations.

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
| `src/dates.ts`           | `CalendarDate` ("YYYY-MM-DD"), today in a time zone, months after a date. |
| `src/access/`            | `requireUser`, `requireOperator`, `enterFarm`, and `can` with the matrix. |
| `src/audit/`             | The audit log: `AuditEntry`, the port `AuditLog`, `CommandName`.          |
| `src/<module>/`          | The types of a module, its repository ports, its commands and queries.    |
| `src/pedigree/`          | The Breed composition and the rules of the parents (see "Pedigree").      |
| `src/files/`             | The port of the file storage, such as the scans of Passports.             |
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

| Action                  | Admin | Editor |
| ----------------------- | ----- | ------ |
| `farm.view`             | yes   | yes    |
| `farm.updateSettings`   | yes   | no     |
| `member.list`           | yes   | no     |
| `member.invite`         | yes   | no     |
| `member.changeRole`     | yes   | no     |
| `member.remove`         | yes   | no     |
| `member.setPassword`    | yes   | no     |
| `sheep.view`            | yes   | yes    |
| `sheep.register`        | yes   | yes    |
| `sheep.update`          | yes   | yes    |
| `sheep.changeOwner`     | yes   | yes    |
| `sheep.delete`          | yes   | yes    |
| `breed.view`            | yes   | yes    |
| `breed.add`             | yes   | yes    |
| `breed.update`          | yes   | yes    |
| `breed.delete`          | yes   | yes    |
| `sheep.move`            | yes   | yes    |
| `sheep.changeStatus`    | yes   | yes    |
| `flock.view`            | yes   | yes    |
| `flock.create`          | yes   | yes    |
| `flock.update`          | yes   | yes    |
| `flock.archive`         | yes   | yes    |
| `flock.assignShepherd`  | yes   | yes    |
| `location.create`       | yes   | yes    |
| `location.update`       | yes   | yes    |
| `location.archive`      | yes   | yes    |
| `shepherd.create`       | yes   | yes    |
| `shepherd.update`       | yes   | yes    |
| `shepherd.archive`      | yes   | yes    |
| `money.view`            | yes   | yes    |
| `money.create`          | yes   | yes    |
| `money.update`          | yes   | yes    |
| `money.delete`          | yes   | yes    |
| `moneyCategory.create`  | yes   | yes    |
| `moneyCategory.update`  | yes   | yes    |
| `moneyCategory.archive` | yes   | yes    |
| `moneyCategory.delete`  | yes   | yes    |
| `deal.view`             | yes   | yes    |
| `deal.create`           | yes   | yes    |
| `deal.update`           | yes   | yes    |
| `deal.cancel`           | yes   | yes    |
| `resource.view`         | yes   | yes    |
| `resource.create`       | yes   | yes    |
| `resource.update`       | yes   | yes    |
| `resource.archive`      | yes   | yes    |
| `resource.record`       | yes   | yes    |
| `lambing.record`        | yes   | yes    |
| `trash.view`            | yes   | yes    |
| `trash.restore`         | yes   | yes    |

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
- The Owner of an Active Sheep is a Member. The core refuses to remove a Member who owns an Active
  Sheep, with `member.ownsActiveSheep`, or a Lost one, which can come back, with
  `member.ownsLostSheep`: first give the Sheep to another Member.
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

## Sheep

The Sheep registry (`core/src/sheep/`) keeps the Sheep of a Farm: the table «Бараны», the card,
and its tab «История».

- **The Owner is a Member,** stored as the id of the Membership. The id stays the same when a
  removed Member comes back, and an Archived Membership keeps its name in old records. The Owner of
  a new or an Active Sheep is a Member who is not removed (`requireOwner`). A command that makes a
  Sheep Active again (a restore, a found Lost Sheep, a cancelled Sale) checks it too.
- **A change of the Owner is an event with a date** (`changeSheepOwner`), in the table
  `sheepOwnerChanges`. The card shows the Owners, the newest first. The first Owner has no date: the
  Owner at the registration.
- **The Tag is optional, and unique among the Sheep of the Farm.** `tagKey` compares two Tags: the
  case, the spaces at the ends and the Cyrillic letters that look like Latin ones do not count. A
  Sold or a Dead Sheep keeps its Tag; a Deleted Sheep and an External Sheep do not count. The table
  keeps the key (`tagKey`) in an index, so the check reads one index range.
- **The Initial entry** registers a Sheep that was on the Farm before the app: its Origin is Born
  or Bought, it needs no birth date, and it has no Purchase. Outside the Initial entry, a Sheep is
  Born and has a birth date; a Bought Sheep comes from a Purchase.
- **A Lamb** is a Sheep younger than the lamb age of the Farm (`isLamb`). The answer changes with
  the day, but the result of a Convex query changes only with its data. So no query gives it: the
  client adds it with `withLamb` when it shows the Sheep, with today's date in the time zone of the
  Farm, and again when the day changes on an open page. A report that counts the Lambs gets the date
  as an argument.
- **Dates without a time,** such as a birth date, are `CalendarDate` strings "YYYY-MM-DD"
  (`core/src/dates.ts`). Two of them compare as strings. Today is the date in the time zone of the
  Farm (`dateAt`).

## Pedigree and Breeds

The pedigree slice (`core/src/pedigree/`, `core/src/breeds/`) adds the parents, the Breed composition,
the Passport and the Grade of a Sheep, and the Breed list of the Farm («Породы»). The card shows them in
the block «Дополнительно», and the pedigree tree in the tab «Родословная».

- **Arashan is built in.** Each Farm has the Breed Arashan from the start, with the id
  `arashanBreedId` ("arashan"). It is not a row of the table `breeds`, so a Farm needs no migration,
  and a Member cannot rename, archive or delete it (`breed.arashanLocked`). The UI shows its name in
  the language of the UI. The other Breeds are rows: their names are unique in the Farm by
  `breedNameKey` (as `tagKey` for Tags), an Archived Breed keeps its name, and a form does not offer
  it. A Breed that a Sheep uses can only become Archived (`breed.inUse`).
- **The parents.** `motherId` and `fatherId` are optional. The Mother is an Ewe and the Father is a
  Ram, of the Farm or External, and of any Status. If both dates are known, a parent was born before
  the child. A Sheep is never its own ancestor: `requireParents` walks the ancestors of each new
  parent. A Sheep that is a parent keeps its sex and stays born before its children. A parent cannot
  become Deleted (`requireNotParent`, `sheep.isParent`): a command that makes a Sheep Deleted, such as
  a cancelled Purchase, calls it too. The index `by_farmId_deletedAt_motherId` (and the one of the
  Father) gives the children.
- **The Breed composition is computed, never stored** (ADR 0007). A Sheep stores only its parents and
  `manualBreeds`. These are the parts that a Member gave by hand, out of the Unknown part of the
  unknown parents: up to 100 percent with no known parent, 50 with one, none with two (`manualLimit`).
  `compositionOf(mother, father, manualBreeds)` is the average of the parents, and
  `compositions(lookup)` computes it for many Sheep, each ancestor one time. Thus a change of a Sheep
  changes the composition of all its descendants at once, and no command writes the descendants.
- **The parts are integers in millionths** (`wholeShare` is 100 percent), so the sum is exact and
  "100 percent Arashan" is an equality. When a half is not an integer (after about six generations),
  the largest remainder method keeps the sum. It gives the extra millionths to the smallest parts
  first, so a child is 100 percent Arashan only if both parents are.
- **The Passport** (number, issue date, scan) needs 100 percent Arashan (`passport.notArashan`). A
  Sheep with a Passport is 100 percent Arashan, so all its ancestors are too. Thus, when the
  composition of a Sheep changes and it is not 100 percent Arashan, no descendant can keep a
  Passport. The command then looks for a descendant with a Passport, and fails if it finds one
  (`passport.descendantNotArashan`).
- **The Grade** is the last value only: the Grade and its date. The audit log keeps the changes.
- **An External Sheep** (`registerExternalSheep`, the mode «Внешний» of the panel «Добавить барана»)
  has no Owner, and its Tag is not unique (the adapter writes no `tagKey`). It keeps the Status Active,
  so a list of the Sheep on the Farm, a Sale or a report checks `isOnFarm`, not only the Status. It has
  a card, but the table «Бараны» does not show it.

### The file storage

The core keeps only the id of a file (`FileId`). The port `FileStorage` (`core/src/files/files.ts`)
gives an upload URL, the size and the type of a file, and its URL. The Convex adapter uses the Convex
file storage (`ctx.storage`, the system table `_storage`).

1. The form calls `sheep.passportUploadUrl` (`requestPassportScanUpload`), which writes no record.
2. The client sends the file to that URL, and gets its id (`useUploadPassportScan`).
3. The form sends the id as `passport.scanId` with `sheep.update`. The core checks that the file
   exists, has at most 10 MB, and is a PDF, a JPEG, a PNG or a WebP if the storage knows its type.

A file is never erased (ADR 0005): a new scan leaves the old file in the storage. The ids of the
storage are not bound to a Farm, but they are random and only a Member of the Farm sees them.

## Flocks, Locations and Shepherds

The module `core/src/flocks/` keeps the Flocks of a Farm, their Locations and their Shepherds, and
the moves of Sheep between Flocks: the page «Стада» (tabs «Стада», «Чабаны», «Места»), the card
of a Flock, the column «Стадо» and the bulk action «Перевести в стадо» of the table «Бараны».

- **A Flock** has a name, an optional Location and zero or more Shepherds. The names of Flocks and
  of Locations are unique in the Farm (`nameKey`: the case, the spaces and «ё» do not count); the
  Archived ones count too. Two Shepherds can have the same name. A Location has no history: a Flock
  has only its Location of now.
- **A Shepherd assignment** (`flockAssignments`) says that a Shepherd herds a Flock from a date to a
  date, both days included. An open assignment (no `to`) goes on now. A Shepherd can herd more than
  one Flock at one time, but two assignments of one Shepherd to one Flock do not overlap. An
  assignment is part of the Flock and of the Shepherd: each of its commands appends an audit entry
  for both.
- **A move** (`sheepFlockMoves`) puts a Sheep into a Flock or out of all Flocks on a date. The moves
  are the history of the Flock membership, and the Sheep keeps its Flock of now (`Sheep.flockId`),
  as it keeps its Owner. Only an Active Sheep is in a Flock. `moveSheep` moves one Sheep or many in
  one command, and appends one audit entry for each Sheep that moved; a Sheep that is in the Flock
  already stays as it is. If one Sheep cannot move, no Sheep moves. A move made by mistake is undone
  (`undoFlockMove`): it becomes Deleted, and the Sheep goes back.
- **No date of a move or of an assignment is in the future.** Thus the state of now never depends on
  the day, and a Convex query never gives a stale answer: the Flock of a Sheep is `flockId`, and the
  Shepherds of a Flock are its open assignments. A move is not before the birth date and not before
  the last move of the Sheep.
- **Who was responsible for a Sheep on a date** (`getSheepResponsible`, `flocks.responsible`): the
  Flocks that had the Sheep on that date, each with its Shepherds on that date. On the day of a move
  the Sheep was in both Flocks (`flocksOn`): in the old one at the start of the day and in the new
  one at the end, so a Sheep that leaves all Flocks on the day it dies was still in its Flock that
  day. The Flock at the end of a day is `flockAt`, for example the Flock of a Mother on the date of a
  Lambing. The card of a Sheep shows its stays in Flocks with their Shepherds (`SheepCard.flocks`),
  and the answer for a date, in the tab «История».
- **Archive.** An Archived Flock, Location or Shepherd stays in the history and in the lists, with
  the flag `archived`, but a form does not offer it. A Flock with Sheep cannot become Archived
  (`flock.notEmpty`), nor a Location where a Flock stays (`location.inUse`). When a Flock or a
  Shepherd becomes Archived, its open assignments end on the date that the Member gives: the last
  day of work. Out of the archive, the ended assignments stay ended.
- **For a command of another slice,** `recordFlockMove(ctx, sheep, flockId, date)` checks the rules of
  a move and writes it, without a permission check and without an audit entry: the command checks the
  permission and appends its own entry. A Sheep that stops being Active leaves its Flock with it
  first, and a Lamb goes into the Flock of its Mother.

## Lambings

The module `core/src/lambings/` records a Lambing: one form registers all live Lambs of an Ewe at
once (`recordLambing`, `lambings.record`). The panel «Окот» opens from the table «Бараны» and from
the card of an Ewe, and the card of an Ewe lists her Lambings (`listLambings`).

- **A Lambing is a record** (`lambings`): the Mother, the Father or none, the date, the ids of the
  live Lambs and the number of stillborn Lambs. A stillborn Lamb is only that number, not a Sheep. A
  Lambing has 1 to `maxLambs` (8) live Lambs and 0 to `maxStillborn` (8) stillborn ones.
- **Each live Lamb is a new Sheep:** Origin Born, Active, not an Initial entry, born on the date of
  the Lambing, with the Mother and the Father as its parents. Its Breed composition comes from them
  (ADR 0007): the Lamb stores no parts by hand, so an unknown Father gives his half as Unknown. Its
  Tag is optional, unique in the Farm (`requireFreeTag`, `sheep.tagTaken`) and in the Lambing
  (`lambing.tagRepeated`, by `tagKey`).
- **The Mother** is an Ewe of the Farm, not an External Sheep (`lambing.motherExternal`), and is
  Active now (`lambing.motherNotActive`): the Lambs join the Farm now, with an Owner who is a Member
  now and a Flock in use now. Thus a Member records a Lambing before the Sale or the death of the
  Mother; the death can have the same date. **The Father** is optional: a Ram of the Farm or an
  External one, of any Status, as for the pedigree. Each parent was born before the date
  (`pedigree.parentBornAfterChild`).
- **The date** is a real date, not in the future, and not before the Purchase of a bought Mother
  (`lambing.dateInvalid`).
- **The Owner** of each Lamb is the Owner of the Mother at the end of the date (`ownerAt`, from the
  changes of her Owner), unless the form gives another Member for that Lamb. Each Owner is a Member
  now (`requireOwner`). The query `lambings.defaults` (`getLambingDefaults`) gives this Owner to the
  form, or null if that Member left the Farm.
- **The Flock** of each Lamb is the Flock that had the Mother at the end of the date (`flockAt`),
  and `recordFlockMove` writes the move of the Lamb on that date. A Mother in no Flock on that date
  gives Lambs in no Flock, for example a Mother that was Lost then (a Lost Sheep leaves its Flock).
  Later moves of the Mother do not move the Lambs: a Member moves them with «Перевести в стадо». An
  Archived Flock has no Sheep, so if the Flock of the Mother on the date is Archived now, the
  command fails (`lambing.flockArchived`); the form shows it before the Member saves.
  `lambings.defaults` gives this Flock too.
- **The Mother keeps her later events after the Lambing.** A move, a change of the Owner or a change
  of the Status of the Mother is not dated before her last Lambing (`lastLambingDate`): her Lambs
  got her Owner and her Flock of that date, and she was Active then. The same date is good. For the
  same reason, the undo of her move dated on or before her last Lambing, and the undo of «Баран
  нашёлся» dated on or before it, fail with `sheep.undoBeforeLambing`.
- **The list of the Lambings** skips a Lamb that is Deleted, or that got another Mother or birth date
  later on its card.
- **No partial Lambing.** The command checks all rules (the counts, the parents, the Flock, each Tag
  and each Owner) before the first write, so a wrong last Lamb writes nothing, also in the core
  tests with the repositories in memory. A Convex mutation is a transaction too.
- **The audit log** gets one entry `lambing.record` for each Lamb (kind `Sheep`), so the tab
  «История» of a Lamb shows its Lambing, and one for the Lambing (kind `Lambing`). The permission is
  `lambing.record`; the queries need `sheep.view`.
- **Not in this slice:** a change or a cancel of a Lambing. A Lamb registered by mistake becomes
  Deleted as any Sheep (`deleteSheep`), and the list of the Lambings then skips it.

## The Status of a Sheep

The module `core/src/sheep/lifecycle.ts` keeps the life of a Sheep on the Farm: it stops being Active
when it is Slaughtered, Dead or Lost, and a Lost Sheep can come back. Sold comes with the Sale.

- **A change of the Status is an event with a date** (`StatusChange`, in the table
  `sheepStatusChanges`), with an optional reason. The card shows the changes, the newest first, in
  the block «Смены статуса».
- **`changeSheepStatus`** gives one Sheep or many Active Sheep the Status Slaughtered, Dead or Lost
  on a date: the bulk action «Сменить статус» of the table «Бараны», or the card. It is one
  command: if one Sheep cannot change, no Sheep changes, and each Sheep gets one audit entry
  (`sheep.markSlaughtered`, `sheep.markDead`, `sheep.markLost`).
- **The Flock membership closes on that date.** A Sheep in a Flock leaves it with a move out of all
  Flocks (`recordFlockMove`), and the change keeps the id of that move (`flockMoveId`). On that day
  the Sheep was still in its Flock (`flocksOn`).
- **The date** is a real date, not in the future, and not before the birth date, the last move, the
  last change of the Owner or the last change of the Status (`sheep.statusDateInvalid`). Thus the
  history of a Sheep stays in the order of the dates. A later birth date is not after a change of
  the Status either (`sheep.birthDateAfterStatusChange`).
- **Slaughtered and Dead are final** (`sheep.notActive`). A Lost Sheep comes back with
  `markSheepFound` (`sheep.markFound`): it is Active again from a date that is not before the loss,
  the last move or the last change of the Owner, in no Flock. Its Owner must be a Member now
  (`requireOwner`).
- **A Lost Sheep keeps a Member as its Owner,** because it can come back: it can get a new Owner
  (`changeSheepOwner`), and its Owner cannot be removed (`member.ownsLostSheep`). A move or a
  change of the Owner is not dated before the last change of the Status: the Sheep was in no Flock
  while it was Lost.
- **A wrong change is undone** with `undoSheepStatusChange` (`sheep.undoStatusChange`): the last
  change becomes Deleted (ADR 0005), and the Sheep gets its Status from before. A Sheep that is
  Active again goes back to the Flock that it left, if that Flock is not Archived now; else it stays
  in no Flock. A found Sheep that moved after it was found becomes Lost again only after the undo of
  those moves (`sheep.movedAfterFound`). The undo takes only the changes of this module: a Sale has its own cancel.
- **The table «Бараны» filters by Status**, with the number of Sheep of each. The default is Active;
  the URL keeps another choice (`?status=dead`, `?status=all`).
- **For a command of another slice,** `recordStatusChange(ctx, sheep, { status, date, reason })`
  checks the rules and writes the change and the move out of the Flock, without a permission check
  and without an audit entry, as `recordFlockMove` does. A Sale uses it to make its Sheep Sold.

## Expenses and Incomes

The module `core/src/money/` keeps the Expenses and the Incomes of a Farm and their categories: the
pages «Расходы» and «Доходы», each with the tabs «Записи» and «Категории». An Expense and an Income
have the same fields, so one module keeps both: a money record is an Expense or an Income, and its
`kind` tells which. The table `moneyRecords` keeps both kinds, and `moneyCategories` both lists.

- **An amount is an integer of hundredths** of the unit of the currency of the Farm (for the som, in
  tyiyn): 150050 is 1 500,50. A sum is then exact. It is at most `maxAmount` (1 000 000 000,00), so
  the sum of many records stays a safe integer. The amounts have no currency of their own, so the
  currency of a Farm stays when the Farm has a record, also a Deleted one (`farm.currencyLocked`).
- **A record** has a date (not in the future), an amount, a category of its kind, a scope and
  optional notes. The scope is the Farm as a whole, one Flock or one Sheep: the columns `flockId`
  and `sheepId`, or neither. An Expense of «Оплата чабану» has a Shepherd, and no other record has
  one. A category, a Flock or a Shepherd that a record has already can become Archived; a form
  offers only the ones that are not. A record made by mistake becomes Deleted.
- **A category** has a `key` if the app made it, and a `name` if a Member made it or renamed it. A
  rule finds a category by its key, never by its name: «Оплата чабану» is the key `shepherdPay`,
  also after a rename. The core keeps no names (ADR 0004), so the web app has the name of each key
  (`components/money/category-names.ts`), and a new key fails its type check until it has one. The
  names of a list are unique (`nameKey`), also among the Archived categories. The core sees only the
  names that Members gave, so the view refuses the shown name of a category of the app
  (`isNameOfKey`): else a Member could make a second «Оплата чабану» without its rule. A category in use (by
  a record, also a Deleted one, which a Member can restore) can only become Archived; one that no
  record uses can become Deleted.
- **The default lists.** Each Farm has these categories:

  | Kind    | Keys                                                                   | System                        |
  | ------- | ---------------------------------------------------------------------- | ----------------------------- |
  | Expense | `shearing`, `treatment`, `shepherdPay`, `equipment`, `other`           | `sheepPurchase`, `restock`    |
  | Income  | `wool`, `meat`, `other`                                                | `sheepSale`                   |

  A new Farm gets them in `createFarm`. A Farm that existed before this slice gets them lazily: when
  `money.categories` gives an empty list (a Farm always has its System categories after the
  seed), the hook `useMoneyCategories` calls `money.ensureCategories` one time. A Convex query
  cannot write, so the lazy seed is a command. The command of an event that needs a System
  category (`createAutomaticRecord`) makes the lists first too. All three call one function, which
  adds each default key that the Farm does not have; a Deleted category counts as one that the Farm
  has, so it does not come back. The entries of the lazy seed have no actor: the app made the
  categories, not the Member who opened the page.
- **System categories** are the categories of the Automatic records: «Покупка баранов»
  (`sheepPurchase`), «Пополнение ресурса» (`restock`) and «Продажа баранов» (`sheepSale`). A Member
  cannot rename, archive or delete them, nor select one for a manual record
  (`moneyCategory.system`). The filters of the tables show them.
- **The tables** show the records of a period (the index `by_farmId_deletedAt_kind_date` gives the
  range), of a category and of a scope, the newest first, with the total (`listMoneyRecords`). A
  scope filter is exact: the records of a Flock do not include the records of its Sheep. The page
  opens on this year, because one Convex query reads at most a few thousand rows well.

**For the commands of other slices** (#12 Sale and Purchase, #13 Restock): an event with a price
makes an Automatic record with the functions of `core/src/money/commands.ts`. They check no
permission (the command of the event checks its own), and they append an audit entry for the record
with the name of the command of the event.

- `createAutomaticRecord(ctx, command, { key, source, date, amount, scope })` makes the record in
  the System category of the key, with `source: { kind: "sale" | "purchase" | "restock", id }`.
  An event has one record: a second call for the same source throws.
- `updateAutomaticRecord(ctx, command, source, { date, amount, scope })` changes it when the event
  changes. `deleteAutomaticRecord(ctx, command, source)` makes it Deleted when someone cancels the
  event. The repository finds the record of an event with `findBySource`.
- **The record keeps the price.** The event reads it with `findBySource` and stores no copy, so
  the two never differ. A Member changes the amount (and the notes) of an Automatic record in the
  table, as of any record; its event owns the date, the category and the scope, and a Member cannot
  delete it (`money.automatic`).

## Sales and Purchases

The module `core/src/deals/` keeps the Sales and the Purchases of Sheep: the page «Сделки», the card
of a deal, the bulk action «Продать» of the table «Бараны» and the panel «Купить баранов». A deal is
a Sale or a Purchase, and its `kind` tells which. The table `deals` keeps both, with the date, the
Sheep (`sheepIds`, in the order of the form) and the Flock of a Purchase.

- **A Sale** (`sellSheep`, `deals.sell`) sells one or more Sheep that are on the Farm, also of
  different Owners, on a date, for one total price. Each Sheep becomes Sold with
  `recordStatusChange`: it leaves its Flock on that date, and its change of the Status keeps the id
  of the Sale (`saleId`). The date follows the rules of a change of the Status
  (`sheep.statusDateInvalid`).
- **A Purchase** (`buySheep`, `deals.buy`) registers one or more new Sheep in one form, on a date,
  for one total price, with an optional Flock. Each Sheep has the Origin Bought, the id of its
  Purchase (`purchaseId`) and the rules of a new Sheep (`validBoughtSheep`): a free Tag, also among
  the rows of the form, a Member as the Owner, and a birth date that is not after the Purchase
  (`deal.bornAfterPurchase`). With a Flock, each Sheep goes into it on that date. No event of a
  Bought Sheep (a move, a change of the Owner or of the Status) is before its Purchase
  (`purchaseDate`), as no event is before the birth date.
- **A deal always has a price,** from 0,01 to `maxAmount` (`deal.priceInvalid`), and its date is not
  in the future (`deal.dateInFuture`). The Farm gets or pays all the money on that day.
- **The Automatic record.** A Sale makes an Income of «Продажа баранов» (`sheepSale`), a Purchase an
  Expense of «Покупка баранов» (`sheepPurchase`), with `createAutomaticRecord` and the source
  `{ kind: "sale" | "purchase", id }`. The record is about the Sheep if the deal has one, else about
  the Farm: a total price of many Sheep is not split between them.
- **One amount.** The deal stores no price: its queries read the amount of its record
  (`findBySource`). `changeDealPrice` (`deals.changePrice`) changes the amount with
  `updateAutomaticRecord`, and a change of the amount in the table of the Incomes or the Expenses
  changes the price of the deal in the same way. The date and the Sheep of a deal do not change: to
  correct them, a Member cancels the deal and makes it again.
- **A cancel** (`cancelDeal`, `deals.cancel`) makes the deal and its record Deleted
  (`deleteAutomaticRecord`), so the Trash can restore them. A cancelled Sale makes its Sheep Active
  again: its changes of the Status become Deleted (`revertStatusChange`), and each Sheep goes back to
  the Flock that it left, if that Flock is not Archived now. The Owner of each Sheep must be a Member
  now (`sheep.ownerNotMember`). A cancelled Purchase makes its Sheep Deleted. The core rejects it if
  one of them is a parent (`sheep.isParent`), or if a Sale sold one (`deal.sheepSold`). All checks of
  a cancel come before its first write.
- **A deal never has a Deleted Sheep.** `deleteSheep` rejects a Sold Sheep and a Sheep that a
  Purchase brought (`sheep.inDeal`): a Member cancels the deal instead. An undo of a change of the
  Status takes only the changes of the lifecycle: a Sale has its own cancel.
- **The links.** The tables of the Incomes and the Expenses show the deal of an Automatic record as
  a link to its card. The card of a Sheep links to its Purchase (`SheepCard.purchaseId`) and to its
  Sale (`StatusChangeRow.saleId`).
- **The audit entries.** Each command appends one entry for the deal (`Sale` or `Purchase`), one for
  its record and one for each of its Sheep: `sale.create`, `sale.updatePrice`, `sale.cancel`,
  `purchase.create`, `purchase.updatePrice`, `purchase.cancel`.

## Resources

The module `core/src/resources/` keeps the feed of a Farm: the Resources (hay, grain…), their Stock,
and the events that change it. The page «Ресурсы» lists the Resources with their Stock, and the card
of a Resource shows its Stock and its events, the newest first, each with the Stock after it.

- **A quantity is an integer of thousandths** of the unit of its Resource (`quantityScale`): 1500 is
  1,5 kg. A sum is then exact, and a quantity has at most three decimals. One event has at most
  `maxQuantity` (1 000 000 units). The web app reads and shows quantities with `parseQuantity` and
  `formatQuantity` of `format.ts`. With three decimals «1,500» is ambiguous, so `parseQuantity` reads
  it in the language of the UI: 1,5 in Russian, 1500 in English.
- **A Resource** has a name (unique in the Farm, also among the Archived ones, by `nameKey`) and one
  unit of measure, a text that the Member writes, such as «кг», «тюк» or «мешок». The unit changes
  only while the Resource has no events (`resource.unitLocked`). An Archived Resource stays in the
  list and keeps its card, but it gets no new events (`resource.archived`).
- **The events** (`resourceEvents`) are a Restock, a Usage and an Adjustment. Each one has a date
  (not in the future) and a quantity. A Usage has a Flock that is not Archived; an Adjustment has a
  reason. An event never changes: a Member cancels one made by mistake (`cancelResourceEvent`), and
  it becomes Deleted.
- **The Stock** is the sum of the Restocks, minus the Usages, plus or minus the Adjustments
  (`stockOf`). `stockSteps` computes it event by event, in the order of `inEventOrder`: by date, and
  in one date the Restocks and the Usages in the order of recording, then the Adjustments. The Stock
  can be less than 0, for example when a Member records a Usage before the Restock; the UI shows it
  red. The row of a Resource keeps its Stock (`Resource.stock`), so that the list reads no events:
  each command that adds or cancels an event computes it again from all the events of the Resource.
  The card computes it from the events itself.
- **An Adjustment is a count.** It keeps the quantity that the count found (its `quantity`), and the
  Stock at the end of its date becomes that quantity: its change is the difference from the Stock
  before it. Thus a Usage that a Member records later with a date before the count, or a wrong
  Restock that a Member cancels and records again, does not move the Stock after the count: the
  count already saw the real quantity. A count equal to the Stock on its date is refused
  (`resource.adjustmentNoChange`).
- **A Restock with a price** makes an Automatic Expense of the System category «Пополнение ресурса»
  (`restock`), of the Farm as a whole, with `createAutomaticRecord` and the source
  `{ kind: "restock", id }` (`restockSource`). The Expense keeps the price: the card reads it with
  `findBySource`, and a Member changes it in the table of Expenses. Cancelling the Restock makes the
  Expense Deleted. The Farm's own harvest is a Restock with no price.
- **Audit.** A command of an event appends an entry for the event (`ResourceEvent`), one for its
  Resource and, for a Usage, one for its Flock. A Restock with a price also appends the entry of its
  Expense.

### Norms and the forecast

Each Resource has a Norm for a Ram, an Ewe and a Lamb, in thousandths of its unit per Sheep per day.
A Norm of 0 means no Norm. Changing Norms does not change the Stock.

The Usage form suggests the sum of each Norm times the number of Sheep of its group in the Flock
now, times the days since its last Usage of this Resource. A first Usage gets one day; a Usage on
the same date gets zero days. Later Usages do not count. The Member can change the quantity before
saving it.

The forecast divides the Stock by the daily need and rounds down to whole days. The Farm's daily
need is the sum of the needs of its Flocks that are not Archived. Each Flock also shows how long the
whole Stock would last for it alone. Only Sheep on the Farm now count. A Sheep with no birth date
is an adult; the others use the Farm's lamb age on the requested date. With no daily need there is
no forecast. A Stock of 0 or less lasts zero days when there is a daily need.

Both queries take a calendar date from the client, so their results do not depend on the clock.
The client uses today in the Farm's time zone and refreshes it when the day changes.

## The Trash

The module `core/src/trash/` lists the Deleted records of a Farm and restores them (ADR 0005): the
page «Корзина» (`trash.list`, `trash.restore`). A Member restores a record that someone deleted by
mistake, and it comes back as it was.

- **The kinds.** Each module with records that a Member deletes gives one `TrashType` in its file
  `trash.ts`: `list` (what the page shows of each Deleted record) and `restore` (the command, with
  the rules of the module, next to its delete in `commands.ts`). `trashTypes` in
  `trash/registry.ts` lists them, and `TrashItem` and `TrashKind` come from that list. Now the
  kinds are `sheep`, `deal` (Sales and Purchases), `moneyRecord` (Expenses and Incomes),
  `moneyCategory`, `resourceEvent` (Restocks, Usages and Adjustments), `breed` and
  `shepherdAssignment`.
- **A record that belongs to another one is not an entry of its own.** The Automatic record of a
  cancelled deal or Restock, and the Sheep of a cancelled Purchase, come back with their event.
  Their own restore fails (`money.automatic`, `sheep.inDeal`).
- **A restore checks the rules again.** While a record is Deleted, no rule sees it: another Sheep
  can take its Tag, its Owner can leave the Farm, its Flock can become Archived. So a restore checks
  the rules that are about other records, all before the first write, and fails with the error of
  the first one that it breaks. For example: `sheep.tagTaken`, `sheep.ownerNotMember` (an Active or
  a Lost Sheep), `flock.archived` (a Sheep in an Archived Flock), `passport.notArashan`, the rules
  of the pedigree, `breed.nameTaken`, `moneyCategory.nameTaken`, `flock.assignmentOverlaps`,
  `resource.archived`. A record that needs a Deleted record fails until a Member restores that
  record first: `trash.parentDeleted` (the Mother or the Father), `trash.sheepDeleted` (a Sheep of
  a Sale, the Sheep of an Expense or an Income) and `trash.breedDeleted` (a Breed of the parts by
  hand).
- **A cancelled deal comes back as a full deal.** A Sale sells its Sheep again on its date, with
  `recordStatusChange`: the rules of a change of the Status apply (`sheep.notActive`,
  `sheep.statusDateInvalid`), and each Sheep leaves its Flock again. A Purchase brings back its
  Sheep, each by the rules of a restored Sheep (`requireRestorableSheep`). Both bring back their
  Automatic record (`restoreAutomaticRecord`, with `findDeletedBySource`), so the price is the same.
- **A cancelled Resource event** changes the Stock again, as when it was new, and a Restock brings
  back its Automatic Expense. An Archived Resource gets no events (`resource.archived`).
- **Not in the Trash:** an undone Flock move and an undone change of the Status. They are steps of
  the history of a Sheep that a Member undoes with «Отменить» and records again with the same form.
  A Lambing has no cancel yet, so it is not in the Trash either.
- **The audit log.** A restore appends one entry for each record that comes back, with the command
  of its kind: `sheep.restore`, `breed.restore`, `flock.restoreAssignment`, `money.restore`,
  `moneyCategory.restore`, `sale.restore`, `purchase.restore`, `resource.restoreEvent`. A Sale
  appends entries for the deal, its Income and each Sheep, as its cancel does.
- **The repositories.** Each repository of a kind has `listDeleted` (or `listDeletedEvents`,
  `listDeletedAssignments`) for the list, and `getDeleted` and `markRestored` for the restore. They
  read the Deleted rows of the Farm through its indexes, which start with `farmId` and `deletedAt`.

To add a kind of record to the Trash:

1. **Core:** `listDeleted`, `getDeleted` and `markRestored` in the repository port and in the
   repositories in memory; the restore command next to the delete, with its rules and a
   `CommandName`; a `TrashType` in the file `trash.ts` of the module; one line in `trashTypes`.
2. **Backend:** the three methods in the adapter, and a test in `convex/trash.test.ts`. The
   function `trash.restore` takes the kind as a string, so it needs no change.
3. **Web:** the label and the description of the kind on the page «Корзина», the label of the
   command in the history, and the fake repositories of the tests.

## The audit log

Each command that writes a record appends at least one audit entry: the actor (the User, or null
for the CLI and for the app itself), the time, the command, the Farm, and the target (the kind and the id of the record).

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
  The reader `history` of `FarmReaders` (`FarmAuditReader`) reads it.
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
- A Member restores a Deleted record from the Trash (see "The Trash"): `markRestored` removes
  `deletedAt`.
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
| `packages/core`    | Unit tests of the rules, with repositories in memory (`src/testing/`). The pedigree tests use one pedigree of four generations. |
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

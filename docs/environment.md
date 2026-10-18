# Environment and deployment

Arashan uses three hosted services:

- **Clerk** identifies the User. See [ADR 0003](./adr/0003-clerk-for-identity-only.md).
- **Convex** keeps the data and runs the backend functions. The project has a development
  deployment and a production deployment.
- **Vercel** serves the web app: a preview for each pull request, and production for `main`.

This file gives the names of the environment variables, where each one is set, and what reads it.
It never contains values.

## Set up the services

Run the wizard from the repository root:

```sh
scripts/setup-services.sh
```

The wizard opens each dashboard, tells you what to click, and asks for the values. Then it sets
the Vercel variables with the Vercel CLI, the GitHub Actions secrets and variables with `gh`, and
writes `apps/web/.env.local`. It keeps the values in `.env.setup.local` (git-ignored), so that a
re-run offers them again. Delete that file when the setup is done: it contains secrets.

Before you start, you need:

- Accounts on Clerk, Convex and Vercel.
- `gh`, logged in to GitHub with access to this repository (`gh auth status`).
- `vp`. The wizard runs the Vercel CLI with `vp dlx`, so you do not install it.

## Variables

| Name                         | Secret | Where it is set                                     | What reads it                                       |
| ---------------------------- | ------ | --------------------------------------------------- | --------------------------------------------------- |
| `VITE_CONVEX_URL`            | no     | Vercel (production, preview); local env file        | The web app: the Convex client                      |
| `VITE_CLERK_PUBLISHABLE_KEY` | no     | Vercel (production, preview); GitHub variable; `apps/web/.env.local` | The web app: `ClerkProvider`         |
| `CLERK_JWT_ISSUER_DOMAIN`    | no     | Convex (dev, prod, local); GitHub variable          | `convex/auth.config.ts`: validates the Clerk JWT    |
| `CLERK_SECRET_KEY`           | yes    | Convex (dev, prod); GitHub secret                   | Convex actions that call the Clerk Backend API (`members.setPassword`) |
| `CONVEX_DEPLOY_KEY`          | yes    | GitHub secret                                       | `convex deploy` to the production deployment        |
| `VERCEL_TOKEN`               | yes    | GitHub secret                                       | The Deploy workflow: the Vercel CLI                 |
| `VERCEL_ORG_ID`              | no     | GitHub variable                                     | The Deploy workflow: selects the Vercel team        |
| `VERCEL_PROJECT_ID`          | no     | GitHub variable                                     | The Deploy workflow: selects the Vercel project     |

The production deploy key has the permissions `deployment:deploy` and `deployment:env:view`.

Values for each environment:

- **Production** (Vercel production, from `main`): `VITE_CONVEX_URL` is the URL of the production
  Convex deployment.
- **Preview** (Vercel preview, from each pull request): `VITE_CONVEX_URL` is the URL of the
  development Convex deployment. Previews do not get their own Convex deployment, and CI pushes no
  functions to it.
- **Local**: `VITE_CLERK_PUBLISHABLE_KEY` is in `apps/web/.env.local`, because Vite reads the env
  files from the app's root. `VITE_CONVEX_URL` comes from the local Convex deployment. A new
  checkout or worktree has no `apps/web/.env.local`: copy it from another checkout, or run the
  wizard. Without the key, the app stops with an error.
- **Local deployment**: `vp dev` sets `CLERK_JWT_ISSUER_DOMAIN` on a local Convex deployment that
  does not have it. It takes the value from `VITE_CLERK_PUBLISHABLE_KEY`, which encodes the Frontend
  API host (`pk_test_` + base64 of `<host>$`).
- **Local deployment and Clerk**: a new password for a Member (`members.setPassword`) needs
  `CLERK_SECRET_KEY` on the deployment. `vp dev` does not set it; set it by hand with
  `vp -C packages/backend exec convex env set CLERK_SECRET_KEY …`. Without it, the action fails.
- **CI**: the backend job pushes the functions to a new local deployment. It sets
  `CLERK_JWT_ISSUER_DOMAIN` to a placeholder, because a push does not contact the issuer.

Each deployment needs `CLERK_JWT_ISSUER_DOMAIN`: `convex/auth.config.ts` reads it, and Convex refuses
each push to a deployment that does not have it.

Variables with the `VITE_` prefix go into the browser bundle. Never give a secret this prefix.

## Clerk

- One Clerk **development** instance (`pk_test_…`, `sk_test_…`) serves all environments for now.
  A Clerk production instance needs a domain that we own, and a `*.vercel.app` domain is not
  permitted. When the app gets its own domain, make a production instance and replace the Clerk
  values in production.
- Sign-in: a username and a password. The email is optional, and the phone is off.
- The Clerk **Convex integration** is on. Convex accepts the Clerk session token, and
  `convex/auth.config.ts` uses `CLERK_JWT_ISSUER_DOMAIN` with `applicationID: "convex"`. There is
  no custom JWT template.
- **The session token carries the username.** By default it has none. In the Clerk dashboard, open
  Sessions → Customize session token, keep the claims that are there (such as `aud`), and add
  `"preferred_username": "{{user.username}}"`. Convex gives it as `identity.preferredUsername`.
  Without it, each log-in fails with `user.usernameMissing`.
- There is no open sign-up for a Farm: anybody can make an account, but a User has no Farm until a
  Member's invite link adds the User (docs/architecture.md, "Invites").

## The Operator

The Operator makes the Farms (screen «Фермы»). The flag is not a Role in a Farm, and only the CLI
sets it, for a User who logged in at least once. Get the Clerk user id of the person in the Clerk
dashboard: Users → the user → User ID (`user_…`).

```sh
# The local deployment.
vp -C packages/backend exec convex run users:setOperator '{"clerkUserId": "user_…"}'
# The production deployment: with the production deploy key in CONVEX_DEPLOY_KEY.
vp -C packages/backend exec convex run --prod users:setOperator '{"clerkUserId": "user_…"}'
```

`'{"clerkUserId": "user_…", "isOperator": false}'` takes the flag away. The command prints the id
and the username of the User, and fails if the person never logged in.

## Deployment

Vercel's builders have Node.js 24 and pnpm 10 at most. This repository needs Node.js 26 and
pnpm 12. Thus Vercel does not build the repository:

- The Vercel project has no Git connection, and [`vercel.json`](../vercel.json) turns off Git
  deployments.
- [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) builds in GitHub Actions,
  where `setup-vp` installs the correct Node.js and pnpm. It runs `vercel pull` for the variables
  of the target environment, then `vp build`. It writes the
  [Build Output API](https://vercel.com/docs/build-output-api) layout itself, because
  `vercel build` refuses an `engines.node` that Vercel does not have. Then it runs
  `vercel deploy --prebuilt`. It deploys a preview for each pull request, and comments the URL on
  the pull request. It deploys production for each push to `main`.
- Vercel Authentication protects the deployment URLs, so a preview opens only for a member of the
  Vercel team. The production domain is public.
- When the secrets are not available, the Deploy workflow deploys nothing and passes. This occurs
  for pull requests from forks and from Dependabot.

The Vercel variables are plain variables, not sensitive ones, because `vercel pull` gets no values
of sensitive variables. The two secrets that a build can need, `CONVEX_DEPLOY_KEY` and
`CLERK_SECRET_KEY`, are GitHub secrets and not Vercel variables. The web app is a static SPA, so
it never needs them at run time.

### The Convex functions

- **Production:** for each push to `main`, the Deploy workflow runs `convex deploy` in
  `packages/backend` with `CONVEX_DEPLOY_KEY`, before it builds the web app. The key selects the
  production deployment. If `convex deploy` fails, the workflow stops, and the web app is not
  deployed. The web app gets the URL of the production deployment from the Vercel variables.
- **Previews:** a pull request pushes no functions. A preview uses the development deployment, which
  has the functions that a developer pushed with `convex dev` (`vp dev`) against it.

# Views get data only through domain hooks

The view layer never imports Convex. It uses only the hooks from `packages/client`, for example `useSheepList` and `useSellSheep`. These hooks use TanStack Query and return the types of the core, not Convex documents. The Convex transport and `usePaginatedQuery` stay inside `packages/client`. Thus, to replace Convex, we change `packages/client` and the server, and the views stay the same. A lint rule (`no-restricted-imports`) and the strict pnpm dependencies enforce this boundary.

## Consequences

- The TanStack Query adapter for Convex is in beta and has no pagination, so `packages/client` mixes the adapter with `usePaginatedQuery`.
- A non-React client (for example GPUI, now not a goal) cannot use the hooks. It must call the server functions directly.

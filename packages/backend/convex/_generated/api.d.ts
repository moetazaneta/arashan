/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as app from "../app.js";
import type * as breeds from "../breeds.js";
import type * as deals from "../deals.js";
import type * as farms from "../farms.js";
import type * as flocks from "../flocks.js";
import type * as invites from "../invites.js";
import type * as lambings from "../lambings.js";
import type * as lib_clerk from "../lib/clerk.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_records from "../lib/records.js";
import type * as lib_repositories from "../lib/repositories.js";
import type * as lib_tokens from "../lib/tokens.js";
import type * as locations from "../locations.js";
import type * as members from "../members.js";
import type * as money from "../money.js";
import type * as resources from "../resources.js";
import type * as sheep from "../sheep.js";
import type * as shepherds from "../shepherds.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  app: typeof app;
  breeds: typeof breeds;
  deals: typeof deals;
  farms: typeof farms;
  flocks: typeof flocks;
  invites: typeof invites;
  lambings: typeof lambings;
  "lib/clerk": typeof lib_clerk;
  "lib/functions": typeof lib_functions;
  "lib/records": typeof lib_records;
  "lib/repositories": typeof lib_repositories;
  "lib/tokens": typeof lib_tokens;
  locations: typeof locations;
  members: typeof members;
  money: typeof money;
  resources: typeof resources;
  sheep: typeof sheep;
  shepherds: typeof shepherds;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

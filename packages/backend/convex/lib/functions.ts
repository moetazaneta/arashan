import {
  type CommandContext,
  DomainError,
  enterFarm,
  type FarmCommandContext,
  type FarmId,
  type FarmQueryContext,
  type Identity,
  type QueryContext,
  type SystemContext,
} from "@arashan/core";
import type { RegisteredMutation, RegisteredQuery } from "convex/server";
import { ConvexError, type ObjectType, type PropertyValidators, v } from "convex/values";

import {
  type DatabaseWriter,
  internalMutation as convexInternalMutation,
  type MutationCtx,
  mutation as convexMutation,
  type QueryCtx,
  query as convexQuery,
} from "../_generated/server";
import { farmRepositories, readers, repositories } from "./repositories";
import { tokens } from "./tokens";

// The builders for the public functions. Each function in this directory uses them, not the builders
// in _generated/server. They give the core its context, check the Membership of the Farm through the
// core, and send a DomainError to the client as a `ConvexError` with its code.
//
// - `query`, `command`: a request with no Farm, such as the list of the User's Farms.
// - `farmQuery`, `farmCommand`: a request to one Farm. The builder adds the argument `farmId`, calls
//   `enterFarm` of the core, and gives the function the Member, the Farm, and repositories bound to
//   the Farm.
// - `systemCommand`: an internal function for the CLI. No client can call it.
//
// Each command that writes a record must append an audit entry. The command builders check it: they
// count the writes, and a command that wrote records but appended no audit entry fails (a bug, not a
// domain error), so the transaction writes nothing.

/** The data of the `ConvexError` that carries a DomainError to the client. */
export type DomainErrorData = {
  code: DomainError["code"];
};

async function withDomainErrors<Result>(run: () => Promise<Result> | Result): Promise<Result> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof DomainError) {
      throw new ConvexError<DomainErrorData>({ code: error.code });
    }
    throw error;
  }
}

/** The person who makes the request, from the Clerk token that Convex validated (ADR 0003). */
async function identityOf(ctx: QueryCtx): Promise<Identity | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;
  return {
    key: identity.tokenIdentifier,
    providerUserId: identity.subject,
    // A claim of the Clerk session token: see docs/environment.md.
    username: identity.preferredUsername ?? null,
  };
}

async function queryContext(ctx: QueryCtx): Promise<QueryContext> {
  return {
    identity: await identityOf(ctx),
    repos: readers(ctx.db),
    now: () => Date.now(),
    tokens,
  };
}

/** A database that counts its writes. */
function countWrites(db: DatabaseWriter): { db: DatabaseWriter; writes: () => number } {
  let writes = 0;
  const writeMethods = new Set<PropertyKey>(["insert", "patch", "replace", "delete"]);
  const counted = new Proxy(db, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      if (!writeMethods.has(property)) return value.bind(target);
      return (...args: unknown[]) => {
        writes += 1;
        return value.apply(target, args);
      };
    },
  });
  return { db: counted, writes: () => writes };
}

/**
 * Runs a command with the database of the records and the database of the audit log, and fails if
 * the command wrote records but appended no audit entry.
 */
export async function audited<Result>(
  db: DatabaseWriter,
  run: (records: DatabaseWriter, audit: DatabaseWriter) => Promise<Result>,
): Promise<Result> {
  const records = countWrites(db);
  const audit = countWrites(db);
  const result = await run(records.db, audit.db);
  if (records.writes() > 0 && audit.writes() === 0) {
    throw new Error("A command wrote records but appended no audit entry.");
  }
  return result;
}

/** A public query with no Farm. */
export function query<Args extends PropertyValidators, Result>(definition: {
  args: Args;
  handler: (ctx: QueryContext, args: ObjectType<Args>) => Promise<Result> | Result;
}): RegisteredQuery<"public", ObjectType<Args>, Promise<Result>> {
  return convexQuery({
    args: definition.args,
    handler: (ctx: QueryCtx, args: ObjectType<Args>) =>
      withDomainErrors(async () => definition.handler(await queryContext(ctx), args)),
  } as never);
}

/** A public mutation with no Farm, that runs a command of the core. */
export function command<Args extends PropertyValidators, Result>(definition: {
  args: Args;
  handler: (ctx: CommandContext, args: ObjectType<Args>) => Promise<Result> | Result;
}): RegisteredMutation<"public", ObjectType<Args>, Promise<Result>> {
  return convexMutation({
    args: definition.args,
    handler: (ctx: MutationCtx, args: ObjectType<Args>) =>
      withDomainErrors(async () => {
        const identity = await identityOf(ctx);
        return audited(ctx.db, (records, audit) =>
          Promise.resolve(
            definition.handler(
              { identity, repos: repositories(records, audit), now: () => Date.now(), tokens },
              args,
            ),
          ),
        );
      }),
  } as never);
}

/** The arguments of a function of one Farm: its own, and the Farm. */
type FarmArgs<Args extends PropertyValidators> = Args & { farmId: ReturnType<typeof v.string> };

function withFarmId<Args extends PropertyValidators>(args: Args): FarmArgs<Args> {
  return { ...args, farmId: v.string() };
}

/** The Farm of a request to one Farm, and the other arguments. */
function splitFarmId<Args extends PropertyValidators>(allArgs: ObjectType<FarmArgs<Args>>) {
  const { farmId, ...args } = allArgs as unknown as { farmId: string };
  return { farmId: farmId as FarmId, args: args as unknown as ObjectType<Args> };
}

/** A public query of one Farm. Only a Member of the Farm gets past `enterFarm`. */
export function farmQuery<Args extends PropertyValidators, Result>(definition: {
  args: Args;
  handler: (ctx: FarmQueryContext, args: ObjectType<Args>) => Promise<Result> | Result;
}): RegisteredQuery<"public", ObjectType<FarmArgs<Args>>, Promise<Result>> {
  return convexQuery({
    args: withFarmId(definition.args),
    handler: (ctx: QueryCtx, allArgs: ObjectType<FarmArgs<Args>>) =>
      withDomainErrors(async () => {
        const { farmId, args } = splitFarmId<Args>(allArgs);
        const { member, farm } = await enterFarm(await queryContext(ctx), farmId);
        return definition.handler({ member, farm, now: () => Date.now() }, args);
      }),
  } as never);
}

/** A public mutation of one Farm. Only a Member of the Farm gets past `enterFarm`. */
export function farmCommand<Args extends PropertyValidators, Result>(definition: {
  args: Args;
  handler: (ctx: FarmCommandContext, args: ObjectType<Args>) => Promise<Result> | Result;
}): RegisteredMutation<"public", ObjectType<FarmArgs<Args>>, Promise<Result>> {
  return convexMutation({
    args: withFarmId(definition.args),
    handler: (ctx: MutationCtx, allArgs: ObjectType<FarmArgs<Args>>) =>
      withDomainErrors(async () => {
        const { farmId, args } = splitFarmId<Args>(allArgs);
        const { member, farm } = await enterFarm(await queryContext(ctx), farmId);
        return audited(ctx.db, (records, audit) =>
          Promise.resolve(
            definition.handler(
              {
                member,
                farm,
                repos: farmRepositories(records, audit, farm.id),
                now: () => Date.now(),
              },
              args,
            ),
          ),
        );
      }),
  } as never);
}

/**
 * An internal mutation for the CLI (`convex run`). No client can call it, so it gets no identity:
 * its audit entries have no actor.
 */
export function systemCommand<Args extends PropertyValidators, Result>(definition: {
  args: Args;
  handler: (ctx: SystemContext, args: ObjectType<Args>) => Promise<Result> | Result;
}): RegisteredMutation<"internal", ObjectType<Args>, Promise<Result>> {
  return convexInternalMutation({
    args: definition.args,
    handler: (ctx: MutationCtx, args: ObjectType<Args>) =>
      withDomainErrors(() =>
        audited(ctx.db, (records, audit) =>
          Promise.resolve(
            definition.handler(
              { system: true, repos: repositories(records, audit), now: () => Date.now() },
              args,
            ),
          ),
        ),
      ),
  } as never);
}

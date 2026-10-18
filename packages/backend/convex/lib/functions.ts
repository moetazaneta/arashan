import { type CommandContext, DomainError, type QueryContext } from "@arashan/core";
import type { RegisteredMutation, RegisteredQuery } from "convex/server";
import { ConvexError, type ObjectType, type PropertyValidators } from "convex/values";

import {
  type MutationCtx,
  mutation as convexMutation,
  type QueryCtx,
  query as convexQuery,
} from "../_generated/server";
import { sampleReader, sampleRepository } from "./repositories";

// The builders for the public functions. Each function in this directory uses them, not the builders
// in _generated/server: they give the core its context, and they send a DomainError to the client as
// a `ConvexError` with its code. Later slices add the actor, the Farm, the permission check and the
// audit log here, in one place.

function queryContext(ctx: QueryCtx): QueryContext {
  return { repos: { samples: sampleReader(ctx.db) } };
}

function commandContext(ctx: MutationCtx): CommandContext {
  return { repos: { samples: sampleRepository(ctx.db) }, now: () => Date.now() };
}

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

/** A public query that calls the core with read-only repositories. */
export function query<Args extends PropertyValidators, Result>(definition: {
  args: Args;
  handler: (ctx: QueryContext, args: ObjectType<Args>) => Promise<Result> | Result;
}): RegisteredQuery<"public", ObjectType<Args>, Promise<Result>> {
  return convexQuery({
    args: definition.args,
    handler: (ctx: QueryCtx, args: ObjectType<Args>) =>
      withDomainErrors(() => definition.handler(queryContext(ctx), args)),
  } as never);
}

/** A public mutation that runs a command of the core. */
export function command<Args extends PropertyValidators, Result>(definition: {
  args: Args;
  handler: (ctx: CommandContext, args: ObjectType<Args>) => Promise<Result> | Result;
}): RegisteredMutation<"public", ObjectType<Args>, Promise<Result>> {
  return convexMutation({
    args: definition.args,
    handler: (ctx: MutationCtx, args: ObjectType<Args>) =>
      withDomainErrors(() => definition.handler(commandContext(ctx), args)),
  } as never);
}

import { addSample, deleteSample, listSamples, type SampleId } from "@arashan/core";
import { v } from "convex/values";

import { command, query } from "./lib/functions";

// The throwaway sample module of the core. Delete this file with that module.

export const list = query({
  args: {},
  handler: (ctx) => listSamples(ctx),
});

export const add = command({
  args: { name: v.string() },
  handler: (ctx, args) => addSample(ctx, args),
});

const deleteSampleCommand = command({
  // A string, not `v.id("samples")`: the core sends its own ids, and an unknown id is a domain error.
  args: { id: v.string() },
  handler: (ctx, args) => deleteSample(ctx, { id: args.id as SampleId }),
});

export { deleteSampleCommand as delete };

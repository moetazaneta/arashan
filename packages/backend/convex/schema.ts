import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import { deletable } from "./lib/records";

export default defineSchema({
  // The throwaway sample module of the core. Delete it with that module.
  samples: defineTable({
    name: v.string(),
    ...deletable,
  }).index("by_deletedAt_name", ["deletedAt", "name"]),
});

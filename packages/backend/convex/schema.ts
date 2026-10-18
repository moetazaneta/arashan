import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import { deletable } from "./lib/records";

// The index order: a table of the records of one Farm starts each index with `farmId`, then
// `deletedAt`, so that a read stays in one Farm and can also list its Deleted records (the Trash).
// A table of no Farm, such as `users`, starts with `deletedAt`.

const role = v.union(v.literal("admin"), v.literal("editor"));

export default defineSchema({
  users: defineTable({
    /** The `tokenIdentifier` of the Clerk identity: `<issuer>|<Clerk user id>`. */
    identityKey: v.string(),
    /** The Clerk user id, for the calls to the Clerk Backend API. */
    providerUserId: v.string(),
    username: v.string(),
    isOperator: v.boolean(),
    ...deletable,
  })
    .index("by_deletedAt_identityKey", ["deletedAt", "identityKey"])
    .index("by_deletedAt_username", ["deletedAt", "username"]),

  farms: defineTable({
    name: v.string(),
    currency: v.string(),
    timeZone: v.string(),
    lambAgeMonths: v.number(),
    createdAt: v.number(),
    ...deletable,
  }).index("by_deletedAt_createdAt", ["deletedAt", "createdAt"]),

  memberships: defineTable({
    farmId: v.id("farms"),
    userId: v.id("users"),
    role,
    ...deletable,
  })
    .index("by_farmId_deletedAt", ["farmId", "deletedAt"])
    .index("by_userId_deletedAt_farmId", ["userId", "deletedAt", "farmId"]),

  invites: defineTable({
    farmId: v.id("farms"),
    role,
    /** The SHA-256 hash of the token of the link, in hex. The token itself is never stored. */
    tokenHash: v.string(),
    expiresAt: v.number(),
    createdBy: v.id("users"),
    usedAt: v.optional(v.number()),
    usedBy: v.optional(v.id("users")),
    revokedAt: v.optional(v.number()),
    ...deletable,
  })
    .index("by_farmId_deletedAt", ["farmId", "deletedAt"])
    .index("by_tokenHash", ["tokenHash"]),

  // Append-only: no command changes or erases an entry, so this table has no `deletable`.
  auditLog: defineTable({
    at: v.number(),
    /** The User who ran the command, or null for the CLI. */
    actorId: v.union(v.id("users"), v.null()),
    /** The Farm of the target, or null for a target of no Farm, such as a User. */
    farmId: v.union(v.id("farms"), v.null()),
    command: v.string(),
    targetKind: v.string(),
    targetId: v.string(),
  }).index("by_farmId_targetKind_targetId", ["farmId", "targetKind", "targetId"]),
});

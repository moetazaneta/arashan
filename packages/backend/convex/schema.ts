import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import { deletable } from "./lib/records";

// The index order: a table of the records of one Farm starts each index with `farmId`, then
// `deletedAt`, so that a read stays in one Farm and can also list its Deleted records (the Trash).
// A table of no Farm, such as `users`, starts with `deletedAt`.

const role = v.union(v.literal("admin"), v.literal("editor"));
const sex = v.union(v.literal("ram"), v.literal("ewe"));
const origin = v.union(v.literal("born"), v.literal("bought"), v.literal("external"));
const moneyKind = v.union(v.literal("expense"), v.literal("income"));
const sheepStatus = v.union(
  v.literal("active"),
  v.literal("sold"),
  v.literal("slaughtered"),
  v.literal("dead"),
  v.literal("lost"),
);
const grade = v.union(v.literal("elite"), v.literal("first"), v.literal("second"));

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
    .index("by_deletedAt_providerUserId", ["deletedAt", "providerUserId"]),

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
    /** When an Admin removed the Member. An Archived Membership gives no access to the Farm. */
    archivedAt: v.optional(v.number()),
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

  // A field that the core keeps as null (no Tag, no name…) is absent from the row.
  sheep: defineTable({
    farmId: v.id("farms"),
    tag: v.optional(v.string()),
    /**
     * The key of the Tag (`tagKey` of the core), to find a Tag that is taken. Absent if the Sheep
     * has no Tag, and for an External Sheep: its Tag never makes a Tag of the Farm taken.
     */
    tagKey: v.optional(v.string()),
    name: v.optional(v.string()),
    sex,
    /** A calendar date, "YYYY-MM-DD". */
    birthDate: v.optional(v.string()),
    origin,
    initialEntry: v.boolean(),
    status: sheepStatus,
    /** The Membership of the Owner. Absent only for an External Sheep. */
    ownerId: v.optional(v.id("memberships")),
    notes: v.optional(v.string()),
    /** The last weighing: the weight in kilograms and the date "YYYY-MM-DD". Both or none. */
    weightKg: v.optional(v.number()),
    weighedOn: v.optional(v.string()),
    // The columns of the pedigree, the Passport and the Grade came after the first rows, so each
    // one is optional: an older row has none of them.
    /** The Mother and the Father, if they are known. */
    motherId: v.optional(v.id("sheep")),
    fatherId: v.optional(v.id("sheep")),
    /**
     * The parts of the Breed composition by hand, in millionths. Absent if there are none. Arashan
     * has no row in `breeds`, so its part has the id "arashan". The composition itself is not
     * stored: the app computes it from the parents.
     */
    manualBreeds: v.optional(
      v.array(
        v.object({ breedId: v.union(v.id("breeds"), v.literal("arashan")), share: v.number() }),
      ),
    ),
    /**
     * The Passport: the number, the issue date "YYYY-MM-DD", and the scan if a Member attached it.
     * The number and the date are both or none, and the scan only comes with them.
     */
    passportNumber: v.optional(v.string()),
    passportIssuedOn: v.optional(v.string()),
    passportScanId: v.optional(v.id("_storage")),
    /** The last Grade and the date of the grading "YYYY-MM-DD". Both or none. */
    grade: v.optional(grade),
    gradedOn: v.optional(v.string()),
    /** The Flock that the Sheep is in now. Absent if it is in no Flock. */
    flockId: v.optional(v.id("flocks")),
    registeredAt: v.number(),
    /** The Purchase that brought a Bought Sheep. Absent if no Purchase brought it. */
    purchaseId: v.optional(v.id("deals")),
    ...deletable,
  })
    .index("by_farmId_deletedAt_tagKey", ["farmId", "deletedAt", "tagKey"])
    // Also the index of the list of all Sheep of the Farm, with only `farmId` and `deletedAt`.
    .index("by_farmId_deletedAt_status_ownerId", ["farmId", "deletedAt", "status", "ownerId"])
    // The children of a Sheep: the Sheep whose Mother or Father it is.
    .index("by_farmId_deletedAt_motherId", ["farmId", "deletedAt", "motherId"])
    .index("by_farmId_deletedAt_fatherId", ["farmId", "deletedAt", "fatherId"])
    .index("by_farmId_deletedAt_flockId", ["farmId", "deletedAt", "flockId"]),

  // The Breeds that the Members of a Farm add. Arashan has no row: each Farm has it, built into the
  // app.
  breeds: defineTable({
    farmId: v.id("farms"),
    name: v.string(),
    /** The key of the name (`breedNameKey` of the core), to find a name that is taken. */
    nameKey: v.string(),
    /** When a Member archived the Breed. A form does not offer an Archived Breed. */
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    ...deletable,
  })
    // Also the index of the list of the Breeds of the Farm, with only `farmId` and `deletedAt`.
    .index("by_farmId_deletedAt_nameKey", ["farmId", "deletedAt", "nameKey"]),
  // The moves of a Sheep into a Flock or out of all Flocks: the history of its Flock membership.
  sheepFlockMoves: defineTable({
    farmId: v.id("farms"),
    sheepId: v.id("sheep"),
    /** The Flock that the Sheep went into. Absent for a move out of all Flocks. */
    flockId: v.optional(v.id("flocks")),
    /** The date of the move, "YYYY-MM-DD". */
    date: v.string(),
    /** When a Member recorded the move. */
    at: v.number(),
    ...deletable,
  }).index("by_farmId_deletedAt_sheepId", ["farmId", "deletedAt", "sheepId"]),

  // The changes of the Status of a Sheep: the history of its life on the Farm.
  sheepStatusChanges: defineTable({
    farmId: v.id("farms"),
    sheepId: v.id("sheep"),
    from: sheepStatus,
    to: sheepStatus,
    /** The date of the change, "YYYY-MM-DD". */
    date: v.string(),
    reason: v.optional(v.string()),
    /** The move out of all Flocks that the change made. Absent if it made none. */
    flockMoveId: v.optional(v.id("sheepFlockMoves")),
    /** The Sale that made the Sheep Sold. Absent for a change of another kind. */
    saleId: v.optional(v.id("deals")),
    /** When a Member recorded the change. */
    at: v.number(),
    ...deletable,
  }).index("by_farmId_deletedAt_sheepId", ["farmId", "deletedAt", "sheepId"]),

  locations: defineTable({
    farmId: v.id("farms"),
    name: v.string(),
    /** The key of the name (`nameKey` of the core), to find a name that is taken. */
    nameKey: v.string(),
    notes: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    ...deletable,
  })
    // Also the index of the list of all Locations of the Farm.
    .index("by_farmId_deletedAt_nameKey", ["farmId", "deletedAt", "nameKey"]),

  shepherds: defineTable({
    farmId: v.id("farms"),
    name: v.string(),
    phone: v.optional(v.string()),
    notes: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    ...deletable,
  }).index("by_farmId_deletedAt", ["farmId", "deletedAt"]),

  flocks: defineTable({
    farmId: v.id("farms"),
    name: v.string(),
    /** The key of the name (`nameKey` of the core), to find a name that is taken. */
    nameKey: v.string(),
    /** Where the Flock stays now. Absent if it has no Location. */
    locationId: v.optional(v.id("locations")),
    archivedAt: v.optional(v.number()),
    ...deletable,
  })
    // Also the index of the list of all Flocks of the Farm.
    .index("by_farmId_deletedAt_nameKey", ["farmId", "deletedAt", "nameKey"]),

  // A Shepherd herds a Flock from a date to a date, both days included.
  flockAssignments: defineTable({
    farmId: v.id("farms"),
    flockId: v.id("flocks"),
    shepherdId: v.id("shepherds"),
    /** The first day, "YYYY-MM-DD". */
    from: v.string(),
    /** The last day, "YYYY-MM-DD". Absent while the assignment goes on. */
    to: v.optional(v.string()),
    ...deletable,
  })
    // Also the index of the list of all assignments of the Farm.
    .index("by_farmId_deletedAt_flockId", ["farmId", "deletedAt", "flockId"])
    .index("by_farmId_deletedAt_shepherdId", ["farmId", "deletedAt", "shepherdId"]),

  // The Lambings of the Ewes of a Farm. Each live Lamb is a row of `sheep`; a stillborn Lamb is only
  // the number `stillborn`.
  lambings: defineTable({
    farmId: v.id("farms"),
    motherId: v.id("sheep"),
    /** The Father, if he is known. */
    fatherId: v.optional(v.id("sheep")),
    /** The date of the Lambing, the birth date of its Lambs, "YYYY-MM-DD". */
    date: v.string(),
    /** The live Lambs, in the order of the form. */
    lambIds: v.array(v.id("sheep")),
    stillborn: v.number(),
    /** When a Member recorded the Lambing. */
    recordedAt: v.number(),
    ...deletable,
  }).index("by_farmId_deletedAt_motherId", ["farmId", "deletedAt", "motherId"]),

  // The categories of the Expenses and of the Incomes of a Farm: one list of each kind.
  moneyCategories: defineTable({
    farmId: v.id("farms"),
    kind: moneyKind,
    /**
     * The key of a category that the app made (`defaultCategoryKeys` of the core), such as
     * "shepherdPay". Absent for a category that a Member made.
     */
    key: v.optional(v.string()),
    /** The name that a Member gave. Absent for a category of the app with the name of its key. */
    name: v.optional(v.string()),
    /** The key of the name (`nameKey` of the core), to find a name that is taken. */
    nameKey: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    ...deletable,
  })
    // Also the index of the list of the categories of one kind.
    .index("by_farmId_deletedAt_kind_nameKey", ["farmId", "deletedAt", "kind", "nameKey"])
    // The keys of the Farm, also of the Deleted categories, so that a deleted one does not come back.
    .index("by_farmId_key", ["farmId", "key"]),

  // The Expenses and the Incomes of a Farm.
  moneyRecords: defineTable({
    farmId: v.id("farms"),
    kind: moneyKind,
    /** "YYYY-MM-DD". */
    date: v.string(),
    /** In hundredths of the currency unit of the Farm: an integer. */
    amount: v.number(),
    categoryId: v.id("moneyCategories"),
    /** The scope: a Flock or a Sheep. Both are absent for a record of the Farm as a whole. */
    flockId: v.optional(v.id("flocks")),
    sheepId: v.optional(v.id("sheep")),
    /** The Shepherd of an Expense of «Оплата чабану». */
    shepherdId: v.optional(v.id("shepherds")),
    notes: v.optional(v.string()),
    /** The event of an Automatic record: its kind and its id, both or none. */
    sourceKind: v.optional(v.union(v.literal("sale"), v.literal("purchase"), v.literal("restock"))),
    sourceId: v.optional(v.string()),
    createdAt: v.number(),
    ...deletable,
  })
    // The records of one kind in a period.
    .index("by_farmId_deletedAt_kind_date", ["farmId", "deletedAt", "kind", "date"])
    // The records of a category, also the Deleted ones: a category in use cannot become Deleted.
    // It has no `deletedAt` after `farmId`, unlike the other indexes.
    .index("by_farmId_categoryId", ["farmId", "categoryId"])
    // The Automatic record of an event.
    .index("by_farmId_deletedAt_sourceKind_sourceId", [
      "farmId",
      "deletedAt",
      "sourceKind",
      "sourceId",
    ]),

  // The Sales and the Purchases of Sheep. The price is the amount of the Automatic record in
  // `moneyRecords` (its source is the deal), so a deal stores no copy. A cancelled deal is Deleted.
  deals: defineTable({
    farmId: v.id("farms"),
    kind: v.union(v.literal("sale"), v.literal("purchase")),
    /** "YYYY-MM-DD". */
    date: v.string(),
    /** The Sheep of the deal, in the order of the form. */
    sheepIds: v.array(v.id("sheep")),
    /** The Flock of the new Sheep of a Purchase. Absent for a Sale, and for a Purchase without one. */
    flockId: v.optional(v.id("flocks")),
    createdAt: v.number(),
    ...deletable,
  })
    // The deals of the Farm by date.
    .index("by_farmId_deletedAt_date", ["farmId", "deletedAt", "date"]),

  // The Resources of a Farm: hay, grain…
  resources: defineTable({
    farmId: v.id("farms"),
    name: v.string(),
    /** The key of the name (`nameKey` of the core), to find a name that is taken. */
    nameKey: v.string(),
    unit: v.string(),
    /** The Stock now, in thousandths of the unit: the sum of the events, which each command writes. */
    stock: v.number(),
    archivedAt: v.optional(v.number()),
    ...deletable,
  })
    // Also the index of the list of all Resources of the Farm.
    .index("by_farmId_deletedAt_nameKey", ["farmId", "deletedAt", "nameKey"]),

  // The Restocks, the Usages and the Adjustments of the Resources.
  resourceEvents: defineTable({
    farmId: v.id("farms"),
    resourceId: v.id("resources"),
    kind: v.union(v.literal("restock"), v.literal("usage"), v.literal("adjustment")),
    /** "YYYY-MM-DD". */
    date: v.string(),
    /** In thousandths of the unit: an integer. The counted quantity for an Adjustment. */
    quantity: v.number(),
    /** The Flock of a Usage. */
    flockId: v.optional(v.id("flocks")),
    /** The reason of an Adjustment. */
    reason: v.optional(v.string()),
    createdAt: v.number(),
    ...deletable,
  }).index("by_farmId_deletedAt_resourceId", ["farmId", "deletedAt", "resourceId"]),

  // The changes of the Owner of a Sheep, for the history of the Owners on its card.
  sheepOwnerChanges: defineTable({
    farmId: v.id("farms"),
    sheepId: v.id("sheep"),
    previousOwnerId: v.id("memberships"),
    ownerId: v.id("memberships"),
    /** The date when the new Owner got the Sheep, "YYYY-MM-DD". */
    date: v.string(),
    /** When a Member recorded the change. */
    at: v.number(),
    ...deletable,
  }).index("by_farmId_deletedAt_sheepId", ["farmId", "deletedAt", "sheepId"]),

  // An Admin's request to set a new password for a Member through Clerk (`members.setPassword`).
  passwordResets: defineTable({
    farmId: v.id("farms"),
    membershipId: v.id("memberships"),
    /** The User who gets the new password. */
    userId: v.id("users"),
    /** The Admin who asked for it. */
    actorId: v.id("users"),
    createdAt: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("done"),
      v.literal("failed"),
      v.literal("unknown"),
    ),
    ...deletable,
  })
    .index("by_farmId_deletedAt", ["farmId", "deletedAt"])
    // The unfinished resets of a User in all Farms: they block the User's account changes.
    .index("by_userId_deletedAt_status", ["userId", "deletedAt", "status"]),

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

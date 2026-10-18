import type {
  AuditLog,
  Farm,
  FarmId,
  FarmReader,
  FarmRepositories,
  FarmRepository,
  Invite,
  InviteId,
  InviteReader,
  InviteRepository,
  Membership,
  MembershipId,
  MembershipReader,
  MembershipRepository,
  Readers,
  Repositories,
  User,
  UserId,
  UserReader,
  UserRepository,
} from "@arashan/core";

import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { DatabaseReader, DatabaseWriter } from "../_generated/server";

// The Convex adapters of the repository ports of the core. Each read hides Deleted records: it goes
// through an index with `deletedAt` undefined, or checks `deletedAt` after a `get`. The core passes
// its ids as strings; `normalizeId` turns them back into Convex ids, and an unknown id finds nothing.

async function getActive<Table extends TableNames>(
  db: DatabaseReader,
  table: Table,
  id: string,
): Promise<Doc<Table> | null> {
  const docId = db.normalizeId(table, id);
  const doc = docId === null ? null : await db.get(table, docId);
  return doc === null || (doc as { deletedAt?: number }).deletedAt !== undefined ? null : doc;
}

/** The Convex id of a record of the core, for a field that refers to it. */
function idOf<Table extends TableNames>(id: string): Id<Table> {
  return id as Id<Table>;
}

function toUser(doc: Doc<"users">): User {
  return { id: doc._id as string as UserId, username: doc.username, isOperator: doc.isOperator };
}

function toFarm(doc: Doc<"farms">): Farm {
  return {
    id: doc._id as string as FarmId,
    name: doc.name,
    currency: doc.currency,
    timeZone: doc.timeZone,
    lambAgeMonths: doc.lambAgeMonths,
    createdAt: doc.createdAt,
  };
}

function toMembership(doc: Doc<"memberships">): Membership {
  return {
    id: doc._id as string as MembershipId,
    farmId: doc.farmId as string as FarmId,
    userId: doc.userId as string as UserId,
    role: doc.role,
  };
}

function toInvite(doc: Doc<"invites">): Invite {
  return {
    id: doc._id as string as InviteId,
    farmId: doc.farmId as string as FarmId,
    role: doc.role,
    tokenHash: doc.tokenHash,
    expiresAt: doc.expiresAt,
    createdBy: doc.createdBy as string as UserId,
    ...(doc.usedAt !== undefined && doc.usedBy !== undefined
      ? { used: { at: doc.usedAt, by: doc.usedBy as string as UserId } }
      : {}),
    ...(doc.revokedAt !== undefined ? { revokedAt: doc.revokedAt } : {}),
  };
}

function userReader(db: DatabaseReader): UserReader {
  return {
    async get(id) {
      const doc = await getActive(db, "users", id);
      return doc === null ? null : toUser(doc);
    },
    async findByIdentity(identityKey) {
      const doc = await db
        .query("users")
        .withIndex("by_deletedAt_identityKey", (q) =>
          q.eq("deletedAt", undefined).eq("identityKey", identityKey),
        )
        .unique();
      return doc === null ? null : toUser(doc);
    },
    async findByProviderUserId(providerUserId) {
      const doc = await db
        .query("users")
        .withIndex("by_deletedAt_providerUserId", (q) =>
          q.eq("deletedAt", undefined).eq("providerUserId", providerUserId),
        )
        .unique();
      return doc === null ? null : toUser(doc);
    },
  };
}

function farmReader(db: DatabaseReader): FarmReader {
  return {
    async get(id) {
      const doc = await getActive(db, "farms", id);
      return doc === null ? null : toFarm(doc);
    },
    async list() {
      const docs = await db
        .query("farms")
        .withIndex("by_deletedAt_createdAt", (q) => q.eq("deletedAt", undefined))
        .order("desc")
        .collect();
      return docs.map(toFarm);
    },
  };
}

function membershipReader(db: DatabaseReader): MembershipReader {
  return {
    async find(userId, farmId) {
      // The id of the Farm comes from the client: a string that is no id of a Farm finds nothing.
      const farmDocId = db.normalizeId("farms", farmId);
      if (farmDocId === null) return null;
      const doc = await db
        .query("memberships")
        .withIndex("by_userId_deletedAt_farmId", (q) =>
          q.eq("userId", idOf(userId)).eq("deletedAt", undefined).eq("farmId", farmDocId),
        )
        .first();
      return doc === null ? null : toMembership(doc);
    },
    async listForUser(userId) {
      const docs = await db
        .query("memberships")
        .withIndex("by_userId_deletedAt_farmId", (q) =>
          q.eq("userId", idOf(userId)).eq("deletedAt", undefined),
        )
        .collect();
      return docs.map(toMembership);
    },
    async hasMembers(farmId) {
      const doc = await db
        .query("memberships")
        .withIndex("by_farmId_deletedAt", (q) =>
          q.eq("farmId", idOf(farmId)).eq("deletedAt", undefined),
        )
        .first();
      return doc !== null;
    },
  };
}

function inviteReader(db: DatabaseReader): InviteReader {
  return {
    async findByTokenHash(tokenHash) {
      const doc = await db
        .query("invites")
        .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
        .first();
      return doc === null || doc.deletedAt !== undefined ? null : toInvite(doc);
    },
    async listOpen(farmId) {
      const docs = await db
        .query("invites")
        .withIndex("by_farmId_deletedAt", (q) =>
          q.eq("farmId", idOf(farmId)).eq("deletedAt", undefined),
        )
        .filter((q) =>
          q.and(q.eq(q.field("usedAt"), undefined), q.eq(q.field("revokedAt"), undefined)),
        )
        .collect();
      return docs.map(toInvite);
    },
  };
}

/** The repositories that a query gets. */
export function readers(db: DatabaseReader): Readers {
  return {
    users: userReader(db),
    farms: farmReader(db),
    memberships: membershipReader(db),
    invites: inviteReader(db),
  };
}

/**
 * The repositories that a command gets. The audit log writes through `auditDb`, so that the command
 * builder can tell the writes of the audit log from the writes of the other repositories.
 */
export function repositories(db: DatabaseWriter, auditDb: DatabaseWriter): Repositories {
  const users: UserRepository = {
    ...userReader(db),
    async insert(user) {
      return (await db.insert("users", { ...user, isOperator: false })) as string as UserId;
    },
    async updateUsername(id, username) {
      await db.patch("users", idOf<"users">(id), { username });
    },
    async setOperator(id, isOperator) {
      await db.patch("users", idOf<"users">(id), { isOperator });
    },
  };
  const farms: FarmRepository = {
    ...farmReader(db),
    async insert(farm) {
      return (await db.insert("farms", farm)) as string as FarmId;
    },
  };
  const memberships: MembershipRepository = {
    ...membershipReader(db),
    async insert(membership) {
      return (await db.insert("memberships", {
        farmId: idOf(membership.farmId),
        userId: idOf(membership.userId),
        role: membership.role,
      })) as string as MembershipId;
    },
  };
  const invites: InviteRepository = {
    ...inviteReader(db),
    async insert(invite) {
      return (await db.insert("invites", {
        farmId: idOf(invite.farmId),
        role: invite.role,
        tokenHash: invite.tokenHash,
        expiresAt: invite.expiresAt,
        createdBy: idOf(invite.createdBy),
      })) as string as InviteId;
    },
    async markUsed(id, used) {
      await db.patch("invites", idOf<"invites">(id), { usedAt: used.at, usedBy: idOf(used.by) });
    },
    async markRevoked(id, revokedAt) {
      await db.patch("invites", idOf<"invites">(id), { revokedAt });
    },
  };
  return { users, farms, memberships, invites, audit: auditLog(auditDb) };
}

/**
 * The repositories of a command of one Farm, bound to the Farm after `enterFarm`. No method takes
 * the id of the Farm, so a command cannot reach a record of another Farm.
 */
export function farmRepositories(
  db: DatabaseWriter,
  auditDb: DatabaseWriter,
  farmId: FarmId,
): FarmRepositories {
  return {
    farm: {
      async updateSettings(settings) {
        await db.patch("farms", idOf<"farms">(farmId), settings);
      },
    },
    audit: auditLog(auditDb),
  };
}

function auditLog(db: DatabaseWriter): AuditLog {
  return {
    async append(entry) {
      await db.insert("auditLog", {
        at: entry.at,
        actorId: entry.actorId === null ? null : idOf(entry.actorId),
        farmId: entry.farmId === null ? null : idOf(entry.farmId),
        command: entry.command,
        targetKind: entry.target.kind,
        targetId: entry.target.id,
      });
    },
  };
}

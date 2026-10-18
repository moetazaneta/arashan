import {
  arashanBreedId,
  type AuditEntry,
  type AuditLog,
  type Breed,
  type BreedId,
  breedNameKey,
  type CommandName,
  type Farm,
  type FarmAuditReader,
  type FarmBreedReader,
  type FarmBreedRepository,
  type FarmFlockReader,
  type FarmFlockRepository,
  type FarmId,
  type FarmLocationReader,
  type FarmLocationRepository,
  type FarmReader,
  type FarmReaders,
  type FarmRepositories,
  type FarmRepository,
  type FarmSheepReader,
  type FarmSheepRepository,
  type FileId,
  type FileReader,
  type FileStorage,
  type FarmShepherdReader,
  type FarmShepherdRepository,
  type Flock,
  type FlockFields,
  type FlockId,
  type FlockMove,
  type FlockMoveId,
  type Invite,
  type InviteId,
  type InviteReader,
  type InviteRepository,
  type Location,
  type LocationFields,
  type LocationId,
  type Membership,
  type MembershipId,
  type MembershipReader,
  type MembershipRepository,
  type MemberUserReader,
  nameKey,
  type OwnerChange,
  type OwnerChangeId,
  type PasswordReset,
  type PasswordResetId,
  type PasswordResetRepository,
  type Readers,
  type Repositories,
  type Sheep,
  type SheepFields,
  type SheepId,
  type Shepherd,
  type ShepherdAssignment,
  type ShepherdFields,
  type ShepherdAssignmentId,
  type ShepherdId,
  tagKey,
  type TargetKind,
  type User,
  type UserId,
  type UserReader,
  type UserRepository,
} from "@arashan/core";
import type { StorageReader, StorageWriter, WithoutSystemFields } from "convex/server";

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
    ...(doc.archivedAt !== undefined ? { archivedAt: doc.archivedAt } : {}),
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

function toSheep(doc: Doc<"sheep">): Sheep {
  return {
    id: doc._id as string as SheepId,
    farmId: doc.farmId as string as FarmId,
    tag: doc.tag ?? null,
    name: doc.name ?? null,
    sex: doc.sex,
    birthDate: doc.birthDate ?? null,
    origin: doc.origin,
    initialEntry: doc.initialEntry,
    status: doc.status,
    ownerId: doc.ownerId === undefined ? null : (doc.ownerId as string as MembershipId),
    notes: doc.notes ?? null,
    weight:
      doc.weightKg === undefined || doc.weighedOn === undefined
        ? null
        : { kg: doc.weightKg, date: doc.weighedOn },
    motherId: doc.motherId === undefined ? null : (doc.motherId as string as SheepId),
    fatherId: doc.fatherId === undefined ? null : (doc.fatherId as string as SheepId),
    manualBreeds: (doc.manualBreeds ?? []).map((part) => ({
      breedId: part.breedId as string as BreedId,
      share: part.share,
    })),
    passport:
      doc.passportNumber === undefined || doc.passportIssuedOn === undefined
        ? null
        : {
            number: doc.passportNumber,
            issueDate: doc.passportIssuedOn,
            scanId:
              doc.passportScanId === undefined ? null : (doc.passportScanId as string as FileId),
          },
    grade:
      doc.grade === undefined || doc.gradedOn === undefined
        ? null
        : { grade: doc.grade, date: doc.gradedOn },
    flockId: doc.flockId === undefined ? null : (doc.flockId as string as FlockId),
    registeredAt: doc.registeredAt,
  };
}

/**
 * The columns of a row of `sheep` for the fields of a Sheep. A field that is null in the core is
 * undefined here: an insert leaves it out, and a patch removes it.
 */
function sheepColumns(
  sheep: SheepFields,
): Omit<WithoutSystemFields<Doc<"sheep">>, "farmId" | "deletedAt"> {
  return {
    tag: sheep.tag ?? undefined,
    // An External Sheep gets no key: its Tag never makes a Tag of the Farm taken.
    tagKey: sheep.tag === null || sheep.origin === "external" ? undefined : tagKey(sheep.tag),
    name: sheep.name ?? undefined,
    sex: sheep.sex,
    birthDate: sheep.birthDate ?? undefined,
    origin: sheep.origin,
    initialEntry: sheep.initialEntry,
    status: sheep.status,
    ownerId: sheep.ownerId === null ? undefined : idOf(sheep.ownerId),
    notes: sheep.notes ?? undefined,
    weightKg: sheep.weight?.kg,
    weighedOn: sheep.weight?.date,
    motherId: sheep.motherId === null ? undefined : idOf(sheep.motherId),
    fatherId: sheep.fatherId === null ? undefined : idOf(sheep.fatherId),
    // No parts by hand is no column, as in a row from before the pedigree.
    manualBreeds:
      sheep.manualBreeds.length === 0
        ? undefined
        : sheep.manualBreeds.map((part) => ({
            breedId: part.breedId === arashanBreedId ? "arashan" : idOf<"breeds">(part.breedId),
            share: part.share,
          })),
    passportNumber: sheep.passport?.number,
    passportIssuedOn: sheep.passport?.issueDate,
    passportScanId:
      sheep.passport === null || sheep.passport.scanId === null
        ? undefined
        : (sheep.passport.scanId as string as Id<"_storage">),
    grade: sheep.grade?.grade,
    gradedOn: sheep.grade?.date,
    flockId: sheep.flockId === null ? undefined : idOf(sheep.flockId),
    registeredAt: sheep.registeredAt,
  };
}

function toBreed(doc: Doc<"breeds">): Breed {
  return {
    id: doc._id as string as BreedId,
    farmId: doc.farmId as string as FarmId,
    name: doc.name,
    archivedAt: doc.archivedAt ?? null,
    createdAt: doc.createdAt,
  };
}

// The columns of a row for the fields of a record. A field that is null in the core is undefined
// here: an insert leaves it out, and a patch removes it. The key of a name follows the name.

function locationColumns(location: LocationFields) {
  return {
    name: location.name,
    nameKey: nameKey(location.name),
    notes: location.notes ?? undefined,
    archivedAt: location.archivedAt ?? undefined,
  };
}

function shepherdColumns(shepherd: ShepherdFields) {
  return {
    name: shepherd.name,
    phone: shepherd.phone ?? undefined,
    notes: shepherd.notes ?? undefined,
    archivedAt: shepherd.archivedAt ?? undefined,
  };
}

function flockColumns(flock: FlockFields) {
  return {
    name: flock.name,
    nameKey: nameKey(flock.name),
    locationId: flock.locationId === null ? undefined : idOf<"locations">(flock.locationId),
    archivedAt: flock.archivedAt ?? undefined,
  };
}

function toOwnerChange(doc: Doc<"sheepOwnerChanges">): OwnerChange {
  return {
    id: doc._id as string as OwnerChangeId,
    sheepId: doc.sheepId as string as SheepId,
    previousOwnerId: doc.previousOwnerId as string as MembershipId,
    ownerId: doc.ownerId as string as MembershipId,
    date: doc.date,
    at: doc.at,
  };
}

function toFlockMove(doc: Doc<"sheepFlockMoves">): FlockMove {
  return {
    id: doc._id as string as FlockMoveId,
    sheepId: doc.sheepId as string as SheepId,
    flockId: doc.flockId === undefined ? null : (doc.flockId as string as FlockId),
    date: doc.date,
    at: doc.at,
  };
}

function toLocation(doc: Doc<"locations">): Location {
  return {
    id: doc._id as string as LocationId,
    farmId: doc.farmId as string as FarmId,
    name: doc.name,
    notes: doc.notes ?? null,
    archivedAt: doc.archivedAt ?? null,
  };
}

function toShepherd(doc: Doc<"shepherds">): Shepherd {
  return {
    id: doc._id as string as ShepherdId,
    farmId: doc.farmId as string as FarmId,
    name: doc.name,
    phone: doc.phone ?? null,
    notes: doc.notes ?? null,
    archivedAt: doc.archivedAt ?? null,
  };
}

function toFlock(doc: Doc<"flocks">): Flock {
  return {
    id: doc._id as string as FlockId,
    farmId: doc.farmId as string as FarmId,
    name: doc.name,
    locationId: doc.locationId === undefined ? null : (doc.locationId as string as LocationId),
    archivedAt: doc.archivedAt ?? null,
  };
}

function toAssignment(doc: Doc<"flockAssignments">): ShepherdAssignment {
  return {
    id: doc._id as string as ShepherdAssignmentId,
    flockId: doc.flockId as string as FlockId,
    shepherdId: doc.shepherdId as string as ShepherdId,
    from: doc.from,
    to: doc.to ?? null,
  };
}

function toAuditEntry(doc: Doc<"auditLog">): AuditEntry {
  return {
    at: doc.at,
    actorId: doc.actorId === null ? null : (doc.actorId as string as UserId),
    farmId: doc.farmId === null ? null : (doc.farmId as string as FarmId),
    // Only the core writes the audit log, so each row has a name and a kind of the core.
    command: doc.command as CommandName,
    target: { kind: doc.targetKind as TargetKind, id: doc.targetId },
  };
}

function toPasswordReset(doc: Doc<"passwordResets">): PasswordReset {
  return {
    id: doc._id as string as PasswordResetId,
    farmId: doc.farmId as string as FarmId,
    membershipId: doc.membershipId as string as MembershipId,
    userId: doc.userId as string as UserId,
    actorId: doc.actorId as string as UserId,
    createdAt: doc.createdAt,
    status: doc.status,
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
      return docs.filter((doc) => doc.archivedAt === undefined).map(toMembership);
    },
    async hasMembers(farmId) {
      const doc = await db
        .query("memberships")
        .withIndex("by_farmId_deletedAt", (q) =>
          q.eq("farmId", idOf(farmId)).eq("deletedAt", undefined),
        )
        .filter((q) => q.eq(q.field("archivedAt"), undefined))
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
    async restore(id, role) {
      await db.patch("memberships", idOf<"memberships">(id), { role, archivedAt: undefined });
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
  const passwordResets: PasswordResetRepository = {
    async get(id) {
      const doc = await getActive(db, "passwordResets", id);
      return doc === null ? null : toPasswordReset(doc);
    },
    async listUnfinished(userId) {
      const docs = [];
      for (const status of ["pending", "unknown"] as const) {
        docs.push(
          ...(await db
            .query("passwordResets")
            .withIndex("by_userId_deletedAt_status", (q) =>
              q.eq("userId", idOf(userId)).eq("deletedAt", undefined).eq("status", status),
            )
            .collect()),
        );
      }
      return docs.map(toPasswordReset);
    },
    async finish(id, outcome) {
      await db.patch("passwordResets", idOf<"passwordResets">(id), { status: outcome });
    },
  };
  return { users, farms, memberships, invites, passwordResets, audit: auditLog(auditDb) };
}

/** The Membership of the Farm with the id, Archived or not, or null. */
async function membershipOfFarm(db: DatabaseReader, farmId: FarmId, id: string) {
  const doc = await getActive(db, "memberships", id);
  return doc === null || doc.farmId !== idOf<"farms">(farmId) ? null : doc;
}

function memberUserReader(db: DatabaseReader): MemberUserReader {
  const users = userReader(db);
  return {
    get: (id) => users.get(id),
    async providerUserId(id) {
      return (await getActive(db, "users", id))?.providerUserId ?? null;
    },
    async countFarms(id) {
      const docs = await db
        .query("memberships")
        .withIndex("by_userId_deletedAt_farmId", (q) =>
          q.eq("userId", idOf(id)).eq("deletedAt", undefined),
        )
        .collect();
      return docs.length;
    },
  };
}

/** The Sheep of the Farm with the id, or null. */
async function sheepOfFarm(db: DatabaseReader, farmId: FarmId, id: string) {
  const doc = await getActive(db, "sheep", id);
  return doc === null || doc.farmId !== idOf<"farms">(farmId) ? null : doc;
}

function farmSheepReader(db: DatabaseReader, farmId: FarmId): FarmSheepReader {
  return {
    async get(id) {
      const doc = await sheepOfFarm(db, farmId, id);
      return doc === null ? null : toSheep(doc);
    },
    async list() {
      const docs = await db
        .query("sheep")
        .withIndex("by_farmId_deletedAt_status_ownerId", (q) =>
          q.eq("farmId", idOf(farmId)).eq("deletedAt", undefined),
        )
        .collect();
      return docs.map(toSheep);
    },
    async findByTag(tag) {
      // Only the rows of this key: Convex then sees two registrations of the same Tag at one time
      // as a conflict, and runs the second again, which finds the first.
      const docs = await db
        .query("sheep")
        .withIndex("by_farmId_deletedAt_tagKey", (q) =>
          q.eq("farmId", idOf(farmId)).eq("deletedAt", undefined).eq("tagKey", tagKey(tag)),
        )
        .collect();
      return docs.map(toSheep);
    },
    async children(parentId) {
      const parentDocId = db.normalizeId("sheep", parentId);
      if (parentDocId === null) return [];
      const [asMother, asFather] = await Promise.all([
        db
          .query("sheep")
          .withIndex("by_farmId_deletedAt_motherId", (q) =>
            q.eq("farmId", idOf(farmId)).eq("deletedAt", undefined).eq("motherId", parentDocId),
          )
          .collect(),
        db
          .query("sheep")
          .withIndex("by_farmId_deletedAt_fatherId", (q) =>
            q.eq("farmId", idOf(farmId)).eq("deletedAt", undefined).eq("fatherId", parentDocId),
          )
          .collect(),
      ]);
      // A Sheep cannot be both parents of one child, but a broken row must not give a child twice.
      const docs = new Map([...asMother, ...asFather].map((doc) => [doc._id, doc]));
      return [...docs.values()].sort((a, b) => a._creationTime - b._creationTime).map(toSheep);
    },
    async ownerChanges(sheepId) {
      const sheepDocId = db.normalizeId("sheep", sheepId);
      if (sheepDocId === null) return [];
      // An index gives the rows with the same values in the order of creation: the oldest first.
      const docs = await db
        .query("sheepOwnerChanges")
        .withIndex("by_farmId_deletedAt_sheepId", (q) =>
          q.eq("farmId", idOf(farmId)).eq("deletedAt", undefined).eq("sheepId", sheepDocId),
        )
        .collect();
      return docs.map(toOwnerChange);
    },
    async ownsActiveSheep(ownerId) {
      const doc = await db
        .query("sheep")
        .withIndex("by_farmId_deletedAt_status_ownerId", (q) =>
          q
            .eq("farmId", idOf(farmId))
            .eq("deletedAt", undefined)
            .eq("status", "active")
            .eq("ownerId", idOf(ownerId)),
        )
        .first();
      return doc !== null;
    },
    async listInFlock(flockId) {
      const flockDocId = db.normalizeId("flocks", flockId);
      if (flockDocId === null) return [];
      const docs = await db
        .query("sheep")
        .withIndex("by_farmId_deletedAt_flockId", (q) =>
          q.eq("farmId", idOf(farmId)).eq("deletedAt", undefined).eq("flockId", flockDocId),
        )
        .collect();
      return docs.map(toSheep);
    },
    async flockMoves(sheepId) {
      const sheepDocId = db.normalizeId("sheep", sheepId);
      if (sheepDocId === null) return [];
      // The order of creation, as in `ownerChanges`.
      const docs = await db
        .query("sheepFlockMoves")
        .withIndex("by_farmId_deletedAt_sheepId", (q) =>
          q.eq("farmId", idOf(farmId)).eq("deletedAt", undefined).eq("sheepId", sheepDocId),
        )
        .collect();
      return docs.map(toFlockMove);
    },
  };
}

/** The record of the Farm with the id in the table, or null. */
async function ofFarm<Table extends "locations" | "shepherds" | "flocks" | "flockAssignments">(
  db: DatabaseReader,
  table: Table,
  farmId: FarmId,
  id: string,
): Promise<Doc<Table> | null> {
  const doc = await getActive(db, table, id);
  return doc === null || doc.farmId !== idOf<"farms">(farmId) ? null : doc;
}

function farmLocationReader(db: DatabaseReader, farmId: FarmId): FarmLocationReader {
  return {
    async get(id) {
      const doc = await ofFarm(db, "locations", farmId, id);
      return doc === null ? null : toLocation(doc);
    },
    async list() {
      const docs = await db
        .query("locations")
        .withIndex("by_farmId_deletedAt_nameKey", (q) =>
          q.eq("farmId", idOf(farmId)).eq("deletedAt", undefined),
        )
        .collect();
      return docs.map(toLocation);
    },
    async findByName(name) {
      // Only the rows of this key, as in `findByTag`: two Locations with one name at one time
      // conflict, and Convex runs the second again.
      const docs = await db
        .query("locations")
        .withIndex("by_farmId_deletedAt_nameKey", (q) =>
          q.eq("farmId", idOf(farmId)).eq("deletedAt", undefined).eq("nameKey", nameKey(name)),
        )
        .collect();
      return docs.map(toLocation);
    },
  };
}

function farmShepherdReader(db: DatabaseReader, farmId: FarmId): FarmShepherdReader {
  return {
    async get(id) {
      const doc = await ofFarm(db, "shepherds", farmId, id);
      return doc === null ? null : toShepherd(doc);
    },
    async list() {
      const docs = await db
        .query("shepherds")
        .withIndex("by_farmId_deletedAt", (q) =>
          q.eq("farmId", idOf(farmId)).eq("deletedAt", undefined),
        )
        .collect();
      return docs.map(toShepherd);
    },
  };
}

function farmFlockReader(db: DatabaseReader, farmId: FarmId): FarmFlockReader {
  return {
    async get(id) {
      const doc = await ofFarm(db, "flocks", farmId, id);
      return doc === null ? null : toFlock(doc);
    },
    async list() {
      const docs = await db
        .query("flocks")
        .withIndex("by_farmId_deletedAt_nameKey", (q) =>
          q.eq("farmId", idOf(farmId)).eq("deletedAt", undefined),
        )
        .collect();
      return docs.map(toFlock);
    },
    async findByName(name) {
      const docs = await db
        .query("flocks")
        .withIndex("by_farmId_deletedAt_nameKey", (q) =>
          q.eq("farmId", idOf(farmId)).eq("deletedAt", undefined).eq("nameKey", nameKey(name)),
        )
        .collect();
      return docs.map(toFlock);
    },
    async getAssignment(id) {
      const doc = await ofFarm(db, "flockAssignments", farmId, id);
      return doc === null ? null : toAssignment(doc);
    },
    async listAssignments() {
      const docs = await db
        .query("flockAssignments")
        .withIndex("by_farmId_deletedAt_flockId", (q) =>
          q.eq("farmId", idOf(farmId)).eq("deletedAt", undefined),
        )
        .collect();
      return docs.map(toAssignment);
    },
    async assignmentsOfFlock(flockId) {
      const flockDocId = db.normalizeId("flocks", flockId);
      if (flockDocId === null) return [];
      const docs = await db
        .query("flockAssignments")
        .withIndex("by_farmId_deletedAt_flockId", (q) =>
          q.eq("farmId", idOf(farmId)).eq("deletedAt", undefined).eq("flockId", flockDocId),
        )
        .collect();
      return docs.map(toAssignment);
    },
    async assignmentsOfShepherd(shepherdId) {
      const shepherdDocId = db.normalizeId("shepherds", shepherdId);
      if (shepherdDocId === null) return [];
      const docs = await db
        .query("flockAssignments")
        .withIndex("by_farmId_deletedAt_shepherdId", (q) =>
          q.eq("farmId", idOf(farmId)).eq("deletedAt", undefined).eq("shepherdId", shepherdDocId),
        )
        .collect();
      return docs.map(toAssignment);
    },
  };
}

/** The Breed of the Farm with the id, or null. Arashan has no row, so its id finds nothing. */
async function breedOfFarm(db: DatabaseReader, farmId: FarmId, id: string) {
  if (id === arashanBreedId) return null;
  const doc = await getActive(db, "breeds", id);
  return doc === null || doc.farmId !== idOf<"farms">(farmId) ? null : doc;
}

function farmBreedReader(db: DatabaseReader, farmId: FarmId): FarmBreedReader {
  return {
    async get(id) {
      const doc = await breedOfFarm(db, farmId, id);
      return doc === null ? null : toBreed(doc);
    },
    async list() {
      const docs = await db
        .query("breeds")
        .withIndex("by_farmId_deletedAt_nameKey", (q) =>
          q.eq("farmId", idOf(farmId)).eq("deletedAt", undefined),
        )
        .collect();
      return docs.map(toBreed);
    },
    async findByName(name) {
      // Only the rows of this key, as in `findByTag`: two Breeds with the same name at one time
      // conflict, and the second finds the first.
      const docs = await db
        .query("breeds")
        .withIndex("by_farmId_deletedAt_nameKey", (q) =>
          q.eq("farmId", idOf(farmId)).eq("deletedAt", undefined).eq("nameKey", breedNameKey(name)),
        )
        .collect();
      return docs.map(toBreed);
    },
  };
}

// The file storage of Convex. Its ids are the ids of the system table `_storage`; a string that is
// no such id finds no file.

function fileReader(db: DatabaseReader, storage: StorageReader): FileReader {
  return {
    async url(id) {
      const fileId = db.system.normalizeId("_storage", id);
      return fileId === null ? null : storage.getUrl(fileId);
    },
  };
}

function fileStorage(db: DatabaseReader, storage: StorageWriter): FileStorage {
  return {
    ...fileReader(db, storage),
    uploadUrl: () => storage.generateUploadUrl(),
    async get(id) {
      const fileId = db.system.normalizeId("_storage", id);
      const doc = fileId === null ? null : await db.system.get("_storage", fileId);
      return doc === null ? null : { size: doc.size, contentType: doc.contentType ?? null };
    },
  };
}

function farmAuditReader(db: DatabaseReader, farmId: FarmId): FarmAuditReader {
  return {
    async listForTarget(target) {
      // The oldest first, as in `ownerChanges`.
      const docs = await db
        .query("auditLog")
        .withIndex("by_farmId_targetKind_targetId", (q) =>
          q.eq("farmId", idOf(farmId)).eq("targetKind", target.kind).eq("targetId", target.id),
        )
        .collect();
      return docs.map(toAuditEntry);
    },
  };
}

/**
 * The readers of a query of one Farm, bound to the Farm after `enterFarm`. No method takes the id
 * of the Farm, so a query cannot reach a record of another Farm.
 */
export function farmReaders(
  db: DatabaseReader,
  storage: StorageReader,
  farmId: FarmId,
): FarmReaders {
  return {
    memberships: {
      async list() {
        const docs = await db
          .query("memberships")
          .withIndex("by_farmId_deletedAt", (q) =>
            q.eq("farmId", idOf(farmId)).eq("deletedAt", undefined),
          )
          .collect();
        return docs.map(toMembership);
      },
      async get(id) {
        const doc = await membershipOfFarm(db, farmId, id);
        return doc === null ? null : toMembership(doc);
      },
    },
    users: memberUserReader(db),
    sheep: farmSheepReader(db, farmId),
    breeds: farmBreedReader(db, farmId),
    files: fileReader(db, storage),
    flocks: farmFlockReader(db, farmId),
    locations: farmLocationReader(db, farmId),
    shepherds: farmShepherdReader(db, farmId),
    history: farmAuditReader(db, farmId),
  };
}

/** The repositories of a command of one Farm, bound to the Farm as `farmReaders` are. */
export function farmRepositories(
  db: DatabaseWriter,
  auditDb: DatabaseWriter,
  storage: StorageWriter,
  farmId: FarmId,
): FarmRepositories {
  const readers = farmReaders(db, storage, farmId);
  // A write checks the Farm again, so that it never reaches a record of another Farm.
  const patchMembership = async (id: string, fields: Partial<Doc<"memberships">>) => {
    const doc = await membershipOfFarm(db, farmId, id);
    if (doc !== null) await db.patch("memberships", doc._id, fields);
  };
  const sheep: FarmSheepRepository = {
    ...readers.sheep,
    async insert(fields) {
      return (await db.insert("sheep", {
        farmId: idOf(farmId),
        ...sheepColumns(fields),
      })) as string as SheepId;
    },
    async update(id, fields) {
      const doc = await sheepOfFarm(db, farmId, id);
      if (doc === null) return;
      // The patch writes all the columns again: a field that became null goes away, and the key
      // of the Tag follows the Tag.
      await db.patch("sheep", doc._id, sheepColumns({ ...toSheep(doc), ...fields }));
    },
    async insertOwnerChange(change) {
      return (await db.insert("sheepOwnerChanges", {
        farmId: idOf(farmId),
        sheepId: idOf(change.sheepId),
        previousOwnerId: idOf(change.previousOwnerId),
        ownerId: idOf(change.ownerId),
        date: change.date,
        at: change.at,
      })) as string as OwnerChangeId;
    },
    async insertFlockMove(move) {
      return (await db.insert("sheepFlockMoves", {
        farmId: idOf(farmId),
        sheepId: idOf(move.sheepId),
        flockId: move.flockId === null ? undefined : idOf(move.flockId),
        date: move.date,
        at: move.at,
      })) as string as FlockMoveId;
    },
    async markFlockMoveDeleted(id, deletedAt) {
      const doc = await getActive(db, "sheepFlockMoves", id);
      if (doc !== null && doc.farmId === idOf<"farms">(farmId)) {
        await db.patch("sheepFlockMoves", doc._id, { deletedAt });
      }
    },
    async markDeleted(id, deletedAt) {
      const doc = await sheepOfFarm(db, farmId, id);
      if (doc !== null) await db.patch("sheep", doc._id, { deletedAt });
    },
  };
  const breeds: FarmBreedRepository = {
    ...readers.breeds,
    async insert(breed) {
      return (await db.insert("breeds", {
        farmId: idOf(farmId),
        name: breed.name,
        nameKey: breedNameKey(breed.name),
        archivedAt: breed.archivedAt ?? undefined,
        createdAt: breed.createdAt,
      })) as string as BreedId;
    },
    async update(id, fields) {
      const doc = await breedOfFarm(db, farmId, id);
      if (doc === null) return;
      // The key of the name follows the name, and an `archivedAt` of null takes the Breed out of
      // the archive.
      await db.patch("breeds", doc._id, {
        ...(fields.name === undefined
          ? {}
          : { name: fields.name, nameKey: breedNameKey(fields.name) }),
        ...(fields.archivedAt === undefined ? {} : { archivedAt: fields.archivedAt ?? undefined }),
      });
    },
    async markDeleted(id, deletedAt) {
      const doc = await breedOfFarm(db, farmId, id);
      if (doc !== null) await db.patch("breeds", doc._id, { deletedAt });
    },
  };
  const locations: FarmLocationRepository = {
    ...readers.locations,
    async insert(fields) {
      return (await db.insert("locations", {
        farmId: idOf(farmId),
        ...locationColumns(fields),
      })) as string as LocationId;
    },
    async update(id, fields) {
      const doc = await ofFarm(db, "locations", farmId, id);
      if (doc === null) return;
      await db.patch("locations", doc._id, locationColumns({ ...toLocation(doc), ...fields }));
    },
  };
  const shepherds: FarmShepherdRepository = {
    ...readers.shepherds,
    async insert(fields) {
      return (await db.insert("shepherds", {
        farmId: idOf(farmId),
        ...shepherdColumns(fields),
      })) as string as ShepherdId;
    },
    async update(id, fields) {
      const doc = await ofFarm(db, "shepherds", farmId, id);
      if (doc === null) return;
      await db.patch("shepherds", doc._id, shepherdColumns({ ...toShepherd(doc), ...fields }));
    },
  };
  const flocks: FarmFlockRepository = {
    ...readers.flocks,
    async insert(fields) {
      return (await db.insert("flocks", {
        farmId: idOf(farmId),
        ...flockColumns(fields),
      })) as string as FlockId;
    },
    async update(id, fields) {
      const doc = await ofFarm(db, "flocks", farmId, id);
      if (doc === null) return;
      await db.patch("flocks", doc._id, flockColumns({ ...toFlock(doc), ...fields }));
    },
    async insertAssignment(assignment) {
      return (await db.insert("flockAssignments", {
        farmId: idOf(farmId),
        flockId: idOf(assignment.flockId),
        shepherdId: idOf(assignment.shepherdId),
        from: assignment.from,
        to: assignment.to ?? undefined,
      })) as string as ShepherdAssignmentId;
    },
    async updateAssignment(id, dates) {
      const doc = await ofFarm(db, "flockAssignments", farmId, id);
      if (doc !== null) {
        await db.patch("flockAssignments", doc._id, {
          from: dates.from,
          to: dates.to ?? undefined,
        });
      }
    },
    async markAssignmentDeleted(id, deletedAt) {
      const doc = await ofFarm(db, "flockAssignments", farmId, id);
      if (doc !== null) await db.patch("flockAssignments", doc._id, { deletedAt });
    },
  };
  return {
    ...readers,
    flocks,
    locations,
    shepherds,
    farm: {
      async updateSettings(settings) {
        await db.patch("farms", idOf<"farms">(farmId), settings);
      },
    },
    memberships: {
      ...readers.memberships,
      setRole: (id, role) => patchMembership(id, { role }),
      archive: (id, archivedAt) => patchMembership(id, { archivedAt }),
    },
    invites: {
      async insert(invite) {
        return (await db.insert("invites", {
          farmId: idOf(farmId),
          role: invite.role,
          tokenHash: invite.tokenHash,
          expiresAt: invite.expiresAt,
          createdBy: idOf(invite.createdBy),
        })) as string as InviteId;
      },
    },
    sheep,
    breeds,
    files: fileStorage(db, storage),
    passwordResets: {
      async insert(reset) {
        return (await db.insert("passwordResets", {
          farmId: idOf(farmId),
          membershipId: idOf(reset.membershipId),
          userId: idOf(reset.userId),
          actorId: idOf(reset.actorId),
          createdAt: reset.createdAt,
          status: "pending",
        })) as string as PasswordResetId;
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

import type { AuditEntry } from "../audit/audit";
import { enterFarm } from "../access/session";
import { type Breed, breedNameKey, type FarmBreedRepository } from "../breeds/breed";
import type {
  CommandContext,
  FarmCommandContext,
  FarmReaders,
  FarmRepositories,
  Repositories,
  SystemContext,
} from "../context";
import type { Farm, FarmRepository } from "../farms/farm";
import type { FileStorage, StoredFile } from "../files/files";
import {
  type FarmFlockRepository,
  type FarmLocationRepository,
  type FarmShepherdRepository,
  type Flock,
  type FlockMove,
  type Location,
  nameKey,
  type Shepherd,
  type ShepherdAssignment,
} from "../flocks/flock";
import type {
  BreedId,
  FarmId,
  FileId,
  FlockId,
  FlockMoveId,
  InviteId,
  LocationId,
  MembershipId,
  MoneyCategoryId,
  MoneyRecordId,
  OwnerChangeId,
  PasswordResetId,
  SheepId,
  ShepherdAssignmentId,
  ShepherdId,
  UserId,
} from "../ids";
import type { Invite, InviteRepository, Tokens } from "../members/invite";
import type {
  FarmMoneyCategoryRepository,
  FarmMoneyRecordRepository,
  MoneyCategory,
  MoneyCategorySeedRepository,
  MoneyRecord,
  MoneySource,
} from "../money/money";
import type { Membership, MembershipRepository } from "../members/membership";
import type { PasswordReset, PasswordResetRepository } from "../members/password-reset";
import { type FarmSheepRepository, type OwnerChange, type Sheep, tagKey } from "../sheep/sheep";
import type { Identity, User, UserRepository } from "../users/user";

// The repositories in memory, for the tests of the core. They hide Deleted records, as the real ones
// do. Each test makes a new `InMemoryStore`.

type Stored<T> = T & { deletedAt?: number };

export class InMemoryStore {
  readonly users: Stored<User & { identityKey: string; providerUserId: string }>[] = [];
  readonly farms: Stored<Farm>[] = [];
  readonly memberships: Stored<Membership>[] = [];
  readonly invites: Stored<Invite>[] = [];
  readonly passwordResets: Stored<PasswordReset>[] = [];
  readonly sheep: Stored<Sheep>[] = [];
  readonly ownerChanges: Stored<OwnerChange>[] = [];
  readonly breeds: Stored<Breed>[] = [];
  /** The files of the file storage, by id. */
  readonly files = new Map<FileId, StoredFile>();
  readonly flockMoves: Stored<FlockMove>[] = [];
  readonly locations: Stored<Location>[] = [];
  readonly shepherds: Stored<Shepherd>[] = [];
  readonly flocks: Stored<Flock>[] = [];
  readonly assignments: Stored<ShepherdAssignment & { farmId: FarmId }>[] = [];
  readonly moneyCategories: Stored<MoneyCategory>[] = [];
  readonly moneyRecords: Stored<MoneyRecord>[] = [];
  readonly audit: AuditEntry[] = [];
  private nextId = 1;

  /** The time that `now()` gives. A test moves it forward. */
  time = Date.UTC(2026, 9, 18, 12);

  private id<Kind extends string>(kind: Kind) {
    return `${kind.toLowerCase()}-${this.nextId++}` as string & { readonly __kind: Kind };
  }

  repositories(): Repositories {
    const active = <T>(records: Stored<T>[]) => records.filter((r) => r.deletedAt === undefined);
    const user = ({ id, username, isOperator }: User): User => ({ id, username, isOperator });

    const users: UserRepository = {
      get: async (id) => {
        const found = active(this.users).find((u) => u.id === id);
        return found === undefined ? null : user(found);
      },
      findByIdentity: async (identityKey) => {
        const found = active(this.users).find((u) => u.identityKey === identityKey);
        return found === undefined ? null : user(found);
      },
      findByProviderUserId: async (providerUserId) => {
        const found = active(this.users).find((u) => u.providerUserId === providerUserId);
        return found === undefined ? null : user(found);
      },
      insert: async (record) => {
        const id = this.id("User") as UserId;
        this.users.push({ id, ...record, isOperator: false });
        return id;
      },
      updateUsername: async (id, username) => {
        const found = this.users.find((u) => u.id === id);
        if (found !== undefined) found.username = username;
      },
      setOperator: async (id, isOperator) => {
        const found = this.users.find((u) => u.id === id);
        if (found !== undefined) found.isOperator = isOperator;
      },
    };

    const farms: FarmRepository = {
      get: async (id) => {
        const found = active(this.farms).find((f) => f.id === id);
        return found === undefined ? null : withoutDeletedAt(found);
      },
      list: async () =>
        active(this.farms)
          .map(withoutDeletedAt)
          .sort((a, b) => b.createdAt - a.createdAt),
      insert: async (record) => {
        const id = this.id("Farm") as FarmId;
        this.farms.push({ id, ...record });
        return id;
      },
    };

    const memberships: MembershipRepository = {
      find: async (userId, farmId) => {
        const found = active(this.memberships).find(
          (m) => m.userId === userId && m.farmId === farmId,
        );
        return found === undefined ? null : withoutDeletedAt(found);
      },
      listForUser: async (userId) =>
        active(this.memberships)
          .filter((m) => m.userId === userId && m.archivedAt === undefined)
          .map(withoutDeletedAt),
      hasMembers: async (farmId) =>
        active(this.memberships).some((m) => m.farmId === farmId && m.archivedAt === undefined),
      insert: async (record) => {
        const id = this.id("Membership") as MembershipId;
        this.memberships.push({ id, ...record });
        return id;
      },
      restore: async (id, role) => {
        const found = this.memberships.find((m) => m.id === id);
        if (found !== undefined) {
          found.role = role;
          delete found.archivedAt;
        }
      },
    };

    const invites: InviteRepository = {
      findByTokenHash: async (tokenHash) => {
        const found = active(this.invites).find((i) => i.tokenHash === tokenHash);
        return found === undefined ? null : withoutDeletedAt(found);
      },
      listOpen: async (farmId) =>
        active(this.invites)
          .filter((i) => i.farmId === farmId && i.used === undefined && i.revokedAt === undefined)
          .map(withoutDeletedAt),
      insert: async (record) => {
        const id = this.id("Invite") as InviteId;
        this.invites.push({ id, ...record });
        return id;
      },
      markUsed: async (id, used) => {
        const found = this.invites.find((i) => i.id === id);
        if (found !== undefined) found.used = used;
      },
      markRevoked: async (id, revokedAt) => {
        const found = this.invites.find((i) => i.id === id);
        if (found !== undefined) found.revokedAt = revokedAt;
      },
    };

    const passwordResets: PasswordResetRepository = {
      get: async (id) => {
        const found = active(this.passwordResets).find((r) => r.id === id);
        return found === undefined ? null : withoutDeletedAt(found);
      },
      listUnfinished: async (userId) =>
        active(this.passwordResets)
          .filter((r) => r.userId === userId && (r.status === "pending" || r.status === "unknown"))
          .map(withoutDeletedAt),
      finish: async (id, outcome) => {
        const found = this.passwordResets.find((r) => r.id === id);
        if (found !== undefined) found.status = outcome;
      },
    };

    const moneyCategories: MoneyCategorySeedRepository = {
      keysWithDeleted: async (farmId) =>
        this.moneyCategories.flatMap((c) =>
          c.farmId === farmId && c.key !== null ? [{ kind: c.kind, key: c.key }] : [],
        ),
      insert: async (category) => {
        const id = this.id("MoneyCategory") as MoneyCategoryId;
        this.moneyCategories.push({ id, ...category });
        return id;
      },
    };

    return {
      users,
      farms,
      memberships,
      invites,
      passwordResets,
      moneyCategories,
      audit: { append: async (entry) => void this.audit.push(entry) },
    };
  }

  /** Tokens "token-1", "token-2"…, and a readable hash, so that a test can check what is stored. */
  tokens(): Tokens {
    return {
      newToken: () => `token-${this.nextToken++}`,
      hash: async (token) => `hash(${token})`,
    };
  }
  private nextToken = 1;

  /** The context of a request from this identity, or from nobody. */
  context(identity: Identity | null): CommandContext {
    return { identity, repos: this.repositories(), now: () => this.time, tokens: this.tokens() };
  }

  systemContext(): SystemContext {
    return { system: true, repos: this.repositories(), now: () => this.time };
  }

  /** The readers of one Farm, as the backend binds them to it. */
  farmReaders(farmId: FarmId): FarmReaders {
    const repos = this.repositories();
    const ofFarm = () =>
      this.memberships.filter((m) => m.farmId === farmId && m.deletedAt === undefined);
    return {
      memberships: {
        list: async () => ofFarm().map(withoutDeletedAt),
        get: async (id) => {
          const found = ofFarm().find((m) => m.id === id);
          return found === undefined ? null : withoutDeletedAt(found);
        },
      },
      users: {
        get: (id) => repos.users.get(id),
        providerUserId: async (id) =>
          this.users.find((u) => u.id === id && u.deletedAt === undefined)?.providerUserId ?? null,
        countFarms: async (id) =>
          this.memberships.filter((m) => m.userId === id && m.deletedAt === undefined).length,
      },
      sheep: this.farmSheep(farmId),
      breeds: this.farmBreeds(farmId),
      files: this.fileStorage(),
      flocks: this.farmFlocks(farmId),
      locations: this.farmLocations(farmId),
      shepherds: this.farmShepherds(farmId),
      moneyCategories: this.farmMoneyCategories(farmId),
      moneyRecords: this.farmMoneyRecords(farmId),
      history: {
        listForTarget: async (target) =>
          this.audit.filter(
            (e) =>
              e.farmId === farmId && e.target.kind === target.kind && e.target.id === target.id,
          ),
      },
    };
  }

  /** The Sheep of one Farm, as the backend binds them to it. */
  private farmSheep(farmId: FarmId): FarmSheepRepository {
    const ofFarm = () => this.sheep.filter((s) => s.farmId === farmId && s.deletedAt === undefined);
    return {
      get: async (id) => {
        const found = ofFarm().find((s) => s.id === id);
        return found === undefined ? null : withoutDeletedAt(found);
      },
      list: async () => ofFarm().map(withoutDeletedAt),
      findByTag: async (tag) =>
        ofFarm()
          .filter((s) => s.origin !== "external" && s.tag !== null && tagKey(s.tag) === tagKey(tag))
          .map(withoutDeletedAt),
      children: async (parentId) =>
        ofFarm()
          .filter((s) => s.motherId === parentId || s.fatherId === parentId)
          .map(withoutDeletedAt),
      ownerChanges: async (sheepId) =>
        this.ownerChanges
          .filter((c) => c.sheepId === sheepId && c.deletedAt === undefined)
          .map(withoutDeletedAt),
      ownsActiveSheep: async (ownerId) =>
        ofFarm().some((s) => s.ownerId === ownerId && s.status === "active"),
      listInFlock: async (flockId) =>
        ofFarm()
          .filter((s) => s.flockId === flockId)
          .map(withoutDeletedAt),
      flockMoves: async (sheepId) =>
        this.flockMoves
          .filter((m) => m.sheepId === sheepId && m.deletedAt === undefined)
          .map(withoutDeletedAt),
      insert: async (fields) => {
        const id = this.id("Sheep") as SheepId;
        this.sheep.push({ id, farmId, ...fields });
        return id;
      },
      update: async (id, fields) => {
        const found = ofFarm().find((s) => s.id === id);
        if (found !== undefined) Object.assign(found, fields);
      },
      insertOwnerChange: async (change) => {
        const id = this.id("OwnerChange") as OwnerChangeId;
        this.ownerChanges.push({ id, ...change });
        return id;
      },
      insertFlockMove: async (move) => {
        const id = this.id("FlockMove") as FlockMoveId;
        this.flockMoves.push({ id, ...move });
        return id;
      },
      markFlockMoveDeleted: async (id, deletedAt) => {
        const found = this.flockMoves.find((m) => m.id === id);
        if (found !== undefined) found.deletedAt = deletedAt;
      },
      markDeleted: async (id, deletedAt) => {
        const found = ofFarm().find((s) => s.id === id);
        if (found !== undefined) found.deletedAt = deletedAt;
      },
    };
  }

  /** The Breeds of one Farm, as the backend binds them to it. */
  private farmBreeds(farmId: FarmId): FarmBreedRepository {
    const ofFarm = () =>
      this.breeds.filter((b) => b.farmId === farmId && b.deletedAt === undefined);
    return {
      get: async (id) => {
        const found = ofFarm().find((b) => b.id === id);
        return found === undefined ? null : withoutDeletedAt(found);
      },
      list: async () => ofFarm().map(withoutDeletedAt),
      findByName: async (name) =>
        ofFarm()
          .filter((b) => breedNameKey(b.name) === breedNameKey(name))
          .map(withoutDeletedAt),
      insert: async (fields) => {
        const id = this.id("Breed") as BreedId;
        this.breeds.push({ id, farmId, ...fields });
        return id;
      },
      update: async (id, fields) => {
        const found = ofFarm().find((b) => b.id === id);
        if (found !== undefined) Object.assign(found, fields);
      },
      markDeleted: async (id, deletedAt) => {
        const found = ofFarm().find((b) => b.id === id);
        if (found !== undefined) found.deletedAt = deletedAt;
      },
    };
  }

  /** The file storage: "upload-url-1"…, and a URL of each stored file from its id. */
  private fileStorage(): FileStorage {
    return {
      uploadUrl: async () => `upload-url-${this.nextId++}`,
      get: async (id) => this.files.get(id) ?? null,
      url: async (id) => (this.files.has(id) ? `https://files.test/${id}` : null),
    };
  }

  /** Puts a file into the storage, as an upload does, and gives its id. */
  addFile(file: StoredFile = { size: 200_000, contentType: "application/pdf" }): FileId {
    const id = this.id("File") as FileId;
    this.files.set(id, file);
    return id;
  }

  /** The Locations of one Farm, as the backend binds them to it. */
  private farmLocations(farmId: FarmId): FarmLocationRepository {
    const ofFarm = () =>
      this.locations.filter((l) => l.farmId === farmId && l.deletedAt === undefined);
    return {
      get: async (id) => {
        const found = ofFarm().find((l) => l.id === id);
        return found === undefined ? null : withoutDeletedAt(found);
      },
      list: async () => ofFarm().map(withoutDeletedAt),
      findByName: async (name) =>
        ofFarm()
          .filter((l) => nameKey(l.name) === nameKey(name))
          .map(withoutDeletedAt),
      insert: async (fields) => {
        const id = this.id("Location") as LocationId;
        this.locations.push({ id, farmId, ...fields });
        return id;
      },
      update: async (id, fields) => {
        const found = ofFarm().find((l) => l.id === id);
        if (found !== undefined) Object.assign(found, fields);
      },
    };
  }

  /** The Shepherds of one Farm, as the backend binds them to it. */
  private farmShepherds(farmId: FarmId): FarmShepherdRepository {
    const ofFarm = () =>
      this.shepherds.filter((s) => s.farmId === farmId && s.deletedAt === undefined);
    return {
      get: async (id) => {
        const found = ofFarm().find((s) => s.id === id);
        return found === undefined ? null : withoutDeletedAt(found);
      },
      list: async () => ofFarm().map(withoutDeletedAt),
      insert: async (fields) => {
        const id = this.id("Shepherd") as ShepherdId;
        this.shepherds.push({ id, farmId, ...fields });
        return id;
      },
      update: async (id, fields) => {
        const found = ofFarm().find((s) => s.id === id);
        if (found !== undefined) Object.assign(found, fields);
      },
    };
  }

  /** The Flocks of one Farm and their assignments, as the backend binds them to it. */
  private farmFlocks(farmId: FarmId): FarmFlockRepository {
    const ofFarm = () =>
      this.flocks.filter((f) => f.farmId === farmId && f.deletedAt === undefined);
    const assignments = () =>
      this.assignments.filter((a) => a.farmId === farmId && a.deletedAt === undefined);
    const assignment = ({ id, flockId, shepherdId, from, to }: ShepherdAssignment) => ({
      id,
      flockId,
      shepherdId,
      from,
      to,
    });
    return {
      get: async (id) => {
        const found = ofFarm().find((f) => f.id === id);
        return found === undefined ? null : withoutDeletedAt(found);
      },
      list: async () => ofFarm().map(withoutDeletedAt),
      findByName: async (name) =>
        ofFarm()
          .filter((f) => nameKey(f.name) === nameKey(name))
          .map(withoutDeletedAt),
      getAssignment: async (id) => {
        const found = assignments().find((a) => a.id === id);
        return found === undefined ? null : assignment(found);
      },
      listAssignments: async () => assignments().map(assignment),
      assignmentsOfFlock: async (flockId) =>
        assignments()
          .filter((a) => a.flockId === flockId)
          .map(assignment),
      assignmentsOfShepherd: async (shepherdId) =>
        assignments()
          .filter((a) => a.shepherdId === shepherdId)
          .map(assignment),
      insert: async (fields) => {
        const id = this.id("Flock") as FlockId;
        this.flocks.push({ id, farmId, ...fields });
        return id;
      },
      update: async (id, fields) => {
        const found = ofFarm().find((f) => f.id === id);
        if (found !== undefined) Object.assign(found, fields);
      },
      insertAssignment: async (fields) => {
        const id = this.id("ShepherdAssignment") as ShepherdAssignmentId;
        this.assignments.push({ id, farmId, ...fields });
        return id;
      },
      updateAssignment: async (id, dates) => {
        const found = assignments().find((a) => a.id === id);
        if (found !== undefined) Object.assign(found, dates);
      },
      markAssignmentDeleted: async (id, deletedAt) => {
        const found = assignments().find((a) => a.id === id);
        if (found !== undefined) found.deletedAt = deletedAt;
      },
    };
  }

  /** The categories of Expenses and Incomes of one Farm, as the backend binds them to it. */
  private farmMoneyCategories(farmId: FarmId): FarmMoneyCategoryRepository {
    const ofFarm = () =>
      this.moneyCategories.filter((c) => c.farmId === farmId && c.deletedAt === undefined);
    return {
      get: async (id) => {
        const found = ofFarm().find((c) => c.id === id);
        return found === undefined ? null : withoutDeletedAt(found);
      },
      list: async (kind) =>
        ofFarm()
          .filter((c) => c.kind === kind)
          .map(withoutDeletedAt),
      findByName: async (kind, name) =>
        ofFarm()
          .filter((c) => c.kind === kind && c.name !== null && nameKey(c.name) === nameKey(name))
          .map(withoutDeletedAt),
      findByKey: async (kind, key) => {
        const found = ofFarm().find((c) => c.kind === kind && c.key === key);
        return found === undefined ? null : withoutDeletedAt(found);
      },
      keysWithDeleted: async () =>
        this.moneyCategories.flatMap((c) =>
          c.farmId === farmId && c.key !== null ? [{ kind: c.kind, key: c.key }] : [],
        ),
      insert: async (fields) => {
        const id = this.id("MoneyCategory") as MoneyCategoryId;
        this.moneyCategories.push({ id, farmId, ...fields });
        return id;
      },
      update: async (id, fields) => {
        const found = ofFarm().find((c) => c.id === id);
        if (found !== undefined) Object.assign(found, fields);
      },
      markDeleted: async (id, deletedAt) => {
        const found = ofFarm().find((c) => c.id === id);
        if (found !== undefined) found.deletedAt = deletedAt;
      },
    };
  }

  /** The Expenses and the Incomes of one Farm, as the backend binds them to it. */
  private farmMoneyRecords(farmId: FarmId): FarmMoneyRecordRepository {
    const ofFarm = () =>
      this.moneyRecords.filter((r) => r.farmId === farmId && r.deletedAt === undefined);
    const sameSource = (a: MoneySource | null, b: MoneySource) =>
      a !== null && a.kind === b.kind && a.id === b.id;
    return {
      get: async (id) => {
        const found = ofFarm().find((r) => r.id === id);
        return found === undefined ? null : withoutDeletedAt(found);
      },
      list: async (kind, period) =>
        ofFarm()
          .filter(
            (r) =>
              r.kind === kind &&
              (period.from === null || r.date >= period.from) &&
              (period.to === null || r.date <= period.to),
          )
          .map(withoutDeletedAt),
      usesCategoryWithDeleted: async (categoryId) =>
        this.moneyRecords.some((r) => r.farmId === farmId && r.categoryId === categoryId),
      findBySource: async (source) => {
        const found = ofFarm().find((r) => sameSource(r.source, source));
        return found === undefined ? null : withoutDeletedAt(found);
      },
      anyWithDeleted: async () => this.moneyRecords.some((r) => r.farmId === farmId),
      insert: async (fields) => {
        const id = this.id("MoneyRecord") as MoneyRecordId;
        this.moneyRecords.push({ id, farmId, ...fields });
        return id;
      },
      update: async (id, fields) => {
        const found = ofFarm().find((r) => r.id === id);
        if (found !== undefined) Object.assign(found, fields);
      },
      markDeleted: async (id, deletedAt) => {
        const found = ofFarm().find((r) => r.id === id);
        if (found !== undefined) found.deletedAt = deletedAt;
      },
    };
  }

  /** The repositories of one Farm, as the backend binds them to it. */
  farmRepositories(farmId: FarmId): FarmRepositories {
    const readers = this.farmReaders(farmId);
    const repos = this.repositories();
    const membership = (id: MembershipId) =>
      this.memberships.find((m) => m.id === id && m.farmId === farmId);
    return {
      ...readers,
      farm: {
        updateSettings: async (settings) => {
          const found = this.farms.find((f) => f.id === farmId);
          if (found !== undefined) Object.assign(found, settings);
        },
      },
      memberships: {
        ...readers.memberships,
        setRole: async (id, role) => {
          const found = membership(id);
          if (found !== undefined) found.role = role;
        },
        archive: async (id, archivedAt) => {
          const found = membership(id);
          if (found !== undefined) found.archivedAt = archivedAt;
        },
      },
      invites: { insert: (invite) => repos.invites.insert({ ...invite, farmId }) },
      passwordResets: {
        insert: async (reset) => {
          const id = this.id("PasswordReset") as PasswordResetId;
          this.passwordResets.push({ id, farmId, status: "pending", ...reset });
          return id;
        },
      },
      sheep: this.farmSheep(farmId),
      breeds: this.farmBreeds(farmId),
      files: this.fileStorage(),
      flocks: this.farmFlocks(farmId),
      locations: this.farmLocations(farmId),
      shepherds: this.farmShepherds(farmId),
      moneyCategories: this.farmMoneyCategories(farmId),
      moneyRecords: this.farmMoneyRecords(farmId),
      audit: repos.audit,
    };
  }

  /** The context of a request to one Farm, as the backend makes it after `enterFarm`. */
  async farmContext(ctx: CommandContext, farmId: FarmId): Promise<FarmCommandContext> {
    const { member, farm } = await enterFarm(ctx, farmId);
    return {
      member,
      farm,
      now: () => this.time,
      repos: this.farmRepositories(farmId),
      tokens: ctx.tokens,
    };
  }

  /** Adds a User who logged in before, and gives the context of the User's requests. */
  addUser(username: string, options: { operator?: boolean } = {}): CommandContext {
    const identityKey = `identity|${username}`;
    const providerUserId = `user_${username}`;
    this.users.push({
      id: this.id("User") as UserId,
      identityKey,
      providerUserId,
      username,
      isOperator: options.operator ?? false,
    });
    return this.context({ key: identityKey, providerUserId, username });
  }

  /** Adds a User who is a Member of the Farm with the Role, and gives the context of the User. */
  addMember(username: string, farmId: FarmId, role: Membership["role"]): CommandContext {
    const ctx = this.addUser(username);
    const userId = this.users.at(-1)!.id;
    this.memberships.push({ id: this.id("Membership") as MembershipId, farmId, userId, role });
    return ctx;
  }
}

function withoutDeletedAt<T extends { deletedAt?: number }>(record: T): Omit<T, "deletedAt"> {
  const { deletedAt: _, ...rest } = record;
  return rest;
}

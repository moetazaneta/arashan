import type { AuditEntry } from "../audit/audit";
import { enterFarm } from "../access/session";
import type {
  CommandContext,
  FarmCommandContext,
  FarmReaders,
  FarmRepositories,
  Repositories,
  SystemContext,
} from "../context";
import type { Farm, FarmRepository } from "../farms/farm";
import type {
  FarmId,
  InviteId,
  MembershipId,
  OwnerChangeId,
  PasswordResetId,
  SheepId,
  UserId,
} from "../ids";
import type { Invite, InviteRepository, Tokens } from "../members/invite";
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

    return {
      users,
      farms,
      memberships,
      invites,
      passwordResets,
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
      ownerChanges: async (sheepId) =>
        this.ownerChanges
          .filter((c) => c.sheepId === sheepId && c.deletedAt === undefined)
          .map(withoutDeletedAt),
      ownsActiveSheep: async (ownerId) =>
        ofFarm().some((s) => s.ownerId === ownerId && s.status === "active"),
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
      markDeleted: async (id, deletedAt) => {
        const found = ofFarm().find((s) => s.id === id);
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

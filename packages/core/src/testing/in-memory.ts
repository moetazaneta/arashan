import type { AuditEntry } from "../audit/audit";
import { enterFarm } from "../access/session";
import type { CommandContext, FarmCommandContext, Repositories, SystemContext } from "../context";
import type { Farm, FarmRepository } from "../farms/farm";
import type { FarmId, InviteId, MembershipId, UserId } from "../ids";
import type { Invite, InviteRepository, Tokens } from "../members/invite";
import type { Membership, MembershipRepository } from "../members/membership";
import type { Identity, User, UserRepository } from "../users/user";

// The repositories in memory, for the tests of the core. They hide Deleted records, as the real ones
// do. Each test makes a new `InMemoryStore`.

type Stored<T> = T & { deletedAt?: number };

export class InMemoryStore {
  readonly users: Stored<User & { identityKey: string; providerUserId: string }>[] = [];
  readonly farms: Stored<Farm>[] = [];
  readonly memberships: Stored<Membership>[] = [];
  readonly invites: Stored<Invite>[] = [];
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
      listByUsername: async (username) =>
        active(this.users)
          .filter((u) => u.username === username)
          .map(user),
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
          .filter((m) => m.userId === userId)
          .map(withoutDeletedAt),
      hasMembers: async (farmId) => active(this.memberships).some((m) => m.farmId === farmId),
      insert: async (record) => {
        const id = this.id("Membership") as MembershipId;
        this.memberships.push({ id, ...record });
        return id;
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

    return {
      users,
      farms,
      memberships,
      invites,
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

  /** The context of a request to one Farm, as the backend makes it after `enterFarm`. */
  async farmContext(ctx: CommandContext, farmId: FarmId): Promise<FarmCommandContext> {
    const { member, farm } = await enterFarm(ctx, farmId);
    return {
      member,
      farm,
      now: () => this.time,
      repos: {
        farm: {
          updateSettings: async (settings) => {
            const found = this.farms.find((f) => f.id === farmId);
            if (found !== undefined) Object.assign(found, settings);
          },
        },
        audit: ctx.repos.audit,
      },
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

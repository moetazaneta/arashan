import type * as Client from "@arashan/client";
import type {
  AuditEntry,
  CalendarDate,
  Farm,
  FarmCommandContext,
  FarmId,
  FarmQueryContext,
  FarmRepositories,
  FarmSettings,
  FarmSheepRepository,
  FarmSummary,
  Member,
  MemberSummary,
  Membership,
  MembershipId,
  OwnerChange,
  OwnerChangeId,
  Role,
  Sheep,
  SheepId,
  SheepRegistration,
  SheepUpdate,
  UserId,
  Viewer,
} from "@arashan/core";
import {
  changeSheepOwner,
  deleteSheep,
  DomainError,
  getSheep,
  getSheepHistory,
  inviteLifetimeMs,
  listSheep,
  listSheepOwners,
  registerSheep,
  tagKey,
  updateSheep,
  withLamb,
} from "@arashan/core";
import { createElement, useEffect, useState, useSyncExternalStore } from "react";

// The hooks of @arashan/client for the tests of the web app, which have no backend. A small backend
// in memory stands in: a test sets it up with `signIn` and the other helpers, and `resetFake` clears
// it after each test.

export {
  dateAt,
  defaultLambAgeMonths,
  inviteLifetimeMs,
  maxLambAgeMonths,
  maxPasswordLength,
  maxSheepNameLength,
  maxSheepNotesLength,
  maxTagLength,
  maxWeightKg,
  minLambAgeMonths,
  minPasswordLength,
  sexes,
} from "@arashan/core";

export const fakeAppVersion = "1.2.3";

/** The text of the fake sign-in form, in place of Clerk's. */
export const signInFormText = "[Clerk sign-in form]";

type Preview = { farmName: string; role: Role; expiresAt: number };

/** A Farm in the fake backend, and whether a Member joined it. */
export type FakeFarm = Farm & { hasMembers: boolean };

type CommandName =
  | "createFarm"
  | "inviteFarmAdmin"
  | "updateFarmSettings"
  | "acceptInvite"
  | "inviteMember"
  | "changeMemberRole"
  | "removeMember"
  | "setMemberPassword"
  | "registerSheep"
  | "updateSheep"
  | "changeSheepOwner"
  | "deleteSheep";

interface FakeBackend {
  session: Client.Session;
  farms: FakeFarm[];
  /** Each invite link: what it offers and to which Farm, or the error that it gives. */
  invites: Map<string, { farmId: FarmId; preview: Preview } | DomainError>;
  /** The Members of each Farm, also the removed ones, as an Admin sees them. */
  members: Map<FarmId, MemberSummary[]>;
  /** The passwords that an Admin set, by Membership. */
  passwords: Map<MembershipId, string>;
  /** The Sheep of all Farms, also the Deleted ones. */
  sheep: Sheep[];
  deletedSheep: Set<SheepId>;
  ownerChanges: OwnerChange[];
  audit: AuditEntry[];
  /** A command that fails with a domain error, and changes nothing. */
  failures: Partial<Record<CommandName, DomainError>>;
  tokens: number;
  ids: number;
}

const emptyBackend = (): FakeBackend => ({
  session: { status: "signedOut" },
  farms: [],
  invites: new Map(),
  members: new Map(),
  passwords: new Map(),
  sheep: [],
  deletedSheep: new Set(),
  ownerChanges: [],
  audit: [],
  failures: {},
  tokens: 0,
  ids: 0,
});

let backend = emptyBackend();
let version = 0;
const listeners = new Set<() => void>();

/** Changes the fake backend, and renders the views that read it again. */
export function updateFake(change: (backend: FakeBackend) => void) {
  change(backend);
  version += 1;
  for (const listener of listeners) listener();
}

export function resetFake() {
  backend = emptyBackend();
  version += 1;
}

/** The version of the fake backend: a view that reads it renders again when it changes. */
function useVersion(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
  );
}

function useBackend(): FakeBackend {
  useVersion();
  return backend;
}

let farmCount = 0;

/** A Farm with the default settings, for `signIn` and `addFarm`. */
export function aFarm(name: string, change: Partial<FakeFarm> = {}): FakeFarm {
  farmCount += 1;
  return {
    id: `farm-${farmCount}` as FarmId,
    name,
    currency: "KGS",
    timeZone: "Asia/Bishkek",
    lambAgeMonths: 4,
    createdAt: Date.UTC(2026, 9, 1),
    hasMembers: true,
    ...change,
  };
}

/** Puts Farms into the backend, of which the User is not a Member. */
export function addFarm(...farms: FakeFarm[]) {
  updateFake((backend) => backend.farms.push(...farms));
}

/** A User is logged in, as a Member of the Farms with the Roles. */
export function signIn({
  username = "aibek",
  isOperator = false,
  farms = [],
}: {
  username?: string;
  isOperator?: boolean;
  farms?: [FakeFarm, Role][];
} = {}) {
  updateFake((backend) => {
    backend.farms.push(...farms.map(([farm]) => farm));
    const viewer: Viewer = {
      user: { id: `user-${username}` as UserId, username, isOperator },
      farms: farms
        .map(([farm, role]) => ({ id: farm.id, name: farm.name, role }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
    backend.session = { status: "ready", viewer };
  });
}

/** An invite link to the Farm with the Role, valid for 7 days from now. */
export function addInvite(token: string, farm: FakeFarm, role: Role = "admin") {
  updateFake((backend) => {
    if (!backend.farms.includes(farm)) backend.farms.push(farm);
    const preview = { farmName: farm.name, role, expiresAt: Date.now() + inviteLifetimeMs };
    backend.invites.set(token, { farmId: farm.id, preview });
  });
}

function viewerOf(backend: FakeBackend): Viewer | null {
  return backend.session.status === "ready" ? backend.session.viewer : null;
}

function farmOf(backend: FakeBackend, farmId: FarmId): FakeFarm {
  const farm = backend.farms.find((farm) => farm.id === farmId);
  if (farm === undefined) throw new DomainError("farm.notFound");
  return farm;
}

function newInvite(backend: FakeBackend, farm: FakeFarm, role: Role = "admin") {
  backend.tokens += 1;
  const token = `token-${backend.tokens}`;
  const expiresAt = Date.now() + inviteLifetimeMs;
  backend.invites.set(token, {
    farmId: farm.id,
    preview: { farmName: farm.name, role, expiresAt },
  });
  return { token, expiresAt };
}

/** A Member of a Farm, for `addMembers`. The User of `signIn` with this username is the same User. */
export function aMember(
  username: string,
  role: Role,
  change: Partial<MemberSummary> = {},
): MemberSummary {
  return {
    membershipId: `membership-${username}` as MembershipId,
    userId: `user-${username}` as UserId,
    username,
    role,
    archivedAt: null,
    canSetPassword: true,
    ...change,
  };
}

/** Puts Members into the Farm. */
export function addMembers(farm: FakeFarm, ...members: MemberSummary[]) {
  updateFake((backend) => {
    backend.members.set(farm.id, [...(backend.members.get(farm.id) ?? []), ...members]);
  });
}

/** The Member of the Farm with the id, in the fake backend. */
function memberOf(backend: FakeBackend, farmId: FarmId, membershipId: MembershipId) {
  const member = backend.members.get(farmId)?.find((m) => m.membershipId === membershipId);
  if (member === undefined) throw new DomainError("member.notFound");
  return member;
}

// A query of the fake: the data, or the error, at once.
function query<T>(read: () => T) {
  try {
    return { data: read(), error: null, isPending: false };
  } catch (error) {
    return { data: undefined, error, isPending: false };
  }
}

/**
 * A query that runs a query of the core on the fake backend, as the backend does. Its result comes
 * after a tick, and again after each change of the fake backend.
 */
function useCoreQuery<T>(key: string, read: (backend: FakeBackend) => Promise<T>) {
  const current = useVersion();
  const [result, setResult] = useState<{ key: string; data: T | undefined; error: unknown }>({
    key,
    data: undefined,
    error: null,
  });
  useEffect(() => {
    let live = true;
    // The arguments of the query are in its key: `read` changes only with the key.
    read(backend).then(
      (data) => {
        if (live) setResult({ key, data, error: null });
      },
      (error: unknown) => {
        if (live) setResult({ key, data: undefined, error });
      },
    );
    return () => {
      live = false;
    };
  }, [key, current]);

  // A query of other arguments has no data until its first result, as with TanStack Query.
  const data = result.key === key ? result.data : undefined;
  const error = result.key === key ? result.error : null;
  return { data, error, isPending: data === undefined && error === null };
}

/**
 * A mutation like the one of TanStack Query: `mutate` runs the command of the fake backend after a
 * tick, unless the test made it fail.
 */
function useMutation<Variables, Result>(
  name: CommandName,
  run: (backend: FakeBackend, variables: Variables) => Result | Promise<Result>,
) {
  type State =
    | { status: "idle"; data?: undefined; error: null; variables?: undefined }
    | { status: "pending"; data?: undefined; error: null; variables: Variables }
    | { status: "success"; data: Result; error: null; variables: Variables }
    | { status: "error"; data?: undefined; error: unknown; variables: Variables };
  const [state, setState] = useState<State>({ status: "idle", error: null });

  const mutate = (
    variables: Variables,
    options?: { onSuccess?: (data: Result) => void; onError?: (error: unknown) => void },
  ) => {
    setState({ status: "pending", error: null, variables });
    void (async () => {
      await Promise.resolve();
      try {
        const failure = backend.failures[name];
        if (failure !== undefined) throw failure;
        const data = await run(backend, variables);
        updateFake(() => {});
        setState({ status: "success", data, error: null, variables });
        options?.onSuccess?.(data);
      } catch (error) {
        setState({ status: "error", error, variables });
        options?.onError?.(error);
      }
    })();
  };

  return {
    ...state,
    isIdle: state.status === "idle",
    isPending: state.status === "pending",
    isSuccess: state.status === "success",
    isError: state.status === "error",
    mutate,
    reset: () => setState({ status: "idle", error: null }),
  };
}

export const toDomainError = (error: unknown): DomainError | null =>
  error instanceof DomainError ? error : null;

export const useAppVersion = () => ({ data: fakeAppVersion, error: null });

export const useSession = (): Client.Session => useBackend().session;

export const useSignOut = () => async () => {
  updateFake((backend) => {
    backend.session = { status: "signedOut" };
  });
};

export const SignInForm = () => createElement("p", null, signInFormText);

export const useOperatorFarms = () => {
  const backend = useBackend();
  return query(() => {
    if (viewerOf(backend)?.user.isOperator !== true) throw new DomainError("auth.operatorOnly");
    return backend.farms
      .toSorted((a, b) => b.createdAt - a.createdAt)
      .map(({ id, name, createdAt, hasMembers }): FarmSummary => ({
        id,
        name,
        createdAt,
        hasMembers,
      }));
  });
};

export const useCreateFarm = () =>
  useMutation("createFarm", (backend, input: { name: string } & FarmSettings) => {
    const farm = aFarm(input.name, { ...input, createdAt: Date.now(), hasMembers: false });
    backend.farms.push(farm);
    return { farmId: farm.id, invite: newInvite(backend, farm) };
  });

export const useInviteFarmAdmin = () =>
  useMutation("inviteFarmAdmin", (backend, farmId: FarmId) =>
    newInvite(backend, farmOf(backend, farmId)),
  );

export const useFarm = (farmId: FarmId) => {
  const backend = useBackend();
  return query(() => {
    if (!viewerOf(backend)?.farms.some((farm) => farm.id === farmId)) {
      throw new DomainError("farm.notMember");
    }
    return farmOf(backend, farmId);
  });
};

export const useUpdateFarmSettings = (farmId: FarmId) =>
  useMutation("updateFarmSettings", (backend, settings: FarmSettings) => {
    Object.assign(farmOf(backend, farmId), settings);
  });

export const useInvite = (token: string) => {
  const backend = useBackend();
  return query(() => {
    const invite = backend.invites.get(token);
    if (invite === undefined) throw new DomainError("invite.notFound");
    if (invite instanceof DomainError) throw invite;
    return invite.preview;
  });
};

export const useAcceptInvite = () =>
  useMutation("acceptInvite", (backend, token: string) => {
    const invite = backend.invites.get(token);
    const viewer = viewerOf(backend);
    if (invite === undefined) throw new DomainError("invite.notFound");
    if (invite instanceof DomainError) throw invite;
    if (viewer === null) throw new DomainError("auth.signedOut");
    const farm = farmOf(backend, invite.farmId);
    farm.hasMembers = true;
    const farms = [...viewer.farms, { id: farm.id, name: farm.name, role: invite.preview.role }];
    backend.session = { status: "ready", viewer: { ...viewer, farms } };
    backend.invites.set(token, new DomainError("invite.used"));
    return { farmId: farm.id };
  });

// The Members of a Farm. The fake does not check the rules of the core, such as the last Admin: a
// test makes a command fail with `failures`.

export const useMembers = (farmId: FarmId) => {
  const backend = useBackend();
  return query(() => {
    const farm = viewerOf(backend)?.farms.find((farm) => farm.id === farmId);
    if (farm === undefined) throw new DomainError("farm.notMember");
    if (farm.role !== "admin") throw new DomainError("access.denied");
    return backend.members.get(farmId) ?? [];
  });
};

export const useInviteMember = (farmId: FarmId) =>
  useMutation<void, { token: string; expiresAt: number }>("inviteMember", (backend) =>
    newInvite(backend, farmOf(backend, farmId), "editor"),
  );

export const useChangeMemberRole = (farmId: FarmId) =>
  useMutation("changeMemberRole", (backend, input: { membershipId: MembershipId; role: Role }) => {
    memberOf(backend, farmId, input.membershipId).role = input.role;
  });

export const useRemoveMember = (farmId: FarmId) =>
  useMutation("removeMember", (backend, membershipId: MembershipId) => {
    const member = memberOf(backend, farmId, membershipId);
    member.archivedAt = Date.now();
    member.canSetPassword = false;
  });

export const useSetMemberPassword = (farmId: FarmId) =>
  useMutation(
    "setMemberPassword",
    (backend, input: { membershipId: MembershipId; password: string }) => {
      memberOf(backend, farmId, input.membershipId);
      backend.passwords.set(input.membershipId, input.password);
    },
  );

/** The password that an Admin set for the Member, or undefined. */
export function passwordOf(membershipId: MembershipId): string | undefined {
  return backend.passwords.get(membershipId);
}

// The Sheep registry. The fake runs the commands and queries of the core on Sheep in memory, so the
// rules of the core apply, such as a Tag that another Sheep has. The Members of a Farm come from
// `addMembers`; the User of `signIn` is always a Member of the User's Farms.

/** A Sheep of the Farm, as if a Member registered it now. The defaults make an adult Ram. */
export function addSheep(farm: FakeFarm, change: Partial<Omit<Sheep, "id" | "farmId">> = {}) {
  let id!: SheepId;
  updateFake((backend) => {
    const viewer = viewerOf(backend);
    const ownerId =
      change.ownerId === undefined
        ? (membershipsOf(backend, farm.id).find((m) => m.userId === viewer?.user.id)?.id ?? null)
        : change.ownerId;
    id = nextId(backend, "sheep") as SheepId;
    backend.sheep.push({
      id,
      farmId: farm.id,
      tag: null,
      name: null,
      sex: "ram",
      birthDate: null,
      origin: "born",
      initialEntry: true,
      status: "active",
      notes: null,
      weight: null,
      registeredAt: Date.now(),
      ...change,
      ownerId,
    });
    backend.audit.push({
      at: Date.now(),
      actorId: viewer?.user.id ?? null,
      farmId: farm.id,
      command: "sheep.register",
      target: { kind: "Sheep", id },
    });
  });
  return id;
}

function nextId(backend: FakeBackend, kind: string): string {
  backend.ids += 1;
  return `${kind}-${backend.ids}`;
}

/** The Memberships of the Farm: its Members, and the User of `signIn` if a test added no Member. */
function membershipsOf(backend: FakeBackend, farmId: FarmId): Membership[] {
  const memberships: Membership[] = (backend.members.get(farmId) ?? []).map((member) => ({
    id: member.membershipId,
    farmId,
    userId: member.userId,
    role: member.role,
    ...(member.archivedAt === null ? {} : { archivedAt: member.archivedAt }),
  }));
  const viewer = viewerOf(backend);
  const role = viewer?.farms.find((farm) => farm.id === farmId)?.role;
  if (
    viewer !== null &&
    role !== undefined &&
    !memberships.some((m) => m.userId === viewer.user.id)
  ) {
    const username = viewer.user.username;
    memberships.push({
      id: `membership-${username}` as MembershipId,
      farmId,
      userId: viewer.user.id,
      role,
    });
  }
  return memberships;
}

/** The username of each User of the fake backend, by id. */
function usernames(backend: FakeBackend): Map<UserId, string> {
  const names = new Map<UserId, string>();
  for (const members of backend.members.values()) {
    for (const member of members) names.set(member.userId, member.username);
  }
  const viewer = viewerOf(backend);
  if (viewer !== null) names.set(viewer.user.id, viewer.user.username);
  return names;
}

/** What the backend checks with `enterFarm`: the User is a Member of the Farm. */
function enterFakeFarm(backend: FakeBackend, farmId: FarmId): { member: Member; farm: Farm } {
  const viewer = viewerOf(backend);
  const membership = membershipsOf(backend, farmId).find(
    (m) => m.userId === viewer?.user.id && m.archivedAt === undefined,
  );
  if (viewer === null || membership === undefined) throw new DomainError("farm.notMember");
  const member = {
    membershipId: membership.id,
    userId: viewer.user.id,
    farmId,
    role: membership.role,
  };
  return { member, farm: farmOf(backend, farmId) };
}

function sheepRepository(backend: FakeBackend, farmId: FarmId): FarmSheepRepository {
  const ofFarm = () =>
    backend.sheep.filter((s) => s.farmId === farmId && !backend.deletedSheep.has(s.id));
  const find = (id: SheepId) => ofFarm().find((s) => s.id === id);
  return {
    get: async (id) => {
      const found = find(id);
      return found === undefined ? null : { ...found };
    },
    list: async () => ofFarm().map((s) => ({ ...s })),
    findByTag: async (tag) =>
      ofFarm().filter((s) => s.tag !== null && tagKey(s.tag) === tagKey(tag)),
    ownerChanges: async (sheepId) => backend.ownerChanges.filter((c) => c.sheepId === sheepId),
    ownsActiveSheep: async (ownerId) =>
      ofFarm().some((s) => s.ownerId === ownerId && s.status === "active"),
    insert: async (fields) => {
      const id = nextId(backend, "sheep") as SheepId;
      backend.sheep.push({ id, farmId, ...fields });
      return id;
    },
    update: async (id, fields) => {
      const found = find(id);
      if (found !== undefined) Object.assign(found, fields);
    },
    insertOwnerChange: async (change) => {
      const id = nextId(backend, "owner-change") as OwnerChangeId;
      backend.ownerChanges.push({ id, ...change });
      return id;
    },
    markDeleted: async (id) => {
      backend.deletedSheep.add(id);
    },
  };
}

function farmReaders(backend: FakeBackend, farmId: FarmId): FarmQueryContext["repos"] {
  const memberships = () => membershipsOf(backend, farmId);
  return {
    memberships: {
      list: async () => memberships(),
      get: async (id) => memberships().find((m) => m.id === id) ?? null,
    },
    users: {
      get: async (id) => {
        const username = usernames(backend).get(id);
        return username === undefined ? null : { id, username, isOperator: false };
      },
      providerUserId: async () => null,
      countFarms: async () => 1,
    },
    sheep: sheepRepository(backend, farmId),
    history: {
      listForTarget: async (target) =>
        backend.audit.filter(
          (e) => e.farmId === farmId && e.target.kind === target.kind && e.target.id === target.id,
        ),
    },
  };
}

function queryContext(backend: FakeBackend, farmId: FarmId): FarmQueryContext {
  return { ...enterFakeFarm(backend, farmId), repos: farmReaders(backend, farmId), now: Date.now };
}

function commandContext(backend: FakeBackend, farmId: FarmId): FarmCommandContext {
  const notInFake = () => Promise.reject(new Error("The fake has no such repository."));
  const readers = farmReaders(backend, farmId);
  const repos: FarmRepositories = {
    ...readers,
    farm: { updateSettings: notInFake },
    memberships: { ...readers.memberships, setRole: notInFake, archive: notInFake },
    invites: { insert: notInFake },
    sheep: sheepRepository(backend, farmId),
    audit: {
      append: async (entry) => {
        backend.audit.push(entry);
      },
    },
  };
  return {
    ...enterFakeFarm(backend, farmId),
    repos,
    now: Date.now,
    tokens: { newToken: () => "token", hash: async (token) => token },
  };
}

export const useSheepList = (farmId: FarmId) =>
  useCoreQuery(`list ${farmId}`, async (backend): Promise<Client.SheepListItem[]> => {
    const ctx = queryContext(backend, farmId);
    return withLamb(await listSheep(ctx), ctx.farm, Date.now());
  });

export const useSheep = (farmId: FarmId, sheepId: SheepId) =>
  useCoreQuery(
    `get ${farmId} ${sheepId}`,
    async (backend): Promise<Client.SheepCardData | null> => {
      const ctx = queryContext(backend, farmId);
      const card = await getSheep(ctx, { sheepId });
      return card === null ? null : (withLamb([card], ctx.farm, Date.now())[0] ?? null);
    },
  );

export const useSheepHistory = (farmId: FarmId, sheepId: SheepId) =>
  useCoreQuery(`history ${farmId} ${sheepId}`, (backend) =>
    getSheepHistory(queryContext(backend, farmId), { sheepId }),
  );

export const useSheepOwners = (farmId: FarmId) =>
  useCoreQuery(`owners ${farmId}`, (backend) => listSheepOwners(queryContext(backend, farmId)));

export const useRegisterSheep = (farmId: FarmId) =>
  useMutation("registerSheep", (backend, input: SheepRegistration) =>
    registerSheep(commandContext(backend, farmId), input),
  );

export const useUpdateSheep = (farmId: FarmId) =>
  useMutation("updateSheep", (backend, input: SheepUpdate) =>
    updateSheep(commandContext(backend, farmId), input),
  );

export const useChangeSheepOwner = (farmId: FarmId) =>
  useMutation(
    "changeSheepOwner",
    (backend, input: { sheepId: SheepId; ownerId: MembershipId; date: CalendarDate }) =>
      changeSheepOwner(commandContext(backend, farmId), input),
  );

export const useDeleteSheep = (farmId: FarmId) =>
  useMutation("deleteSheep", (backend, sheepId: SheepId) =>
    deleteSheep(commandContext(backend, farmId), { sheepId }),
  );

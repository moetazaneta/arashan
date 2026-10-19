import type * as Client from "@arashan/client";
import type {
  AssignmentDates,
  AuditEntry,
  Breed,
  BreedId,
  CalendarDate,
  Deal,
  DealId,
  DealKind,
  FarmDealRepository,
  ExitInput,
  ExternalSheepRegistration,
  Farm,
  FarmCommandContext,
  FarmFlockRepository,
  FarmId,
  FarmLambingRepository,
  FarmLocationRepository,
  FarmMoneyCategoryRepository,
  FarmMoneyRecordRepository,
  FarmQueryContext,
  FarmRepositories,
  FarmResourceRepository,
  FarmSettings,
  FarmBreedRepository,
  FarmSheepRepository,
  FarmShepherdRepository,
  FarmSummary,
  FileId,
  FileStorage,
  Flock,
  FlockId,
  FlockInput,
  FlockMove,
  FlockMoveId,
  Lambing,
  LambingId,
  LambingInput,
  Location,
  LocationId,
  LocationInput,
  Member,
  MemberSummary,
  Membership,
  MembershipId,
  MoneyCategory,
  MoneyCategoryId,
  MoneyKind,
  MoneyRecord,
  MoneyRecordFilter,
  MoneyRecordId,
  MoneyRecordInput,
  OwnerChange,
  OwnerChangeId,
  Role,
  Sheep,
  SheepId,
  SheepRegistration,
  SheepUpdate,
  StoredFile,
  Shepherd,
  ShepherdAssignment,
  ShepherdAssignmentId,
  ShepherdId,
  ShepherdInput,
  PurchaseInput,
  SaleInput,
  StatusChange,
  StatusChangeId,
  UserId,
  Viewer,
  Resource,
  ResourceEvent,
  ResourceEventId,
  ResourceId,
  ResourceInput,
  Norms,
  Period,
} from "@arashan/core";
import {
  addBreed as addCoreBreed,
  buySheep,
  cancelDeal,
  changeDealPrice,
  getDeal,
  listDeals,
  sellSheep,
  archiveResource,
  cancelResourceEvent,
  createResource,
  getResource,
  getStockForecast,
  suggestUsage,
  setResourceNorms,
  listResources,
  recordAdjustment,
  recordRestock,
  recordUsage,
  stockOf,
  unarchiveResource,
  updateResource,
  breedNameKey,
  archiveFlock,
  archiveLocation,
  archiveMoneyCategory,
  archiveShepherd,
  assignShepherd,
  changeSheepOwner,
  changeSheepStatus,
  createFlock,
  createLocation,
  createMoneyCategory,
  createMoneyRecord,
  createShepherd,
  dateAt,
  defaultCategoryKeys,
  deleteMoneyCategory,
  deleteMoneyRecord,
  deleteBreed,
  deleteSheep,
  DomainError,
  ensureFarmMoneyCategories,
  getFlock,
  getLambingDefaults,
  getSheep,
  getHeadCountReport,
  getMoneyReport,
  getSheepHistory,
  getSheepPedigree,
  getSheepResponsible,
  inviteLifetimeMs,
  listBreeds,
  listParentOptions,
  listFlocks,
  listLambings,
  listLocations,
  listMoneyCategories,
  listMoneyRecords,
  listSheep,
  listSheepOwners,
  registerExternalSheep,
  listShepherds,
  markSheepFound,
  moneyKinds,
  moveSheep,
  nameKey,
  recordLambing,
  registerSheep,
  renameBreed,
  setBreedArchived,
  removeShepherdAssignment,
  renameMoneyCategory,
  tagKey,
  unarchiveFlock,
  unarchiveLocation,
  unarchiveMoneyCategory,
  unarchiveShepherd,
  undoFlockMove,
  undoSheepStatusChange,
  updateFlock,
  updateLocation,
  updateMoneyRecord,
  updateSheep,
  updateShepherd,
  updateShepherdAssignment,
  withLamb,
} from "@arashan/core";
import { createElement, useEffect, useState, useSyncExternalStore } from "react";

// The hooks of @arashan/client for the tests of the web app, which have no backend. A small backend
// in memory stands in: a test sets it up with `signIn` and the other helpers, and `resetFake` clears
// it after each test.

export {
  arashanBreedId,
  arashanShare,
  compositionOf,
  dateAt,
  dealSheepPreview,
  defaultLambAgeMonths,
  exitStatuses,
  grades,
  inviteLifetimeMs,
  isPureArashan,
  knownParents,
  manualLimit,
  maxBreedNameLength,
  maxCategoryNameLength,
  maxLambAgeMonths,
  maxLambs,
  maxMoneyNotesLength,
  maxPassportNumberLength,
  maxNameLength,
  maxNotesLength,
  maxPasswordLength,
  maxScanBytes,
  maxPhoneLength,
  maxSheepNameLength,
  maxSheepNotesLength,
  maxSheepPerMove,
  maxStillborn,
  maxSheepPerPurchase,
  maxSheepPerSale,
  maxSheepPerStatusChange,
  maxStatusReasonLength,
  maxTagLength,
  maxWeightKg,
  minLambAgeMonths,
  minPasswordLength,
  nameKey,
  pedigreeDepth,
  quantityScale,
  isCalendarDate,
  noNorms,
  normGroups,
  maxQuantity,
  maxReasonLength,
  maxResourceNameLength,
  maxUnitLength,
  scanContentTypes,
  sexes,
  wholeShare,
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
  | "deleteSheep"
  | "changeSheepStatus"
  | "markSheepFound"
  | "undoSheepStatusChange"
  | "registerExternalSheep"
  | "uploadPassportScan"
  | "addBreed"
  | "renameBreed"
  | "setBreedArchived"
  | "deleteBreed"
  | "createFlock"
  | "updateFlock"
  | "archiveFlock"
  | "unarchiveFlock"
  | "assignShepherd"
  | "updateShepherdAssignment"
  | "removeShepherdAssignment"
  | "moveSheep"
  | "undoFlockMove"
  | "createLocation"
  | "updateLocation"
  | "archiveLocation"
  | "unarchiveLocation"
  | "createShepherd"
  | "updateShepherd"
  | "archiveShepherd"
  | "unarchiveShepherd"
  | "ensureMoneyCategories"
  | "createMoneyRecord"
  | "updateMoneyRecord"
  | "deleteMoneyRecord"
  | "createMoneyCategory"
  | "renameMoneyCategory"
  | "archiveMoneyCategory"
  | "unarchiveMoneyCategory"
  | "deleteMoneyCategory"
  | "sellSheep"
  | "buySheep"
  | "changeDealPrice"
  | "cancelDeal"
  | "createResource"
  | "updateResource"
  | "setResourceNorms"
  | "archiveResource"
  | "unarchiveResource"
  | "recordRestock"
  | "recordUsage"
  | "recordAdjustment"
  | "cancelResourceEvent"
  | "recordLambing";

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
  /** The Breeds of all Farms that the Members added, also the Deleted ones. */
  breeds: Breed[];
  deletedBreeds: Set<BreedId>;
  /** The uploaded files, such as the scans of Passports. */
  files: Map<FileId, StoredFile>;
  /** The moves of Sheep between Flocks, also the undone ones. */
  flockMoves: (FlockMove & { deleted?: boolean })[];
  /** The changes of the Status of Sheep, also the undone ones. */
  statusChanges: (StatusChange & { deleted?: boolean })[];
  flocks: Flock[];
  locations: Location[];
  shepherds: Shepherd[];
  /** The assignments of Shepherds to Flocks, also the removed ones. */
  assignments: (ShepherdAssignment & { farmId: FarmId; deleted?: boolean })[];
  lambings: Lambing[];
  /** The categories of Expenses and Incomes, also the Deleted ones. */
  moneyCategories: (MoneyCategory & { deleted?: boolean })[];
  /** The Expenses and the Incomes, also the Deleted ones. */
  moneyRecords: (MoneyRecord & { deleted?: boolean })[];
  /** The Sales and the Purchases, also the cancelled ones. */
  deals: (Deal & { deleted?: boolean })[];
  resources: Resource[];
  /** The events of the Resources, also the cancelled ones. */
  resourceEvents: (ResourceEvent & { farmId: FarmId; deleted?: boolean })[];
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
  breeds: [],
  deletedBreeds: new Set(),
  files: new Map(),
  flockMoves: [],
  statusChanges: [],
  flocks: [],
  locations: [],
  shepherds: [],
  assignments: [],
  lambings: [],
  moneyCategories: [],
  moneyRecords: [],
  deals: [],
  resources: [],
  resourceEvents: [],
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
  uploadGate = null;
  seededFarms.clear();
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

/**
 * A Sheep of the Farm, as if a Member registered it now. The defaults make an adult Ram with no
 * parents. An External Sheep (`origin: "external"`) has no Owner. The fake does not check the rules
 * of the core here, such as the sex of a parent.
 */
export function addSheep(farm: FakeFarm, change: Partial<Omit<Sheep, "id" | "farmId">> = {}) {
  let id!: SheepId;
  updateFake((backend) => {
    const viewer = viewerOf(backend);
    const external = change.origin === "external";
    const ownerId =
      change.ownerId === undefined
        ? external
          ? null
          : (membershipsOf(backend, farm.id).find((m) => m.userId === viewer?.user.id)?.id ?? null)
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
      initialEntry: !external,
      status: "active",
      notes: null,
      weight: null,
      motherId: null,
      fatherId: null,
      manualBreeds: [],
      passport: null,
      grade: null,
      flockId: null,
      registeredAt: Date.now(),
      purchaseId: null,
      ...change,
      ownerId,
    });
    backend.audit.push({
      at: Date.now(),
      actorId: viewer?.user.id ?? null,
      farmId: farm.id,
      command: external ? "sheep.registerExternal" : "sheep.register",
      target: { kind: "Sheep", id },
    });
  });
  return id;
}

/** A Breed that a Member added to the list of the Farm. */
export function addBreed(
  farm: FakeFarm,
  name: string,
  change: Partial<Pick<Breed, "archivedAt">> = {},
) {
  let id!: BreedId;
  updateFake((backend) => {
    id = nextId(backend, "breed") as BreedId;
    backend.breeds.push({
      id,
      farmId: farm.id,
      name,
      archivedAt: null,
      createdAt: Date.now(),
      ...change,
    });
  });
  return id;
}

/** A file in the fake storage, such as the scan of a Passport, and its id. */
export function addFile(file: StoredFile = { size: 1024, contentType: "application/pdf" }) {
  let id!: FileId;
  updateFake((backend) => {
    id = nextId(backend, "file") as FileId;
    backend.files.set(id, file);
  });
  return id;
}

/** The Sheep in the fake backend, also a Deleted one, for a test that checks what a command wrote. */
export function sheepOf(id: SheepId): Sheep | undefined {
  return backend.sheep.find((sheep) => sheep.id === id);
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
      ofFarm().filter(
        (s) => s.origin !== "external" && s.tag !== null && tagKey(s.tag) === tagKey(tag),
      ),
    children: async (parentId) =>
      ofFarm()
        .filter((s) => s.motherId === parentId || s.fatherId === parentId)
        .map((s) => ({ ...s })),
    ownerChanges: async (sheepId) => backend.ownerChanges.filter((c) => c.sheepId === sheepId),
    ownsLostSheep: async (ownerId) =>
      ofFarm().some((s) => s.ownerId === ownerId && s.status === "lost"),
    ownsActiveSheep: async (ownerId) =>
      ofFarm().some((s) => s.ownerId === ownerId && s.status === "active"),
    listInFlock: async (flockId) => ofFarm().filter((s) => s.flockId === flockId),
    flockMoves: async (sheepId) =>
      backend.flockMoves
        .filter((m) => m.sheepId === sheepId && m.deleted !== true)
        .map(({ id, flockId, date, at }) => ({ id, sheepId, flockId, date, at })),
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
    insertFlockMove: async (move) => {
      const id = nextId(backend, "flock-move") as FlockMoveId;
      backend.flockMoves.push({ id, ...move });
      return id;
    },
    markFlockMoveDeleted: async (id) => {
      const found = backend.flockMoves.find((m) => m.id === id);
      if (found !== undefined) found.deleted = true;
    },
    statusChanges: async (sheepId) =>
      backend.statusChanges
        .filter((c) => c.sheepId === sheepId && c.deleted !== true)
        .map(({ id, from, to, date, reason, flockMoveId, saleId, at }) => ({
          id,
          sheepId,
          from,
          to,
          date,
          reason,
          flockMoveId,
          saleId,
          at,
        })),
    insertStatusChange: async (change) => {
      const id = nextId(backend, "status-change") as StatusChangeId;
      backend.statusChanges.push({ id, ...change });
      return id;
    },
    markStatusChangeDeleted: async (id) => {
      const found = backend.statusChanges.find((c) => c.id === id);
      if (found !== undefined) found.deleted = true;
    },
    markDeleted: async (id) => {
      backend.deletedSheep.add(id);
    },
  };
}

function breedRepository(backend: FakeBackend, farmId: FarmId): FarmBreedRepository {
  const ofFarm = () =>
    backend.breeds.filter((b) => b.farmId === farmId && !backend.deletedBreeds.has(b.id));
  const find = (id: BreedId) => ofFarm().find((b) => b.id === id);
  return {
    get: async (id) => {
      const found = find(id);
      return found === undefined ? null : { ...found };
    },
    list: async () => ofFarm().map((b) => ({ ...b })),
    findByName: async (name) => ofFarm().filter((b) => breedNameKey(b.name) === breedNameKey(name)),
    insert: async (fields) => {
      const id = nextId(backend, "breed") as BreedId;
      backend.breeds.push({ id, farmId, ...fields });
      return id;
    },
    update: async (id, fields) => {
      const found = find(id);
      if (found !== undefined) Object.assign(found, fields);
    },
    markDeleted: async (id) => {
      backend.deletedBreeds.add(id);
    },
  };
}

/** The file storage of the fake. A browser would get a file from its URL. */
function fileStorage(backend: FakeBackend): FileStorage {
  return {
    url: async (id) => (backend.files.has(id) ? `https://files.test/${id}` : null),
    uploadUrl: async () => "https://upload.test",
    get: async (id) => backend.files.get(id) ?? null,
  };
}

function locationRepository(backend: FakeBackend, farmId: FarmId): FarmLocationRepository {
  const ofFarm = () => backend.locations.filter((l) => l.farmId === farmId);
  return {
    get: async (id) => ofFarm().find((l) => l.id === id) ?? null,
    list: async () => ofFarm().map((l) => ({ ...l })),
    findByName: async (name) => ofFarm().filter((l) => nameKey(l.name) === nameKey(name)),
    insert: async (fields) => {
      const id = nextId(backend, "location") as LocationId;
      backend.locations.push({ id, farmId, ...fields });
      return id;
    },
    update: async (id, fields) => {
      const found = ofFarm().find((l) => l.id === id);
      if (found !== undefined) Object.assign(found, fields);
    },
  };
}

function shepherdRepository(backend: FakeBackend, farmId: FarmId): FarmShepherdRepository {
  const ofFarm = () => backend.shepherds.filter((s) => s.farmId === farmId);
  return {
    get: async (id) => ofFarm().find((s) => s.id === id) ?? null,
    list: async () => ofFarm().map((s) => ({ ...s })),
    insert: async (fields) => {
      const id = nextId(backend, "shepherd") as ShepherdId;
      backend.shepherds.push({ id, farmId, ...fields });
      return id;
    },
    update: async (id, fields) => {
      const found = ofFarm().find((s) => s.id === id);
      if (found !== undefined) Object.assign(found, fields);
    },
  };
}

function flockRepository(backend: FakeBackend, farmId: FarmId): FarmFlockRepository {
  const ofFarm = () => backend.flocks.filter((f) => f.farmId === farmId);
  const assignments = () =>
    backend.assignments.filter((a) => a.farmId === farmId && a.deleted !== true);
  const assignment = ({ id, flockId, shepherdId, from, to }: ShepherdAssignment) => ({
    id,
    flockId,
    shepherdId,
    from,
    to,
  });
  return {
    get: async (id) => ofFarm().find((f) => f.id === id) ?? null,
    list: async () => ofFarm().map((f) => ({ ...f })),
    findByName: async (name) => ofFarm().filter((f) => nameKey(f.name) === nameKey(name)),
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
      const id = nextId(backend, "flock") as FlockId;
      backend.flocks.push({ id, farmId, ...fields });
      return id;
    },
    update: async (id, fields) => {
      const found = ofFarm().find((f) => f.id === id);
      if (found !== undefined) Object.assign(found, fields);
    },
    insertAssignment: async (fields) => {
      const id = nextId(backend, "assignment") as ShepherdAssignmentId;
      backend.assignments.push({ id, farmId, ...fields });
      return id;
    },
    updateAssignment: async (id, dates) => {
      const found = assignments().find((a) => a.id === id);
      if (found !== undefined) Object.assign(found, dates);
    },
    markAssignmentDeleted: async (id) => {
      const found = assignments().find((a) => a.id === id);
      if (found !== undefined) found.deleted = true;
    },
  };
}

function lambingRepository(backend: FakeBackend, farmId: FarmId): FarmLambingRepository {
  const ofFarm = () => backend.lambings.filter((l) => l.farmId === farmId);
  const copy = (lambing: Lambing): Lambing => ({ ...lambing, lambIds: [...lambing.lambIds] });
  return {
    get: async (id) => {
      const found = ofFarm().find((l) => l.id === id);
      return found === undefined ? null : copy(found);
    },
    listOfMother: async (motherId) =>
      ofFarm()
        .filter((l) => l.motherId === motherId)
        .map(copy),
    insert: async (fields) => {
      const id = nextId(backend, "lambing") as LambingId;
      backend.lambings.push({ id, farmId, ...fields, lambIds: [...fields.lambIds] });
      return id;
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
    breeds: breedRepository(backend, farmId),
    files: fileStorage(backend),
    flocks: flockRepository(backend, farmId),
    locations: locationRepository(backend, farmId),
    shepherds: shepherdRepository(backend, farmId),
    lambings: lambingRepository(backend, farmId),
    moneyCategories: moneyCategoryRepository(backend, farmId),
    moneyRecords: moneyRecordRepository(backend, farmId),
    deals: dealRepository(backend, farmId),
    resources: resourceRepository(backend, farmId),
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
    passwordResets: { insert: notInFake },
    sheep: sheepRepository(backend, farmId),
    breeds: breedRepository(backend, farmId),
    files: fileStorage(backend),
    flocks: flockRepository(backend, farmId),
    locations: locationRepository(backend, farmId),
    shepherds: shepherdRepository(backend, farmId),
    lambings: lambingRepository(backend, farmId),
    moneyCategories: moneyCategoryRepository(backend, farmId),
    moneyRecords: moneyRecordRepository(backend, farmId),
    deals: dealRepository(backend, farmId),
    resources: resourceRepository(backend, farmId),
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
    return withLamb(await listSheep(ctx), ctx.farm, dateAt(Date.now(), ctx.farm.timeZone));
  });

export const useSheep = (farmId: FarmId, sheepId: SheepId) =>
  useCoreQuery(
    `get ${farmId} ${sheepId}`,
    async (backend): Promise<Client.SheepCardData | null> => {
      const ctx = queryContext(backend, farmId);
      const card = await getSheep(ctx, { sheepId });
      const today = dateAt(Date.now(), ctx.farm.timeZone);
      return card === null ? null : (withLamb([card], ctx.farm, today)[0] ?? null);
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

export const useChangeSheepStatus = (farmId: FarmId) =>
  useMutation("changeSheepStatus", (backend, input: ExitInput & { sheepIds: readonly SheepId[] }) =>
    changeSheepStatus(commandContext(backend, farmId), input),
  );

export const useMarkSheepFound = (farmId: FarmId) =>
  useMutation(
    "markSheepFound",
    (backend, input: { sheepId: SheepId; date: CalendarDate; reason: string | null }) =>
      markSheepFound(commandContext(backend, farmId), input),
  );

export const useUndoSheepStatusChange = (farmId: FarmId) =>
  useMutation("undoSheepStatusChange", (backend, sheepId: SheepId) =>
    undoSheepStatusChange(commandContext(backend, farmId), { sheepId }),
  );

export const useParentOptions = (farmId: FarmId) =>
  useCoreQuery(`parents ${farmId}`, (backend) => listParentOptions(queryContext(backend, farmId)));

export const useSheepPedigree = (farmId: FarmId, sheepId: SheepId) =>
  useCoreQuery(`pedigree ${farmId} ${sheepId}`, (backend) =>
    getSheepPedigree(queryContext(backend, farmId), { sheepId }),
  );

export const useRegisterExternalSheep = (farmId: FarmId) =>
  useMutation("registerExternalSheep", (backend, input: ExternalSheepRegistration) =>
    registerExternalSheep(commandContext(backend, farmId), input),
  );

/** The upload of a scan: the fake storage keeps its size and type, and gives its id. */
// An upload of a scan waits for this, if a test holds the uploads (`holdUploads`).
let uploadGate: Promise<void> | null = null;

/** Holds each upload of a scan until the test calls the function that this gives. */
export function holdUploads(): () => void {
  let release = () => {};
  uploadGate = new Promise((resolve) => {
    release = resolve;
  });
  return () => {
    uploadGate = null;
    release();
  };
}

export const useUploadPassportScan = (farmId: FarmId) =>
  useMutation("uploadPassportScan", async (backend, file: File): Promise<FileId> => {
    if (uploadGate !== null) await uploadGate;
    enterFakeFarm(backend, farmId);
    const id = nextId(backend, "file") as FileId;
    backend.files.set(id, { size: file.size, contentType: file.type === "" ? null : file.type });
    return id;
  });

// The Breeds of a Farm, with the commands and queries of the core.

export const useBreeds = (farmId: FarmId) =>
  useCoreQuery(`breeds ${farmId}`, (backend) => listBreeds(queryContext(backend, farmId)));

export const useAddBreed = (farmId: FarmId) =>
  useMutation("addBreed", (backend, input: { name: string }) =>
    addCoreBreed(commandContext(backend, farmId), input),
  );

export const useRenameBreed = (farmId: FarmId) =>
  useMutation("renameBreed", (backend, input: { breedId: BreedId; name: string }) =>
    renameBreed(commandContext(backend, farmId), input),
  );

export const useSetBreedArchived = (farmId: FarmId) =>
  useMutation("setBreedArchived", (backend, input: { breedId: BreedId; archived: boolean }) =>
    setBreedArchived(commandContext(backend, farmId), input),
  );

export const useDeleteBreed = (farmId: FarmId) =>
  useMutation("deleteBreed", (backend, breedId: BreedId) =>
    deleteBreed(commandContext(backend, farmId), { breedId }),
  );

// Flocks, Locations and Shepherds. The fake runs the commands and queries of the core, as for the
// Sheep, so the rules of the core apply. A test puts records in with `addFlock` and the helpers
// below; they write no audit entries.

/** A Location of the Farm. */
export function addLocation(farm: FakeFarm, change: Partial<Omit<Location, "id" | "farmId">> = {}) {
  let id!: LocationId;
  updateFake((backend) => {
    id = nextId(backend, "location") as LocationId;
    backend.locations.push({
      id,
      farmId: farm.id,
      name: "Пастбище",
      notes: null,
      archivedAt: null,
      ...change,
    });
  });
  return id;
}

/** A Shepherd of the Farm. */
export function addShepherd(farm: FakeFarm, change: Partial<Omit<Shepherd, "id" | "farmId">> = {}) {
  let id!: ShepherdId;
  updateFake((backend) => {
    id = nextId(backend, "shepherd") as ShepherdId;
    backend.shepherds.push({
      id,
      farmId: farm.id,
      name: "Асан",
      phone: null,
      notes: null,
      archivedAt: null,
      ...change,
    });
  });
  return id;
}

/** A Flock of the Farm, with no Location unless the test gives one. */
export function addFlock(farm: FakeFarm, change: Partial<Omit<Flock, "id" | "farmId">> = {}) {
  let id!: FlockId;
  updateFake((backend) => {
    id = nextId(backend, "flock") as FlockId;
    backend.flocks.push({
      id,
      farmId: farm.id,
      name: "Стадо",
      locationId: null,
      archivedAt: null,
      ...change,
    });
  });
  return id;
}

/** A Shepherd herds a Flock from a date, and to a date or to now. */
export function addAssignment(
  farm: FakeFarm,
  assignment: {
    flockId: FlockId;
    shepherdId: ShepherdId;
    from: CalendarDate;
    to?: CalendarDate | null;
  },
) {
  let id!: ShepherdAssignmentId;
  updateFake((backend) => {
    id = nextId(backend, "assignment") as ShepherdAssignmentId;
    backend.assignments.push({ id, farmId: farm.id, to: null, ...assignment });
  });
  return id;
}

/** A Sheep went into a Flock (or out of all Flocks) on a date, and is there now. */
export function addFlockMove(sheepId: SheepId, flockId: FlockId | null, date: CalendarDate) {
  updateFake((backend) => {
    const id = nextId(backend, "flock-move") as FlockMoveId;
    backend.flockMoves.push({ id, sheepId, flockId, date, at: Date.now() });
    const sheep = backend.sheep.find((s) => s.id === sheepId);
    if (sheep !== undefined) sheep.flockId = flockId;
  });
}

/** The audit entries of the fake backend, for a test that checks one. */
export function auditEntries(): readonly AuditEntry[] {
  return backend.audit;
}

// Lambings. The fake runs the command and the queries of the core, so its rules apply.

/**
 * A Lambing that a Member recorded before: the Lambs must be Sheep of the Farm already, with the
 * Mother as their parent. The fake does not check the rules of the core here.
 */
export function addLambing(
  farm: FakeFarm,
  lambing: Pick<Lambing, "motherId" | "date" | "lambIds"> &
    Partial<Pick<Lambing, "fatherId" | "stillborn">>,
) {
  let id!: LambingId;
  updateFake((backend) => {
    id = nextId(backend, "lambing") as LambingId;
    backend.lambings.push({
      id,
      farmId: farm.id,
      fatherId: null,
      stillborn: 0,
      recordedAt: Date.now(),
      ...lambing,
    });
  });
  return id;
}

/** The Lambings in the fake backend, for a test that checks what a command wrote. */
export function lambingsOf(farm: FakeFarm): readonly Lambing[] {
  return backend.lambings.filter((lambing) => lambing.farmId === farm.id);
}

export const useLambingDefaults = (
  farmId: FarmId,
  motherId: SheepId | null,
  date: CalendarDate | null,
) =>
  useCoreQuery(`lambing defaults ${farmId} ${motherId} ${date}`, async (backend) =>
    // The query waits while the Mother or the date is not chosen, as `skip` does.
    motherId === null || date === null
      ? new Promise<never>(() => {})
      : getLambingDefaults(queryContext(backend, farmId), { motherId, date }),
  );

export const useLambings = (farmId: FarmId, motherId: SheepId) =>
  useCoreQuery(`lambings ${farmId} ${motherId}`, (backend) =>
    listLambings(queryContext(backend, farmId), { motherId }),
  );

export const useRecordLambing = (farmId: FarmId) =>
  useMutation("recordLambing", (backend, input: LambingInput) =>
    recordLambing(commandContext(backend, farmId), input),
  );

/** The current record of a Sheep, for a test that checks the result of a command. */
export function sheepState(sheepId: SheepId): Readonly<Sheep> | null {
  return backend.sheep.find((sheep) => sheep.id === sheepId) ?? null;
}

export const useFlocks = (farmId: FarmId) =>
  useCoreQuery(`flocks ${farmId}`, (backend) => listFlocks(queryContext(backend, farmId)));

export const useFlock = (farmId: FarmId, flockId: FlockId) =>
  useCoreQuery(`flock ${farmId} ${flockId}`, (backend) =>
    getFlock(queryContext(backend, farmId), { flockId }),
  );

export const useLocations = (farmId: FarmId) =>
  useCoreQuery(`locations ${farmId}`, (backend) => listLocations(queryContext(backend, farmId)));

export const useShepherds = (farmId: FarmId) =>
  useCoreQuery(`shepherds ${farmId}`, (backend) => listShepherds(queryContext(backend, farmId)));

export const useSheepResponsible = (farmId: FarmId, sheepId: SheepId, date: CalendarDate) =>
  useCoreQuery(`responsible ${farmId} ${sheepId} ${date}`, (backend) =>
    getSheepResponsible(queryContext(backend, farmId), { sheepId, date }),
  );

export const useCreateFlock = (farmId: FarmId) =>
  useMutation("createFlock", (backend, input: FlockInput) =>
    createFlock(commandContext(backend, farmId), input),
  );

export const useUpdateFlock = (farmId: FarmId) =>
  useMutation("updateFlock", (backend, input: FlockInput & { flockId: FlockId }) =>
    updateFlock(commandContext(backend, farmId), input),
  );

export const useArchiveFlock = (farmId: FarmId) =>
  useMutation("archiveFlock", (backend, input: { flockId: FlockId; date: CalendarDate }) =>
    archiveFlock(commandContext(backend, farmId), input),
  );

export const useUnarchiveFlock = (farmId: FarmId) =>
  useMutation("unarchiveFlock", (backend, flockId: FlockId) =>
    unarchiveFlock(commandContext(backend, farmId), { flockId }),
  );

export const useAssignShepherd = (farmId: FarmId) =>
  useMutation(
    "assignShepherd",
    (backend, input: AssignmentDates & { flockId: FlockId; shepherdId: ShepherdId }) =>
      assignShepherd(commandContext(backend, farmId), input),
  );

export const useUpdateShepherdAssignment = (farmId: FarmId) =>
  useMutation(
    "updateShepherdAssignment",
    (backend, input: AssignmentDates & { assignmentId: ShepherdAssignmentId }) =>
      updateShepherdAssignment(commandContext(backend, farmId), input),
  );

export const useRemoveShepherdAssignment = (farmId: FarmId) =>
  useMutation("removeShepherdAssignment", (backend, assignmentId: ShepherdAssignmentId) =>
    removeShepherdAssignment(commandContext(backend, farmId), { assignmentId }),
  );

export const useMoveSheep = (farmId: FarmId) =>
  useMutation(
    "moveSheep",
    (
      backend,
      input: { sheepIds: readonly SheepId[]; flockId: FlockId | null; date: CalendarDate },
    ) => moveSheep(commandContext(backend, farmId), input),
  );

export const useUndoFlockMove = (farmId: FarmId) =>
  useMutation("undoFlockMove", (backend, sheepId: SheepId) =>
    undoFlockMove(commandContext(backend, farmId), { sheepId }),
  );

export const useCreateLocation = (farmId: FarmId) =>
  useMutation("createLocation", (backend, input: LocationInput) =>
    createLocation(commandContext(backend, farmId), input),
  );

export const useUpdateLocation = (farmId: FarmId) =>
  useMutation("updateLocation", (backend, input: LocationInput & { locationId: LocationId }) =>
    updateLocation(commandContext(backend, farmId), input),
  );

export const useArchiveLocation = (farmId: FarmId) =>
  useMutation("archiveLocation", (backend, locationId: LocationId) =>
    archiveLocation(commandContext(backend, farmId), { locationId }),
  );

export const useUnarchiveLocation = (farmId: FarmId) =>
  useMutation("unarchiveLocation", (backend, locationId: LocationId) =>
    unarchiveLocation(commandContext(backend, farmId), { locationId }),
  );

export const useCreateShepherd = (farmId: FarmId) =>
  useMutation("createShepherd", (backend, input: ShepherdInput) =>
    createShepherd(commandContext(backend, farmId), input),
  );

export const useUpdateShepherd = (farmId: FarmId) =>
  useMutation("updateShepherd", (backend, input: ShepherdInput & { shepherdId: ShepherdId }) =>
    updateShepherd(commandContext(backend, farmId), input),
  );

export const useArchiveShepherd = (farmId: FarmId) =>
  useMutation("archiveShepherd", (backend, input: { shepherdId: ShepherdId; date: CalendarDate }) =>
    archiveShepherd(commandContext(backend, farmId), input),
  );

export const useUnarchiveShepherd = (farmId: FarmId) =>
  useMutation("unarchiveShepherd", (backend, shepherdId: ShepherdId) =>
    unarchiveShepherd(commandContext(backend, farmId), { shepherdId }),
  );

// Expenses, Incomes and their categories. The fake runs the commands and queries of the core, as
// for the Flocks. A Farm of a test has no categories until the page makes them (the lazy seed), or
// until the test puts them in with `addDefaultMoneyCategories`. The helpers write no audit entries.

function moneyCategoryRepository(
  backend: FakeBackend,
  farmId: FarmId,
): FarmMoneyCategoryRepository {
  const all = () => backend.moneyCategories.filter((c) => c.farmId === farmId);
  const ofFarm = () => all().filter((c) => c.deleted !== true);
  return {
    get: async (id) => ofFarm().find((c) => c.id === id) ?? null,
    list: async (kind) =>
      ofFarm()
        .filter((c) => c.kind === kind)
        .map((c) => ({ ...c })),
    findByName: async (kind, name) =>
      ofFarm().filter(
        (c) => c.kind === kind && c.name !== null && nameKey(c.name) === nameKey(name),
      ),
    findByKey: async (kind, key) => ofFarm().find((c) => c.kind === kind && c.key === key) ?? null,
    keysWithDeleted: async () =>
      all().flatMap((c) => (c.key === null ? [] : [{ kind: c.kind, key: c.key }])),
    insert: async (fields) => {
      const id = nextId(backend, "money-category") as MoneyCategoryId;
      backend.moneyCategories.push({ id, farmId, ...fields });
      return id;
    },
    update: async (id, fields) => {
      const found = ofFarm().find((c) => c.id === id);
      if (found !== undefined) Object.assign(found, fields);
    },
    markDeleted: async (id) => {
      const found = ofFarm().find((c) => c.id === id);
      if (found !== undefined) found.deleted = true;
    },
  };
}

function moneyRecordRepository(backend: FakeBackend, farmId: FarmId): FarmMoneyRecordRepository {
  const all = () => backend.moneyRecords.filter((r) => r.farmId === farmId);
  const ofFarm = () => all().filter((r) => r.deleted !== true);
  return {
    get: async (id) => ofFarm().find((r) => r.id === id) ?? null,
    list: async (kind, period) =>
      ofFarm()
        .filter(
          (r) =>
            r.kind === kind &&
            (period.from === null || r.date >= period.from) &&
            (period.to === null || r.date <= period.to),
        )
        .map((r) => ({ ...r })),
    usesCategoryWithDeleted: async (id) => all().some((r) => r.categoryId === id),
    findBySource: async (source) =>
      ofFarm().find((r) => r.source?.kind === source.kind && r.source.id === source.id) ?? null,
    anyWithDeleted: async () => all().length > 0,
    insert: async (fields) => {
      const id = nextId(backend, "money-record") as MoneyRecordId;
      backend.moneyRecords.push({ id, farmId, ...fields });
      return id;
    },
    update: async (id, fields) => {
      const found = ofFarm().find((r) => r.id === id);
      if (found !== undefined) Object.assign(found, fields);
    },
    markDeleted: async (id) => {
      const found = ofFarm().find((r) => r.id === id);
      if (found !== undefined) found.deleted = true;
    },
  };
}

/** The default categories of the Farm, as a new Farm gets them. */
export function addDefaultMoneyCategories(farm: FakeFarm) {
  updateFake((backend) => {
    for (const kind of moneyKinds) {
      for (const key of defaultCategoryKeys[kind]) {
        const id = nextId(backend, "money-category") as MoneyCategoryId;
        backend.moneyCategories.push({
          id,
          farmId: farm.id,
          kind,
          key,
          name: null,
          archivedAt: null,
        });
      }
    }
  });
}

/** The category of the Farm with the key, or the one with the name. */
export function moneyCategoryOf(
  farm: FakeFarm,
  kind: MoneyKind,
  keyOrName: string,
): MoneyCategoryId {
  const category = backend.moneyCategories.find(
    (c) => c.farmId === farm.id && c.kind === kind && (c.key === keyOrName || c.name === keyOrName),
  );
  if (category === undefined) throw new Error(`The Farm has no category ${keyOrName}.`);
  return category.id;
}

/** A category that a Member made. */
export function addMoneyCategory(
  farm: FakeFarm,
  change: Partial<Omit<MoneyCategory, "id" | "farmId">> = {},
) {
  let id!: MoneyCategoryId;
  updateFake((backend) => {
    id = nextId(backend, "money-category") as MoneyCategoryId;
    backend.moneyCategories.push({
      id,
      farmId: farm.id,
      kind: "expense",
      key: null,
      name: "Транспорт",
      archivedAt: null,
      ...change,
    });
  });
  return id;
}

/** An Expense of the Farm made today, unless the test says otherwise. */
export function addMoneyRecord(
  farm: FakeFarm,
  categoryId: MoneyCategoryId,
  change: Partial<Omit<MoneyRecord, "id" | "farmId" | "categoryId">> = {},
) {
  let id!: MoneyRecordId;
  updateFake((backend) => {
    id = nextId(backend, "money-record") as MoneyRecordId;
    backend.moneyRecords.push({
      id,
      farmId: farm.id,
      categoryId,
      kind: "expense",
      date: dateAt(Date.now(), farm.timeZone),
      amount: 100_00,
      scope: { kind: "farm" },
      shepherdId: null,
      notes: null,
      source: null,
      createdAt: Date.now(),
      ...change,
    });
  });
  return id;
}

/** The Farms whose lazy seed ran: as the client, the fake runs it one time for each Farm. */
const seededFarms = new Set<FarmId>();

/**
 * The categories of the kind. As the hook of the client, it calls the command of the lazy seed when
 * the list is empty, and it is pending until the categories come.
 */
export const useMoneyCategories = (farmId: FarmId, kind: MoneyKind) => {
  const list = useCoreQuery(`money categories ${farmId} ${kind}`, (backend) =>
    listMoneyCategories(queryContext(backend, farmId), { kind }),
  );
  const seed = useMutation<void, number>("ensureMoneyCategories", (backend) =>
    ensureFarmMoneyCategories(commandContext(backend, farmId)),
  );
  const empty = list.data?.length === 0;
  const { isIdle, mutate } = seed;
  useEffect(() => {
    if (!empty || !isIdle || seededFarms.has(farmId)) return;
    seededFarms.add(farmId);
    mutate();
  }, [empty, isIdle, mutate, farmId]);
  const data = empty ? undefined : list.data;
  const error = list.error ?? seed.error;
  return { data, error, isPending: data === undefined && error === null };
};

export const useMoneyRecords = (farmId: FarmId, filter: MoneyRecordFilter) =>
  useCoreQuery(`money records ${farmId} ${JSON.stringify(filter)}`, (backend) =>
    listMoneyRecords(queryContext(backend, farmId), filter),
  );

/** Today in the time zone. The tests do not cross midnight, so it does not change. */
export const useToday = (timeZone: string | undefined) =>
  timeZone === undefined ? undefined : dateAt(Date.now(), timeZone);

export const useHeadCountReport = (farmId: FarmId) =>
  useCoreQuery(`head count ${farmId}`, (backend) => {
    const ctx = queryContext(backend, farmId);
    return getHeadCountReport(ctx, { date: dateAt(Date.now(), ctx.farm.timeZone) });
  });

export const useMoneyReport = (farmId: FarmId, period: Period) =>
  useCoreQuery(`money report ${farmId} ${JSON.stringify(period)}`, (backend) =>
    getMoneyReport(queryContext(backend, farmId), period),
  );

export const useCreateMoneyRecord = (farmId: FarmId) =>
  useMutation("createMoneyRecord", (backend, input: MoneyRecordInput & { kind: MoneyKind }) =>
    createMoneyRecord(commandContext(backend, farmId), input),
  );

export const useUpdateMoneyRecord = (farmId: FarmId) =>
  useMutation(
    "updateMoneyRecord",
    (backend, input: MoneyRecordInput & { recordId: MoneyRecordId }) =>
      updateMoneyRecord(commandContext(backend, farmId), input),
  );

export const useDeleteMoneyRecord = (farmId: FarmId) =>
  useMutation("deleteMoneyRecord", (backend, recordId: MoneyRecordId) =>
    deleteMoneyRecord(commandContext(backend, farmId), { recordId }),
  );

export const useCreateMoneyCategory = (farmId: FarmId) =>
  useMutation("createMoneyCategory", (backend, input: { kind: MoneyKind; name: string }) =>
    createMoneyCategory(commandContext(backend, farmId), input),
  );

export const useRenameMoneyCategory = (farmId: FarmId) =>
  useMutation(
    "renameMoneyCategory",
    (backend, input: { categoryId: MoneyCategoryId; name: string }) =>
      renameMoneyCategory(commandContext(backend, farmId), input),
  );

export const useArchiveMoneyCategory = (farmId: FarmId) =>
  useMutation("archiveMoneyCategory", (backend, categoryId: MoneyCategoryId) =>
    archiveMoneyCategory(commandContext(backend, farmId), { categoryId }),
  );

export const useUnarchiveMoneyCategory = (farmId: FarmId) =>
  useMutation("unarchiveMoneyCategory", (backend, categoryId: MoneyCategoryId) =>
    unarchiveMoneyCategory(commandContext(backend, farmId), { categoryId }),
  );

export const useDeleteMoneyCategory = (farmId: FarmId) =>
  useMutation("deleteMoneyCategory", (backend, categoryId: MoneyCategoryId) =>
    deleteMoneyCategory(commandContext(backend, farmId), { categoryId }),
  );

// The Sales and the Purchases. The fake runs the commands and queries of the core, so a deal makes
// its Automatic record in the money records of the fake.

function dealRepository(backend: FakeBackend, farmId: FarmId): FarmDealRepository {
  const ofFarm = () => backend.deals.filter((d) => d.farmId === farmId && d.deleted !== true);
  const plain = ({ id, kind, date, sheepIds, flockId, createdAt }: Deal): Deal => ({
    id,
    farmId,
    kind,
    date,
    sheepIds: [...sheepIds],
    flockId,
    createdAt,
  });
  return {
    get: async (id) => {
      const found = ofFarm().find((d) => d.id === id);
      return found === undefined ? null : plain(found);
    },
    list: async () => ofFarm().map(plain),
    insert: async (fields) => {
      const id = nextId(backend, "deal") as DealId;
      backend.deals.push({ id, farmId, ...fields, sheepIds: [...fields.sheepIds] });
      return id;
    },
    setSheep: async (id, sheepIds) => {
      const found = ofFarm().find((d) => d.id === id);
      if (found !== undefined) found.sheepIds = [...sheepIds];
    },
    markDeleted: async (id) => {
      const found = ofFarm().find((d) => d.id === id);
      if (found !== undefined) found.deleted = true;
    },
  };
}

/** A Sale of the Sheep, made with the command of the core, as if the signed-in Member made it. */
export async function addSale(farm: FakeFarm, input: SaleInput): Promise<DealId> {
  const dealId = await sellSheep(commandContext(backend, farm.id), input);
  updateFake(() => {});
  return dealId;
}

export const useDeals = (farmId: FarmId, kind: DealKind | null) =>
  useCoreQuery(`deals ${farmId} ${kind}`, (backend) =>
    listDeals(queryContext(backend, farmId), { kind }),
  );

export const useDeal = (farmId: FarmId, dealId: DealId) =>
  useCoreQuery(`deal ${farmId} ${dealId}`, (backend) =>
    getDeal(queryContext(backend, farmId), { dealId }),
  );

export const useSellSheep = (farmId: FarmId) =>
  useMutation("sellSheep", (backend, input: SaleInput) =>
    sellSheep(commandContext(backend, farmId), input),
  );

export const useBuySheep = (farmId: FarmId) =>
  useMutation("buySheep", (backend, input: PurchaseInput) =>
    buySheep(commandContext(backend, farmId), input),
  );

export const useChangeDealPrice = (farmId: FarmId) =>
  useMutation("changeDealPrice", (backend, input: { dealId: DealId; price: number }) =>
    changeDealPrice(commandContext(backend, farmId), input),
  );

export const useCancelDeal = (farmId: FarmId) =>
  useMutation("cancelDeal", (backend, dealId: DealId) =>
    cancelDeal(commandContext(backend, farmId), { dealId }),
  );

// Resources and their events. The fake runs the commands and queries of the core, as for the Flocks.
// The helpers write no audit entries.

function resourceRepository(backend: FakeBackend, farmId: FarmId): FarmResourceRepository {
  const ofFarm = () => backend.resources.filter((r) => r.farmId === farmId);
  const events = () =>
    backend.resourceEvents.filter((e) => e.farmId === farmId && e.deleted !== true);
  const eventOf = (stored: FakeBackend["resourceEvents"][number]): ResourceEvent => ({
    id: stored.id,
    resourceId: stored.resourceId,
    kind: stored.kind,
    date: stored.date,
    quantity: stored.quantity,
    flockId: stored.flockId,
    reason: stored.reason,
    createdAt: stored.createdAt,
  });
  return {
    get: async (id) => ofFarm().find((r) => r.id === id) ?? null,
    list: async () => ofFarm().map((r) => ({ ...r })),
    findByName: async (name) => ofFarm().filter((r) => nameKey(r.name) === nameKey(name)),
    getEvent: async (id) => {
      const found = events().find((e) => e.id === id);
      return found === undefined ? null : eventOf(found);
    },
    events: async (resourceId) =>
      events()
        .filter((e) => e.resourceId === resourceId)
        .map(eventOf),
    insert: async (fields) => {
      const id = nextId(backend, "resource") as ResourceId;
      backend.resources.push({ id, farmId, ...fields });
      return id;
    },
    update: async (id, fields) => {
      const found = ofFarm().find((r) => r.id === id);
      if (found !== undefined) Object.assign(found, fields);
    },
    insertEvent: async (event) => {
      const id = nextId(backend, "resource-event") as ResourceEventId;
      backend.resourceEvents.push({ id, farmId, ...event });
      return id;
    },
    markEventDeleted: async (id) => {
      const found = events().find((e) => e.id === id);
      if (found !== undefined) found.deleted = true;
    },
  };
}

/** Puts a Resource into the Farm: «Сено» in kg with a Stock of 0, or with the changes. */
export function addResource(
  farm: FakeFarm,
  change: Partial<Omit<Resource, "id" | "farmId">> = {},
): Resource {
  let resource: Resource | undefined;
  updateFake((backend) => {
    resource = {
      id: nextId(backend, "resource") as ResourceId,
      farmId: farm.id,
      name: "Сено",
      unit: "кг",
      stock: 0,
      norms: { ram: 0, ewe: 0, lamb: 0 },
      archivedAt: null,
      ...change,
    };
    backend.resources.push(resource);
  });
  return resource!;
}

/** Puts an event of the Resource into the fake backend, and adds it to the Stock. */
export function addResourceEvent(
  resource: Resource,
  event: Pick<ResourceEvent, "kind" | "date" | "quantity"> & Partial<ResourceEvent>,
) {
  updateFake((backend) => {
    backend.resourceEvents.push({
      id: nextId(backend, "resource-event") as ResourceEventId,
      farmId: resource.farmId,
      resourceId: resource.id,
      flockId: null,
      reason: null,
      createdAt: Date.now(),
      ...event,
    });
    const stored = backend.resources.find((r) => r.id === resource.id)!;
    stored.stock = stockOf(
      backend.resourceEvents.filter((e) => e.resourceId === resource.id && e.deleted !== true),
    );
  });
}

/** The Resources of all Farms, as the fake backend keeps them. */
export function fakeResources(): readonly Resource[] {
  return backend.resources;
}

/** The events of the Resources, also the cancelled ones. */
export function fakeResourceEvents(): FakeBackend["resourceEvents"] {
  return backend.resourceEvents;
}

/** The Expenses and the Incomes, also the Deleted ones. */
export function fakeMoneyRecords(): FakeBackend["moneyRecords"] {
  return backend.moneyRecords;
}

export const useResources = (farmId: FarmId) =>
  useCoreQuery(`resources ${farmId}`, (backend) => listResources(queryContext(backend, farmId)));

export const useResource = (farmId: FarmId, resourceId: ResourceId) =>
  useCoreQuery(`resource ${farmId} ${resourceId}`, (backend) =>
    getResource(queryContext(backend, farmId), { resourceId }),
  );

export const useCreateResource = (farmId: FarmId) =>
  useMutation("createResource", (backend, input: ResourceInput) =>
    createResource(commandContext(backend, farmId), input),
  );

export const useUpdateResource = (farmId: FarmId) =>
  useMutation("updateResource", (backend, input: ResourceInput & { resourceId: ResourceId }) =>
    updateResource(commandContext(backend, farmId), input),
  );

export const useArchiveResource = (farmId: FarmId) =>
  useMutation("archiveResource", (backend, resourceId: ResourceId) =>
    archiveResource(commandContext(backend, farmId), { resourceId }),
  );

export const useUnarchiveResource = (farmId: FarmId) =>
  useMutation("unarchiveResource", (backend, resourceId: ResourceId) =>
    unarchiveResource(commandContext(backend, farmId), { resourceId }),
  );

export const useRecordRestock = (farmId: FarmId) =>
  useMutation(
    "recordRestock",
    (
      backend,
      input: { resourceId: ResourceId; date: CalendarDate; quantity: number; price: number | null },
    ) => recordRestock(commandContext(backend, farmId), input),
  );

export const useRecordUsage = (farmId: FarmId) =>
  useMutation(
    "recordUsage",
    (
      backend,
      input: { resourceId: ResourceId; date: CalendarDate; quantity: number; flockId: FlockId },
    ) => recordUsage(commandContext(backend, farmId), input),
  );

export const useRecordAdjustment = (farmId: FarmId) =>
  useMutation(
    "recordAdjustment",
    (
      backend,
      input: { resourceId: ResourceId; date: CalendarDate; counted: number; reason: string },
    ) => recordAdjustment(commandContext(backend, farmId), input),
  );

export const useCancelResourceEvent = (farmId: FarmId) =>
  useMutation("cancelResourceEvent", (backend, eventId: ResourceEventId) =>
    cancelResourceEvent(commandContext(backend, farmId), { eventId }),
  );

export const useUsageSuggestion = (
  farmId: FarmId,
  input: { resourceId: ResourceId; flockId: FlockId; date: CalendarDate } | null,
) =>
  useCoreQuery(`suggest usage ${farmId} ${JSON.stringify(input)}`, (backend) =>
    input === null ? Promise.resolve(null) : suggestUsage(queryContext(backend, farmId), input),
  );

export const useStockForecast = (farmId: FarmId, date: CalendarDate | undefined) =>
  useCoreQuery(`stock forecast ${farmId} ${date}`, (backend) =>
    date === undefined
      ? Promise.resolve(undefined)
      : getStockForecast(queryContext(backend, farmId), { date }),
  );

export const useSetResourceNorms = (farmId: FarmId) =>
  useMutation("setResourceNorms", (backend, input: { resourceId: ResourceId; norms: Norms }) =>
    setResourceNorms(commandContext(backend, farmId), input),
  );

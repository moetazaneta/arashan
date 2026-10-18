import type * as Client from "@arashan/client";
import type { Farm, FarmId, FarmSettings, FarmSummary, Role, UserId, Viewer } from "@arashan/core";
import { DomainError, inviteLifetimeMs } from "@arashan/core";
import { createElement, useState, useSyncExternalStore } from "react";

// The hooks of @arashan/client for the tests of the web app, which have no backend. A small backend
// in memory stands in: a test sets it up with `signIn` and the other helpers, and `resetFake` clears
// it after each test.

export {
  defaultLambAgeMonths,
  inviteLifetimeMs,
  maxLambAgeMonths,
  minLambAgeMonths,
} from "@arashan/core";

export const fakeAppVersion = "1.2.3";

/** The text of the fake sign-in form, in place of Clerk's. */
export const signInFormText = "[Clerk sign-in form]";

type Preview = { farmName: string; role: Role; expiresAt: number };

/** A Farm in the fake backend, and whether a Member joined it. */
export type FakeFarm = Farm & { hasMembers: boolean };

type CommandName = "createFarm" | "inviteFarmAdmin" | "updateFarmSettings" | "acceptInvite";

interface FakeBackend {
  session: Client.Session;
  farms: FakeFarm[];
  /** Each invite link: what it offers and to which Farm, or the error that it gives. */
  invites: Map<string, { farmId: FarmId; preview: Preview } | DomainError>;
  /** A command that fails with a domain error, and changes nothing. */
  failures: Partial<Record<CommandName, DomainError>>;
  tokens: number;
}

const emptyBackend = (): FakeBackend => ({
  session: { status: "signedOut" },
  farms: [],
  invites: new Map(),
  failures: {},
  tokens: 0,
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

function useBackend(): FakeBackend {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
  );
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

function newInvite(backend: FakeBackend, farm: FakeFarm) {
  backend.tokens += 1;
  const token = `token-${backend.tokens}`;
  const expiresAt = Date.now() + inviteLifetimeMs;
  backend.invites.set(token, {
    farmId: farm.id,
    preview: { farmName: farm.name, role: "admin", expiresAt },
  });
  return { token, expiresAt };
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
 * A mutation like the one of TanStack Query: `mutate` runs the command of the fake backend after a
 * tick, unless the test made it fail.
 */
function useMutation<Variables, Result>(
  name: CommandName,
  run: (backend: FakeBackend, variables: Variables) => Result,
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
        let data!: Result;
        updateFake((backend) => {
          data = run(backend, variables);
        });
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

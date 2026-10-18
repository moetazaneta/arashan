import { describe, expect, test } from "vite-plus/test";

import { createFarm } from "../farms/commands";
import { acceptInvite } from "../members/commands";
import { InMemoryStore } from "../testing/in-memory";
import { getViewer, registerUser, setOperator } from "./commands";

const settings = { currency: "KGS", timeZone: "Asia/Bishkek", lambAgeMonths: 4 };

describe("registerUser", () => {
  test("makes the User at the first log-in, and writes an audit entry", async () => {
    const store = new InMemoryStore();
    const ctx = store.context({
      key: "identity|aibek",
      providerUserId: "user_aibek",
      username: "aibek",
    });

    const id = await registerUser(ctx);

    expect(store.users).toEqual([
      {
        id,
        identityKey: "identity|aibek",
        providerUserId: "user_aibek",
        username: "aibek",
        isOperator: false,
      },
    ]);
    expect(store.audit).toEqual([
      {
        at: store.time,
        actorId: id,
        farmId: null,
        command: "user.register",
        target: { kind: "User", id },
      },
    ]);
  });

  test("writes nothing at a later log-in with the same username", async () => {
    const store = new InMemoryStore();
    const ctx = store.context({
      key: "identity|aibek",
      providerUserId: "user_aibek",
      username: "aibek",
    });
    const id = await registerUser(ctx);

    await expect(registerUser(ctx)).resolves.toBe(id);

    expect(store.users).toHaveLength(1);
    expect(store.audit).toHaveLength(1);
  });

  test("takes the new username from the identity provider", async () => {
    const store = new InMemoryStore();
    const id = await registerUser(
      store.context({ key: "identity|1", providerUserId: "user_1", username: "aibek" }),
    );

    await registerUser(
      store.context({ key: "identity|1", providerUserId: "user_1", username: "aibek.t" }),
    );

    expect(store.users).toMatchObject([{ id, username: "aibek.t" }]);
    expect(store.audit.map((entry) => entry.command)).toEqual([
      "user.register",
      "user.updateUsername",
    ]);
  });

  test("rejects a request from nobody, and an identity without a username", async () => {
    const store = new InMemoryStore();

    await expect(registerUser(store.context(null))).rejects.toMatchObject({
      code: "auth.signedOut",
    });
    await expect(
      registerUser(store.context({ key: "identity|1", providerUserId: "user_1", username: null })),
    ).rejects.toMatchObject({ code: "user.usernameMissing" });
    expect(store.users).toEqual([]);
  });
});

describe("setOperator", () => {
  test("gives the flag to the User with the Clerk user id, with an audit entry of the CLI", async () => {
    const store = new InMemoryStore();
    store.addUser("aibek");

    const result = await setOperator(store.systemContext(), {
      providerUserId: " user_aibek ",
      isOperator: true,
    });

    expect(result).toEqual({ userId: store.users[0]?.id, username: "aibek" });
    expect(store.users[0]?.isOperator).toBe(true);
    expect(store.audit).toEqual([
      {
        at: store.time,
        actorId: null,
        farmId: null,
        command: "user.setOperator",
        target: { kind: "User", id: store.users[0]?.id },
      },
    ]);
  });

  test("finds the person by the Clerk user id, also when a stale username points to another", async () => {
    // Alice renamed herself, and Bob took her old username; neither logged in since, so the app
    // still has "alice" for Alice.
    const store = new InMemoryStore();
    store.addUser("alice");
    store.addUser("bob");

    await setOperator(store.systemContext(), { providerUserId: "user_bob", isOperator: true });

    expect(store.users.map(({ username, isOperator }) => ({ username, isOperator }))).toEqual([
      { username: "alice", isOperator: false },
      { username: "bob", isOperator: true },
    ]);
  });

  test("takes the flag away", async () => {
    const store = new InMemoryStore();
    store.addUser("aibek", { operator: true });

    await setOperator(store.systemContext(), { providerUserId: "user_aibek", isOperator: false });

    expect(store.users[0]?.isOperator).toBe(false);
  });

  test("writes nothing if the flag does not change", async () => {
    const store = new InMemoryStore();
    store.addUser("aibek", { operator: true });

    await setOperator(store.systemContext(), { providerUserId: "user_aibek", isOperator: true });

    expect(store.audit).toEqual([]);
  });

  test("rejects a Clerk user id that never logged in", async () => {
    const store = new InMemoryStore();

    await expect(
      setOperator(store.systemContext(), { providerUserId: "user_nobody", isOperator: true }),
    ).rejects.toMatchObject({ code: "user.notFound" });
  });
});

describe("getViewer", () => {
  test("is null for nobody and for a person who has no User yet", async () => {
    const store = new InMemoryStore();

    expect(await getViewer(store.context(null))).toBeNull();
    expect(
      await getViewer(
        store.context({ key: "identity|new", providerUserId: "user_new", username: "new" }),
      ),
    ).toBeNull();
  });

  test("gives the User and no Farms before the first invite", async () => {
    const store = new InMemoryStore();
    const ctx = store.addUser("aibek");

    expect(await getViewer(ctx)).toEqual({
      user: { id: store.users[0]?.id, username: "aibek", isOperator: false },
      farms: [],
    });
  });

  test("gives the Farms of the User by name, with the Role in each", async () => {
    const store = new InMemoryStore();
    const operator = store.addUser("operator", { operator: true });
    const user = store.addUser("aibek");
    for (const name of ["Тюп", "Ак-Суу"]) {
      const { invite } = await createFarm(operator, { name, ...settings });
      await acceptInvite(user, { token: invite.token });
    }
    await createFarm(operator, { name: "Чужая", ...settings });

    const viewer = await getViewer(user);

    expect(viewer?.farms.map(({ name, role }) => ({ name, role }))).toEqual([
      { name: "Ак-Суу", role: "admin" },
      { name: "Тюп", role: "admin" },
    ]);
  });
});

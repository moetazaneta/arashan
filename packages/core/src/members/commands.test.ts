import { describe, expect, test } from "vite-plus/test";

import { createFarm } from "../farms/commands";
import { InMemoryStore } from "../testing/in-memory";
import { acceptInvite, previewInvite } from "./commands";
import { inviteLifetimeMs } from "./invite";

const settings = { currency: "KGS", timeZone: "Asia/Bishkek", lambAgeMonths: 4 };

async function setup() {
  const store = new InMemoryStore();
  const operator = store.addUser("operator", { operator: true });
  const { farmId, invite } = await createFarm(operator, { name: "Арашан", ...settings });
  return { store, operator, farmId, token: invite.token };
}

describe("acceptInvite", () => {
  test("the first invite of a Farm makes the User its Admin", async () => {
    const { store, farmId, token } = await setup();
    const user = store.addUser("aibek");
    const userId = store.users.at(-1)!.id;

    await expect(acceptInvite(user, { token })).resolves.toEqual({ farmId });

    expect(store.memberships).toEqual([{ id: expect.any(String), farmId, userId, role: "admin" }]);
    expect(store.invites[0]?.used).toEqual({ at: store.time, by: userId });
    expect(store.audit.at(-1)).toEqual({
      at: store.time,
      actorId: userId,
      farmId,
      command: "invite.accept",
      target: { kind: "Membership", id: store.memberships[0]?.id },
    });
  });

  test("the link works only once", async () => {
    const { store, token } = await setup();
    await acceptInvite(store.addUser("first"), { token });

    await expect(acceptInvite(store.addUser("second"), { token })).rejects.toMatchObject({
      code: "invite.used",
    });
    expect(store.memberships).toHaveLength(1);
  });

  test("the link works until 7 days after it was made, and not after", async () => {
    const early = await setup();
    early.store.time += inviteLifetimeMs - 1;
    await expect(
      acceptInvite(early.store.addUser("aibek"), { token: early.token }),
    ).resolves.toBeDefined();

    const late = await setup();
    late.store.time += inviteLifetimeMs;
    await expect(
      acceptInvite(late.store.addUser("aibek"), { token: late.token }),
    ).rejects.toMatchObject({ code: "invite.expired" });
    expect(late.store.memberships).toEqual([]);
  });

  test("rejects an unknown token", async () => {
    const { store } = await setup();

    await expect(acceptInvite(store.addUser("aibek"), { token: "made-up" })).rejects.toMatchObject({
      code: "invite.notFound",
    });
  });

  test("rejects a User who is already a Member, and keeps the link for someone else", async () => {
    const { store, farmId, token } = await setup();
    const member = store.addMember("member", farmId, "editor");

    await expect(acceptInvite(member, { token })).rejects.toMatchObject({
      code: "invite.alreadyMember",
    });
    expect(store.invites[0]?.used).toBeUndefined();
  });

  test("the Operator can use the link and become the Admin", async () => {
    const { store, operator, token } = await setup();

    await acceptInvite(operator, { token });

    expect(store.memberships).toMatchObject([{ userId: store.users[0]?.id, role: "admin" }]);
  });

  test("rejects a request from nobody", async () => {
    const { store, token } = await setup();

    await expect(acceptInvite(store.context(null), { token })).rejects.toMatchObject({
      code: "auth.signedOut",
    });
  });
});

describe("previewInvite", () => {
  test("shows the Farm and the Role of a link that works", async () => {
    const { store, token } = await setup();

    expect(await previewInvite(store.addUser("aibek"), { token })).toEqual({
      farmName: "Арашан",
      role: "admin",
      expiresAt: store.time + inviteLifetimeMs,
    });
  });

  test("gives the error that accepting the link would give", async () => {
    const { store, token } = await setup();
    await acceptInvite(store.addUser("first"), { token });

    await expect(previewInvite(store.addUser("second"), { token })).rejects.toMatchObject({
      code: "invite.used",
    });
  });
});

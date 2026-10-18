import { describe, expect, test } from "vite-plus/test";

import { createFarm } from "../farms/commands";
import type { FarmId } from "../ids";
import { acceptInvite } from "../members/commands";
import { InMemoryStore } from "../testing/in-memory";
import { enterFarm, requireOperator, requireUser } from "./session";

const settings = { currency: "KGS", timeZone: "Asia/Bishkek", lambAgeMonths: 4 };

async function setup() {
  const store = new InMemoryStore();
  const operator = store.addUser("operator", { operator: true });
  const { farmId, invite } = await createFarm(operator, { name: "Арашан", ...settings });
  const admin = store.addUser("admin");
  await acceptInvite(admin, { token: invite.token });
  return { store, operator, admin, farmId };
}

describe("requireUser", () => {
  test("rejects a request from nobody", async () => {
    const store = new InMemoryStore();

    await expect(requireUser(store.context(null))).rejects.toMatchObject({
      code: "auth.signedOut",
    });
  });

  test("rejects a person who has no User yet", async () => {
    const store = new InMemoryStore();

    await expect(
      requireUser(
        store.context({ key: "identity|new", providerUserId: "user_new", username: "new" }),
      ),
    ).rejects.toMatchObject({ code: "user.notRegistered" });
  });
});

describe("requireOperator", () => {
  test("rejects a User who is not the Operator", async () => {
    const store = new InMemoryStore();

    await expect(requireOperator(store.addUser("someone"))).rejects.toMatchObject({
      code: "auth.operatorOnly",
    });
  });
});

describe("enterFarm", () => {
  test("gives the Member with the Role of the Membership, and the Farm", async () => {
    const { store, admin, farmId } = await setup();

    expect(await enterFarm(admin, farmId)).toEqual({
      member: {
        membershipId: store.memberships[0]?.id,
        userId: store.users[1]?.id,
        farmId,
        role: "admin",
      },
      farm: { id: farmId, name: "Арашан", ...settings, createdAt: store.time },
    });
  });

  test("rejects a User who is not a Member of the Farm, also the Operator", async () => {
    const { store, operator, farmId } = await setup();

    await expect(enterFarm(operator, farmId)).rejects.toMatchObject({ code: "farm.notMember" });
    await expect(enterFarm(store.addUser("stranger"), farmId)).rejects.toMatchObject({
      code: "farm.notMember",
    });
  });

  test("gives the same error for a Farm that does not exist", async () => {
    const { admin } = await setup();

    await expect(enterFarm(admin, "farm-missing" as FarmId)).rejects.toMatchObject({
      code: "farm.notMember",
    });
  });

  test("rejects a Farm that is Deleted", async () => {
    const { store, admin, farmId } = await setup();
    store.farms[0]!.deletedAt = store.time;

    await expect(enterFarm(admin, farmId)).rejects.toMatchObject({ code: "farm.notMember" });
  });
});

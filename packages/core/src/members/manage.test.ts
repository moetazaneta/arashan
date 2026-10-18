import { describe, expect, test } from "vite-plus/test";

import { enterFarm } from "../access/session";
import type { CommandContext } from "../context";
import { createFarm } from "../farms/commands";
import type { FarmId, MembershipId } from "../ids";
import { deleteSheep, registerSheep } from "../sheep/commands";
import { InMemoryStore } from "../testing/in-memory";
import { getViewer } from "../users/commands";
import { acceptInvite } from "./commands";
import { inviteLifetimeMs } from "./invite";
import {
  changeMemberRole,
  inviteMember,
  listMembers,
  prepareMemberPassword,
  recordMemberPassword,
  removeMember,
} from "./manage";

const settings = { currency: "KGS", timeZone: "Asia/Bishkek", lambAgeMonths: 4 };

/** A Farm with its first Admin "admin", who joined through the Operator's link. */
async function setup() {
  const store = new InMemoryStore();
  const operator = store.addUser("operator", { operator: true });
  const { farmId, invite } = await createFarm(operator, { name: "Арашан", ...settings });
  const admin = store.addUser("admin");
  await acceptInvite(admin, { token: invite.token });
  const userId = (username: string) => store.users.find((u) => u.username === username)!.id;
  const membershipId = (username: string, farm: FarmId = farmId) =>
    store.memberships.find((m) => m.userId === userId(username) && m.farmId === farm)!.id;
  const as = (user: CommandContext) => store.farmContext(user, farmId);
  return { store, operator, admin, farmId, userId, membershipId, as };
}

describe("listMembers", () => {
  test("an Admin sees the Members by username, then the removed ones, the last removed first", async () => {
    const { store, admin, farmId, membershipId, userId, as } = await setup();
    store.addMember("zarina", farmId, "editor");
    store.addMember("bakyt", farmId, "admin");
    store.addMember("early", farmId, "editor");
    store.addMember("late", farmId, "editor");
    const removedEarly = store.time;
    await removeMember(await as(admin), { membershipId: membershipId("early") });
    store.time += 1000;
    await removeMember(await as(admin), { membershipId: membershipId("late") });

    const members = await listMembers(await as(admin));

    expect(members.map((m) => m.username)).toEqual(["admin", "bakyt", "zarina", "late", "early"]);
    expect(members[0]).toEqual({
      membershipId: membershipId("admin"),
      userId: userId("admin"),
      username: "admin",
      role: "admin",
      archivedAt: null,
      canSetPassword: false,
    });
    expect(members.slice(1, 3)).toMatchObject([{ role: "admin" }, { role: "editor" }]);
    expect(members.slice(3).map((m) => m.archivedAt)).toEqual([store.time, removedEarly]);
  });

  test("an Admin can set the password of a Member who is in this Farm only, not of others", async () => {
    const { store, admin, farmId, userId, as } = await setup();
    store.addMember("editor", farmId, "editor");
    store.addMember("other-admin", farmId, "admin");
    store.addMember("removed", farmId, "editor");
    store.addMember("two-farms", farmId, "editor");
    const other = await createFarm(store.addUser("operator2", { operator: true }), {
      name: "Другая",
      ...settings,
    });
    store.memberships.push({
      id: "membership-other" as MembershipId,
      farmId: other.farmId,
      userId: userId("two-farms"),
      role: "editor",
    });
    store.memberships.push({
      id: "membership-operator" as MembershipId,
      farmId,
      userId: userId("operator"),
      role: "editor",
    });
    await removeMember(await as(admin), {
      membershipId: store.memberships.find((m) => m.userId === userId("removed"))!.id,
    });

    const members = await listMembers(await as(admin));

    expect(Object.fromEntries(members.map((m) => [m.username, m.canSetPassword]))).toEqual({
      admin: false,
      editor: true,
      "other-admin": true,
      operator: false,
      "two-farms": false,
      removed: false,
    });
  });

  test("an Editor cannot see the list", async () => {
    const { store, farmId } = await setup();
    const editor = store.addMember("editor", farmId, "editor");

    await expect(listMembers(await store.farmContext(editor, farmId))).rejects.toMatchObject({
      code: "access.denied",
    });
  });
});

describe("inviteMember", () => {
  test("an Admin makes a 7-day link for a new Editor, with an audit entry", async () => {
    const { store, admin, farmId, userId, as } = await setup();

    const invite = await inviteMember(await as(admin));

    expect(invite).toEqual({ token: "token-2", expiresAt: store.time + inviteLifetimeMs });
    const stored = store.invites.at(-1)!;
    expect(stored).toEqual({
      id: expect.any(String),
      farmId,
      role: "editor",
      tokenHash: "hash(token-2)",
      expiresAt: invite.expiresAt,
      createdBy: userId("admin"),
    });
    expect(store.audit.at(-1)).toEqual({
      at: store.time,
      actorId: userId("admin"),
      farmId,
      command: "member.invite",
      target: { kind: "Invite", id: stored.id },
    });
  });

  test("a new link does not stop the older ones, and each makes a new User an Editor", async () => {
    const { store, admin, farmId, as } = await setup();
    const first = await inviteMember(await as(admin));
    const second = await inviteMember(await as(admin));

    await expect(acceptInvite(store.addUser("aibek"), first)).resolves.toEqual({ farmId });
    await expect(acceptInvite(store.addUser("zarina"), second)).resolves.toEqual({ farmId });

    const members = await listMembers(await as(admin));
    expect(members.map((m) => [m.username, m.role])).toEqual([
      ["admin", "admin"],
      ["aibek", "editor"],
      ["zarina", "editor"],
    ]);
  });

  test("an Editor cannot make a link", async () => {
    const { store, farmId } = await setup();
    const editor = store.addMember("editor", farmId, "editor");
    const invites = store.invites.length;

    await expect(inviteMember(await store.farmContext(editor, farmId))).rejects.toMatchObject({
      code: "access.denied",
    });
    expect(store.invites).toHaveLength(invites);
  });
});

describe("changeMemberRole", () => {
  test("an Admin makes an Editor an Admin, with an audit entry", async () => {
    const { store, admin, farmId, membershipId, userId, as } = await setup();
    const editor = store.addMember("editor", farmId, "editor");

    await changeMemberRole(await as(admin), {
      membershipId: membershipId("editor"),
      role: "admin",
    });

    expect((await enterFarm(editor, farmId)).member.role).toBe("admin");
    expect(store.audit.at(-1)).toEqual({
      at: store.time,
      actorId: userId("admin"),
      farmId,
      command: "member.changeRole",
      target: { kind: "Membership", id: membershipId("editor") },
    });
  });

  test("an Admin makes another Admin an Editor", async () => {
    const { store, admin, farmId, membershipId, as } = await setup();
    const other = store.addMember("other", farmId, "admin");

    await changeMemberRole(await as(admin), {
      membershipId: membershipId("other"),
      role: "editor",
    });

    expect((await enterFarm(other, farmId)).member.role).toBe("editor");
  });

  test("the last Admin stays an Admin, also when the Admin asks for it", async () => {
    const { store, admin, farmId, membershipId, as } = await setup();
    store.addMember("editor", farmId, "editor");
    const audit = store.audit.length;

    await expect(
      changeMemberRole(await as(admin), { membershipId: membershipId("admin"), role: "editor" }),
    ).rejects.toMatchObject({ code: "member.lastAdmin" });
    expect((await enterFarm(admin, farmId)).member.role).toBe("admin");
    expect(store.audit).toHaveLength(audit);
  });

  test("a removed Admin does not count as another Admin", async () => {
    const { store, admin, farmId, membershipId, as } = await setup();
    store.addMember("other", farmId, "admin");
    await removeMember(await as(admin), { membershipId: membershipId("other") });

    await expect(
      changeMemberRole(await as(admin), { membershipId: membershipId("admin"), role: "editor" }),
    ).rejects.toMatchObject({ code: "member.lastAdmin" });
  });

  test("an Admin can make self an Editor when another Admin stays", async () => {
    const { store, admin, farmId, membershipId, as } = await setup();
    store.addMember("other", farmId, "admin");

    await changeMemberRole(await as(admin), {
      membershipId: membershipId("admin"),
      role: "editor",
    });

    expect((await enterFarm(admin, farmId)).member.role).toBe("editor");
  });

  test("the same Role writes nothing", async () => {
    const { store, admin, farmId, membershipId, as } = await setup();
    store.addMember("editor", farmId, "editor");
    const audit = store.audit.length;

    await changeMemberRole(await as(admin), {
      membershipId: membershipId("editor"),
      role: "editor",
    });
    await changeMemberRole(await as(admin), { membershipId: membershipId("admin"), role: "admin" });

    expect(store.audit).toHaveLength(audit);
  });

  test("an unknown, a removed, or another Farm's Membership is not found", async () => {
    const { store, admin, operator, farmId, membershipId, as } = await setup();
    store.addMember("removed", farmId, "editor");
    await removeMember(await as(admin), { membershipId: membershipId("removed") });
    const other = await createFarm(operator, { name: "Другая", ...settings });
    store.addMember("stranger", other.farmId, "editor");

    for (const id of [
      "membership-missing" as MembershipId,
      membershipId("removed"),
      membershipId("stranger", other.farmId),
    ]) {
      await expect(
        changeMemberRole(await as(admin), { membershipId: id, role: "admin" }),
      ).rejects.toMatchObject({ code: "member.notFound" });
    }
    expect(store.memberships.find((m) => m.farmId === other.farmId)?.role).toBe("editor");
  });

  test("an Editor cannot change a Role", async () => {
    const { store, farmId, membershipId } = await setup();
    const editor = store.addMember("editor", farmId, "editor");

    await expect(
      changeMemberRole(await store.farmContext(editor, farmId), {
        membershipId: membershipId("editor"),
        role: "admin",
      }),
    ).rejects.toMatchObject({ code: "access.denied" });
    expect((await enterFarm(editor, farmId)).member.role).toBe("editor");
  });
});

describe("removeMember", () => {
  test("the Membership becomes Archived, with an audit entry, and the User loses the Farm", async () => {
    const { store, admin, farmId, membershipId, userId, as } = await setup();
    const editor = store.addMember("editor", farmId, "editor");
    store.time += 1000;

    await removeMember(await as(admin), { membershipId: membershipId("editor") });

    expect(store.memberships.find((m) => m.id === membershipId("editor"))).toMatchObject({
      role: "editor",
      archivedAt: store.time,
    });
    expect(store.audit.at(-1)).toEqual({
      at: store.time,
      actorId: userId("admin"),
      farmId,
      command: "member.remove",
      target: { kind: "Membership", id: membershipId("editor") },
    });
    await expect(enterFarm(editor, farmId)).rejects.toMatchObject({ code: "farm.notMember" });
    await expect(store.farmContext(editor, farmId)).rejects.toMatchObject({
      code: "farm.notMember",
    });
    expect((await getViewer(editor))?.farms).toEqual([]);
  });

  test("a Member who owns an Active Sheep cannot be removed", async () => {
    const { store, admin, farmId, membershipId, as } = await setup();
    store.addMember("owner", farmId, "editor");
    const sheepId = await registerSheep(await as(admin), {
      tag: "A-1",
      name: null,
      sex: "ewe",
      birthDate: null,
      notes: null,
      weight: null,
      ownerId: membershipId("owner"),
      origin: "born",
      initialEntry: true,
    });

    await expect(
      removeMember(await as(admin), { membershipId: membershipId("owner") }),
    ).rejects.toMatchObject({ code: "member.ownsActiveSheep" });
    expect(store.memberships.find((m) => m.id === membershipId("owner"))?.archivedAt).toBe(
      undefined,
    );

    // A Sheep that is not Active, such as a Sold one, does not keep the Member.
    store.sheep.find((s) => s.id === sheepId)!.status = "sold";
    await removeMember(await as(admin), { membershipId: membershipId("owner") });
    expect(store.memberships.find((m) => m.id === membershipId("owner"))?.archivedAt).toBe(
      store.time,
    );
  });

  test("a Deleted Sheep does not keep its Owner in the Farm", async () => {
    const { store, admin, farmId, membershipId, as } = await setup();
    store.addMember("owner", farmId, "editor");
    const sheepId = await registerSheep(await as(admin), {
      tag: "A-1",
      name: null,
      sex: "ewe",
      birthDate: null,
      notes: null,
      weight: null,
      ownerId: membershipId("owner"),
      origin: "born",
      initialEntry: true,
    });
    await deleteSheep(await as(admin), { sheepId });

    await expect(
      removeMember(await as(admin), { membershipId: membershipId("owner") }),
    ).resolves.toBeUndefined();
  });

  test("the last Admin cannot be removed, also not by self", async () => {
    const { store, admin, farmId, membershipId, as } = await setup();
    store.addMember("editor", farmId, "editor");

    await expect(
      removeMember(await as(admin), { membershipId: membershipId("admin") }),
    ).rejects.toMatchObject({ code: "member.lastAdmin" });
    expect(store.memberships.find((m) => m.id === membershipId("admin"))?.archivedAt).toBe(
      undefined,
    );
  });

  test("an Admin can leave when another Admin stays", async () => {
    const { store, admin, farmId, membershipId, as } = await setup();
    store.addMember("other", farmId, "admin");

    await removeMember(await as(admin), { membershipId: membershipId("admin") });

    await expect(enterFarm(admin, farmId)).rejects.toMatchObject({ code: "farm.notMember" });
  });

  test("a removed Member cannot be removed again", async () => {
    const { store, admin, farmId, membershipId, as } = await setup();
    store.addMember("editor", farmId, "editor");
    await removeMember(await as(admin), { membershipId: membershipId("editor") });
    const removedAt = store.time;
    store.time += 1000;

    await expect(
      removeMember(await as(admin), { membershipId: membershipId("editor") }),
    ).rejects.toMatchObject({ code: "member.notFound" });
    expect(store.memberships.find((m) => m.id === membershipId("editor"))?.archivedAt).toBe(
      removedAt,
    );
  });

  test("an Editor cannot remove a Member", async () => {
    const { store, farmId, membershipId } = await setup();
    const editor = store.addMember("editor", farmId, "editor");

    await expect(
      removeMember(await store.farmContext(editor, farmId), {
        membershipId: membershipId("admin"),
      }),
    ).rejects.toMatchObject({ code: "access.denied" });
  });
});

describe("a removed Member who joins again", () => {
  test("gets the same Membership back, with the Role of the new link", async () => {
    const { store, admin, farmId, membershipId, as } = await setup();
    const aibek = store.addMember("aibek", farmId, "admin");
    const id = membershipId("aibek");
    await removeMember(await as(admin), { membershipId: id });
    const memberships = store.memberships.length;

    const token = (await inviteMember(await as(admin))).token;
    await expect(acceptInvite(aibek, { token })).resolves.toEqual({ farmId });

    expect(store.memberships).toHaveLength(memberships);
    expect(store.memberships.find((m) => m.id === id)).toEqual({
      id,
      farmId,
      userId: store.users.find((u) => u.username === "aibek")!.id,
      role: "editor",
    });
    expect((await enterFarm(aibek, farmId)).member).toMatchObject({
      membershipId: id,
      role: "editor",
    });
    expect(store.audit.at(-1)).toMatchObject({
      command: "invite.accept",
      target: { kind: "Membership", id },
    });
  });

  test("a Member now still cannot use a link", async () => {
    const { store, admin, farmId, as } = await setup();
    const editor = store.addMember("editor", farmId, "editor");
    const token = (await inviteMember(await as(admin))).token;

    await expect(acceptInvite(editor, { token })).rejects.toMatchObject({
      code: "invite.alreadyMember",
    });
  });
});

describe("prepareMemberPassword", () => {
  const password = "correct horse";

  test("gives the id of the Member at the identity provider", async () => {
    const { store, admin, farmId, membershipId, as } = await setup();
    store.addMember("editor", farmId, "editor");

    expect(
      await prepareMemberPassword(await as(admin), {
        membershipId: membershipId("editor"),
        password,
      }),
    ).toEqual({ providerUserId: "user_editor" });
  });

  test("rejects a password that is too short, too long, or only spaces", async () => {
    const { store, admin, farmId, membershipId, as } = await setup();
    store.addMember("editor", farmId, "editor");

    for (const bad of ["1234567", "x".repeat(73), " ".repeat(10)]) {
      await expect(
        prepareMemberPassword(await as(admin), {
          membershipId: membershipId("editor"),
          password: bad,
        }),
      ).rejects.toMatchObject({ code: "member.passwordInvalid" });
    }
    for (const good of ["12345678", "x".repeat(72)]) {
      await expect(
        prepareMemberPassword(await as(admin), {
          membershipId: membershipId("editor"),
          password: good,
        }),
      ).resolves.toEqual({ providerUserId: "user_editor" });
    }
  });

  test("an Admin cannot set the password of self, of the Operator, or of a Member of another Farm", async () => {
    const { store, admin, operator, farmId, membershipId, userId, as } = await setup();
    store.memberships.push({
      id: "membership-operator" as MembershipId,
      farmId,
      userId: userId("operator"),
      role: "editor",
    });
    store.addMember("two-farms", farmId, "editor");
    const other = await createFarm(operator, { name: "Другая", ...settings });
    store.memberships.push({
      id: "membership-other" as MembershipId,
      farmId: other.farmId,
      userId: userId("two-farms"),
      role: "editor",
    });

    for (const id of [membershipId("admin"), membershipId("operator"), membershipId("two-farms")]) {
      await expect(
        prepareMemberPassword(await as(admin), { membershipId: id, password }),
      ).rejects.toMatchObject({ code: "member.passwordNotAllowed" });
    }
  });

  test("an Admin cannot set the password of a User whom another Farm removed", async () => {
    const { store, admin, operator, farmId, membershipId, userId, as } = await setup();
    store.addMember("former", farmId, "editor");
    const other = await createFarm(operator, { name: "Другая", ...settings });
    store.memberships.push({
      id: "membership-other" as MembershipId,
      farmId: other.farmId,
      userId: userId("former"),
      role: "editor",
      archivedAt: store.time,
    });

    await expect(
      prepareMemberPassword(await as(admin), { membershipId: membershipId("former"), password }),
    ).rejects.toMatchObject({ code: "member.passwordNotAllowed" });
  });

  test("a removed Member is not found", async () => {
    const { store, admin, farmId, membershipId, as } = await setup();
    store.addMember("editor", farmId, "editor");
    await removeMember(await as(admin), { membershipId: membershipId("editor") });

    await expect(
      prepareMemberPassword(await as(admin), { membershipId: membershipId("editor"), password }),
    ).rejects.toMatchObject({ code: "member.notFound" });
  });

  test("an Editor cannot set a password, whatever the password", async () => {
    const { store, farmId, membershipId } = await setup();
    const editor = store.addMember("editor", farmId, "editor");
    store.addMember("other", farmId, "editor");

    for (const attempt of [password, "short"]) {
      await expect(
        prepareMemberPassword(await store.farmContext(editor, farmId), {
          membershipId: membershipId("other"),
          password: attempt,
        }),
      ).rejects.toMatchObject({ code: "access.denied" });
    }
  });
});

describe("recordMemberPassword", () => {
  test("appends the audit entry of the new password", async () => {
    const { store, admin, farmId, membershipId, userId, as } = await setup();
    store.addMember("editor", farmId, "editor");

    await recordMemberPassword(await as(admin), { membershipId: membershipId("editor") });

    expect(store.audit.at(-1)).toEqual({
      at: store.time,
      actorId: userId("admin"),
      farmId,
      command: "member.setPassword",
      target: { kind: "Membership", id: membershipId("editor") },
    });
  });

  test("an Editor cannot record a password", async () => {
    const { store, farmId, membershipId } = await setup();
    const editor = store.addMember("editor", farmId, "editor");

    await expect(
      recordMemberPassword(await store.farmContext(editor, farmId), {
        membershipId: membershipId("editor"),
      }),
    ).rejects.toMatchObject({ code: "access.denied" });
  });
});

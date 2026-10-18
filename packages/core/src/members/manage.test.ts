import { describe, expect, test } from "vite-plus/test";

import { enterFarm } from "../access/session";
import type { CommandContext } from "../context";
import { createFarm } from "../farms/commands";
import type { FarmId, MembershipId, PasswordResetId } from "../ids";
import { InMemoryStore } from "../testing/in-memory";
import { getViewer, setOperator } from "../users/commands";
import { acceptInvite } from "./commands";
import { inviteLifetimeMs } from "./invite";
import {
  changeMemberRole,
  inviteMember,
  finishMemberPassword,
  listMembers,
  removeMember,
  requestMemberPassword,
} from "./manage";
import { passwordResetLifetimeMs } from "./password-reset";

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

describe("requestMemberPassword", () => {
  const password = "correct horse";

  test("writes a pending reset and an audit entry, and gives the id at the identity provider", async () => {
    const { store, admin, farmId, membershipId, userId, as } = await setup();
    store.addMember("editor", farmId, "editor");

    const result = await requestMemberPassword(await as(admin), {
      membershipId: membershipId("editor"),
      password,
    });

    expect(result).toEqual({ passwordResetId: expect.any(String), providerUserId: "user_editor" });
    expect(store.passwordResets).toEqual([
      {
        id: result.passwordResetId,
        farmId,
        membershipId: membershipId("editor"),
        userId: userId("editor"),
        actorId: userId("admin"),
        createdAt: store.time,
        status: "pending",
      },
    ]);
    expect(store.audit.at(-1)).toEqual({
      at: store.time,
      actorId: userId("admin"),
      farmId,
      command: "member.requestPassword",
      target: { kind: "Membership", id: membershipId("editor") },
    });
  });

  test("rejects a password that is too short, too long, or only spaces, and writes nothing", async () => {
    const { store, admin, farmId, membershipId, as } = await setup();
    store.addMember("editor", farmId, "editor");
    const audit = store.audit.length;

    for (const bad of ["1234567", "x".repeat(73), " ".repeat(10)]) {
      await expect(
        requestMemberPassword(await as(admin), {
          membershipId: membershipId("editor"),
          password: bad,
        }),
      ).rejects.toMatchObject({ code: "member.passwordInvalid" });
    }
    expect(store.passwordResets).toEqual([]);
    expect(store.audit).toHaveLength(audit);
    for (const good of ["12345678", "x".repeat(72)]) {
      await expect(
        requestMemberPassword(await as(admin), {
          membershipId: membershipId("editor"),
          password: good,
        }),
      ).resolves.toMatchObject({ providerUserId: "user_editor" });
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
        requestMemberPassword(await as(admin), { membershipId: id, password }),
      ).rejects.toMatchObject({ code: "member.passwordNotAllowed" });
    }
    expect(store.passwordResets).toEqual([]);
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
      requestMemberPassword(await as(admin), { membershipId: membershipId("former"), password }),
    ).rejects.toMatchObject({ code: "member.passwordNotAllowed" });
  });

  test("a removed Member is not found", async () => {
    const { store, admin, farmId, membershipId, as } = await setup();
    store.addMember("editor", farmId, "editor");
    await removeMember(await as(admin), { membershipId: membershipId("editor") });

    await expect(
      requestMemberPassword(await as(admin), { membershipId: membershipId("editor"), password }),
    ).rejects.toMatchObject({ code: "member.notFound" });
  });

  test("an Editor cannot set a password, whatever the password", async () => {
    const { store, farmId, membershipId } = await setup();
    const editor = store.addMember("editor", farmId, "editor");
    store.addMember("other", farmId, "editor");

    for (const attempt of [password, "short"]) {
      await expect(
        requestMemberPassword(await store.farmContext(editor, farmId), {
          membershipId: membershipId("other"),
          password: attempt,
        }),
      ).rejects.toMatchObject({ code: "access.denied" });
    }
    expect(store.passwordResets).toEqual([]);
  });
});

/** A Farm with the Editor "editor", for whom the Admin asked for a new password. */
async function pendingReset() {
  const farm = await setup();
  const editor = farm.store.addMember("editor", farm.farmId, "editor");
  const { passwordResetId } = await requestMemberPassword(await farm.as(farm.admin), {
    membershipId: farm.membershipId("editor"),
    password: "correct horse",
  });
  return { ...farm, editor, passwordResetId };
}

describe("finishMemberPassword", () => {
  test("a password that the identity provider set: the reset is done, with the Admin's audit entry", async () => {
    const { store, farmId, membershipId, userId, passwordResetId } = await pendingReset();
    store.time += 1000;

    await finishMemberPassword(store.systemContext(), { passwordResetId, outcome: "done" });

    expect(store.passwordResets[0]?.status).toBe("done");
    expect(store.audit.at(-1)).toEqual({
      at: store.time,
      actorId: userId("admin"),
      farmId,
      command: "member.setPassword",
      target: { kind: "Membership", id: membershipId("editor") },
    });
  });

  test("a password that the identity provider did not set: the reset failed", async () => {
    const { store, passwordResetId } = await pendingReset();

    await finishMemberPassword(store.systemContext(), { passwordResetId, outcome: "failed" });

    expect(store.passwordResets[0]?.status).toBe("failed");
    expect(store.audit.at(-1)).toMatchObject({ command: "member.setPasswordFailed" });
  });

  test("an outcome that nobody knows: the reset is unknown, with its own audit entry", async () => {
    const { store, farmId, membershipId, userId, passwordResetId } = await pendingReset();

    await finishMemberPassword(store.systemContext(), { passwordResetId, outcome: "unknown" });

    expect(store.passwordResets[0]?.status).toBe("unknown");
    expect(store.audit.at(-1)).toEqual({
      at: store.time,
      actorId: userId("admin"),
      farmId,
      command: "member.setPasswordUnknown",
      target: { kind: "Membership", id: membershipId("editor") },
    });
  });

  test("a reset that is not pending, or unknown, stays as it is", async () => {
    const { store, passwordResetId } = await pendingReset();
    await finishMemberPassword(store.systemContext(), { passwordResetId, outcome: "done" });
    const audit = store.audit.length;

    await finishMemberPassword(store.systemContext(), { passwordResetId, outcome: "failed" });
    await finishMemberPassword(store.systemContext(), {
      passwordResetId: "passwordreset-missing" as PasswordResetId,
      outcome: "done",
    });

    expect(store.passwordResets[0]?.status).toBe("done");
    expect(store.audit).toHaveLength(audit);
  });

  test("records the outcome also when the Admin was demoted and the Member removed in the meantime", async () => {
    const { store, farmId, membershipId, userId, passwordResetId } = await pendingReset();
    const boss = store.addMember("boss", farmId, "admin");
    const asBoss = await store.farmContext(boss, farmId);
    await changeMemberRole(asBoss, { membershipId: membershipId("admin"), role: "editor" });
    await removeMember(asBoss, { membershipId: membershipId("editor") });

    await finishMemberPassword(store.systemContext(), { passwordResetId, outcome: "done" });

    expect(store.passwordResets[0]?.status).toBe("done");
    expect(store.audit.at(-1)).toMatchObject({
      actorId: userId("admin"),
      farmId,
      command: "member.setPassword",
      target: { kind: "Membership", id: membershipId("editor") },
    });
  });
});

describe("a pending password reset", () => {
  test("stops the User from joining another Farm until the reset is finished", async () => {
    const { store, operator, editor, farmId, passwordResetId } = await pendingReset();
    const other = await createFarm(operator, { name: "Другая", ...settings });
    const memberships = store.memberships.length;
    const audit = store.audit.length;

    await expect(acceptInvite(editor, other.invite)).rejects.toMatchObject({
      code: "user.passwordResetPending",
    });
    expect(store.memberships).toHaveLength(memberships);
    expect(store.invites.at(-1)?.used).toBeUndefined();
    expect(store.audit).toHaveLength(audit);

    await finishMemberPassword(store.systemContext(), { passwordResetId, outcome: "failed" });
    await expect(acceptInvite(editor, other.invite)).resolves.toEqual({ farmId: other.farmId });
    expect((await getViewer(editor))?.farms.map((f) => f.id).sort()).toEqual(
      [farmId, other.farmId].sort(),
    );
  });

  test("a done reset also lets the User join another Farm", async () => {
    const { store, operator, editor, passwordResetId } = await pendingReset();
    const other = await createFarm(operator, { name: "Другая", ...settings });

    await finishMemberPassword(store.systemContext(), { passwordResetId, outcome: "done" });

    await expect(acceptInvite(editor, other.invite)).resolves.toEqual({ farmId: other.farmId });
  });

  test("an unknown outcome keeps blocking the User for the whole lifetime of the reset", async () => {
    const { store, operator, editor, passwordResetId } = await pendingReset();
    const other = await createFarm(operator, { name: "Другая", ...settings });
    await finishMemberPassword(store.systemContext(), { passwordResetId, outcome: "unknown" });

    store.time += passwordResetLifetimeMs - 1;
    await expect(acceptInvite(editor, other.invite)).rejects.toMatchObject({
      code: "user.passwordResetPending",
    });
    await expect(
      setOperator(store.systemContext(), { providerUserId: "user_editor", isOperator: true }),
    ).rejects.toMatchObject({ code: "user.passwordResetPending" });

    store.time += 1;
    await expect(acceptInvite(editor, other.invite)).resolves.toEqual({ farmId: other.farmId });
    await setOperator(store.systemContext(), { providerUserId: "user_editor", isOperator: true });
    expect(store.users.find((u) => u.username === "editor")?.isOperator).toBe(true);
  });

  test("stops nothing after its lifetime, also if nobody finished it", async () => {
    const { store, operator, editor } = await pendingReset();
    const other = await createFarm(operator, { name: "Другая", ...settings });

    store.time += passwordResetLifetimeMs - 1;
    await expect(acceptInvite(editor, other.invite)).rejects.toMatchObject({
      code: "user.passwordResetPending",
    });
    store.time += 1;
    await expect(acceptInvite(editor, other.invite)).resolves.toEqual({ farmId: other.farmId });
  });

  test("stops the User from becoming the Operator, until the reset is finished", async () => {
    const { store, passwordResetId } = await pendingReset();

    await expect(
      setOperator(store.systemContext(), { providerUserId: "user_editor", isOperator: true }),
    ).rejects.toMatchObject({ code: "user.passwordResetPending" });
    expect(store.users.find((u) => u.username === "editor")?.isOperator).toBe(false);

    await finishMemberPassword(store.systemContext(), { passwordResetId, outcome: "done" });
    await setOperator(store.systemContext(), { providerUserId: "user_editor", isOperator: true });
    expect(store.users.find((u) => u.username === "editor")?.isOperator).toBe(true);
  });

  test("does not stop taking the Operator flag away", async () => {
    const { store, farmId, membershipId, userId } = await pendingReset();
    store.passwordResets.push({
      id: "passwordreset-operator" as PasswordResetId,
      farmId,
      membershipId: membershipId("admin"),
      userId: userId("operator"),
      actorId: userId("admin"),
      createdAt: store.time,
      status: "pending",
    });

    await setOperator(store.systemContext(), {
      providerUserId: "user_operator",
      isOperator: false,
    });

    expect(store.users.find((u) => u.username === "operator")?.isOperator).toBe(false);
  });
});

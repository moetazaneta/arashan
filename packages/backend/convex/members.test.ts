import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { api } from "./_generated/api";
import { errorCode, logIn, makeFarm, setup, type Test } from "./test.setup";

/** A Farm with the Admin "admin" and the Editor "editor", who joined through the Admin's link. */
async function farmWithEditor(t: Test, name?: string) {
  const { operator, farmId, token } = await makeFarm(t, name);
  const admin = await logIn(t, `admin${name ?? ""}`);
  await admin.mutation(api.invites.accept, { token });
  const invite = await admin.mutation(api.members.invite, { farmId });
  const editor = await logIn(t, `editor${name ?? ""}`);
  await editor.mutation(api.invites.accept, { token: invite.token });
  const membershipId = async (username: string) =>
    (await admin.query(api.members.list, { farmId })).find((m) => m.username === username)!
      .membershipId;
  return { operator, admin, editor, farmId, membershipId };
}

async function auditLog(t: Test) {
  return t.run((ctx) => ctx.db.query("auditLog").collect());
}

describe("members", () => {
  test("an Admin invites an Editor, promotes, demotes and removes, with an audit entry each", async () => {
    const t = setup();
    const { admin, farmId, membershipId } = await farmWithEditor(t);
    const editorId = await membershipId("editor");

    expect(await admin.query(api.members.list, { farmId })).toMatchObject([
      { username: "admin", role: "admin", archivedAt: null, canSetPassword: false },
      { username: "editor", role: "editor", archivedAt: null, canSetPassword: true },
    ]);

    await admin.mutation(api.members.changeRole, { farmId, membershipId: editorId, role: "admin" });
    await admin.mutation(api.members.changeRole, {
      farmId,
      membershipId: editorId,
      role: "editor",
    });
    await admin.mutation(api.members.remove, { farmId, membershipId: editorId });

    expect(await admin.query(api.members.list, { farmId })).toMatchObject([
      { username: "admin", archivedAt: null },
      { username: "editor", role: "editor", archivedAt: expect.any(Number), canSetPassword: false },
    ]);
    const invite = (await t.run((ctx) => ctx.db.query("invites").collect())).at(-1)!;
    expect(invite).toMatchObject({ farmId, role: "editor" });
    const farmEntries = (await auditLog(t)).filter((entry) => entry.farmId === (farmId as string));
    expect(
      farmEntries.map(({ command, targetKind, targetId }) => [command, targetKind, targetId]),
    ).toEqual([
      ["farm.create", "Farm", farmId],
      ["invite.accept", "Membership", await membershipId("admin")],
      ["member.invite", "Invite", invite._id],
      ["invite.accept", "Membership", editorId],
      ["member.changeRole", "Membership", editorId],
      ["member.changeRole", "Membership", editorId],
      ["member.remove", "Membership", editorId],
    ]);
  });

  test("an Editor cannot manage the Members", async () => {
    const t = setup();
    const { editor, farmId, membershipId } = await farmWithEditor(t);
    const adminId = await membershipId("admin");

    expect(await errorCode(editor.query(api.members.list, { farmId }))).toBe("access.denied");
    expect(await errorCode(editor.mutation(api.members.invite, { farmId }))).toBe("access.denied");
    expect(
      await errorCode(
        editor.mutation(api.members.changeRole, { farmId, membershipId: adminId, role: "editor" }),
      ),
    ).toBe("access.denied");
    expect(
      await errorCode(editor.mutation(api.members.remove, { farmId, membershipId: adminId })),
    ).toBe("access.denied");
  });

  test("the last Admin can neither leave nor become an Editor", async () => {
    const t = setup();
    const { admin, farmId, membershipId } = await farmWithEditor(t);
    const adminId = await membershipId("admin");

    expect(
      await errorCode(
        admin.mutation(api.members.changeRole, { farmId, membershipId: adminId, role: "editor" }),
      ),
    ).toBe("member.lastAdmin");
    expect(
      await errorCode(admin.mutation(api.members.remove, { farmId, membershipId: adminId })),
    ).toBe("member.lastAdmin");
    expect(await admin.query(api.farms.get, { farmId })).toMatchObject({ id: farmId });
  });

  test("a removed Member loses the Farm, and the Membership stays in the database", async () => {
    const t = setup();
    const { admin, editor, farmId, membershipId } = await farmWithEditor(t);
    const editorId = await membershipId("editor");

    await admin.mutation(api.members.remove, { farmId, membershipId: editorId });

    expect(await errorCode(editor.query(api.farms.get, { farmId }))).toBe("farm.notMember");
    expect(await errorCode(editor.query(api.members.list, { farmId }))).toBe("farm.notMember");
    expect(await editor.query(api.users.viewer, {})).toMatchObject({ farms: [] });
    const row = await t.run((ctx) => ctx.db.get(ctx.db.normalizeId("memberships", editorId)!));
    expect(row).toMatchObject({ role: "editor", archivedAt: expect.any(Number) });
    expect(row?.deletedAt).toBeUndefined();
  });

  test("a removed Member who opens a new link gets the same Membership back", async () => {
    const t = setup();
    const { admin, editor, farmId, membershipId } = await farmWithEditor(t);
    const editorId = await membershipId("editor");
    await admin.mutation(api.members.remove, { farmId, membershipId: editorId });

    const { token } = await admin.mutation(api.members.invite, { farmId });
    await editor.mutation(api.invites.accept, { token });

    expect(await editor.query(api.farms.get, { farmId })).toMatchObject({ id: farmId });
    expect(await admin.query(api.members.list, { farmId })).toMatchObject([
      { username: "admin" },
      { username: "editor", membershipId: editorId, role: "editor", archivedAt: null },
    ]);
    const rows = await t.run((ctx) => ctx.db.query("memberships").collect());
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row._id === (editorId as string))?.archivedAt).toBeUndefined();
  });

  test("a Membership of another Farm, or a made-up id, is not found", async () => {
    const t = setup();
    const { admin, farmId } = await farmWithEditor(t);
    const other = await farmWithEditor(t, "Другая");
    const strangerId = await other.membershipId("editorДругая");

    for (const membershipId of [strangerId, "not-an-id"]) {
      expect(
        await errorCode(
          admin.mutation(api.members.changeRole, { farmId, membershipId, role: "admin" }),
        ),
      ).toBe("member.notFound");
      expect(await errorCode(admin.mutation(api.members.remove, { farmId, membershipId }))).toBe(
        "member.notFound",
      );
    }
    expect(await other.admin.query(api.members.list, { farmId: other.farmId })).toMatchObject([
      { username: "adminДругая", role: "admin" },
      { username: "editorДругая", role: "editor", archivedAt: null },
    ]);
  });
});

describe("members.setPassword", () => {
  const password = "correct horse battery";
  const secretKey = "sk_test_secret";
  let fetchMock: ReturnType<typeof vi.fn>;

  function clerkResponds(status: number, body: unknown) {
    fetchMock.mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    });
  }

  async function passwordResets(t: Test) {
    return t.run((ctx) => ctx.db.query("passwordResets").collect());
  }

  /** The commands of the audit log after the entry number `from`. */
  async function auditSince(t: Test, from: number) {
    return (await auditLog(t)).slice(from).map(({ command, targetKind, targetId }) => ({
      command,
      targetKind,
      targetId,
    }));
  }

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("CLERK_SECRET_KEY", secretKey);
    clerkResponds(200, { id: "user_editor" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("an Admin sets the password through Clerk; the reset is done, with two audit entries", async () => {
    const t = setup();
    const { admin, farmId, membershipId } = await farmWithEditor(t);
    const editorId = await membershipId("editor");
    const before = (await auditLog(t)).length;

    await admin.action(api.members.setPassword, { farmId, membershipId: editorId, password });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.clerk.com/v1/users/user_editor");
    expect(init).toMatchObject({
      method: "PATCH",
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
      signal: expect.any(AbortSignal),
    });
    expect(JSON.parse(init.body)).toEqual({ password, sign_out_of_other_sessions: true });
    expect(await passwordResets(t)).toMatchObject([
      { farmId, membershipId: editorId, status: "done" },
    ]);
    expect(await auditSince(t, before)).toEqual([
      { command: "member.requestPassword", targetKind: "Membership", targetId: editorId },
      { command: "member.setPassword", targetKind: "Membership", targetId: editorId },
    ]);
  });

  /**
   * Sets the password of the Editor with the Clerk answer that `stub` gives, and gives the error of
   * the action, the reset rows, the new audit commands, and the error of the Editor's accept of a
   * link to another Farm after it (null if the Editor joined).
   */
  async function setPasswordWith(stub: () => void) {
    const t = setup();
    const { admin, editor, farmId, membershipId } = await farmWithEditor(t);
    const other = await makeFarm(t, "Другая");
    stub();
    const before = (await auditLog(t)).length;

    const error = await errorCode(
      admin.action(api.members.setPassword, {
        farmId,
        membershipId: await membershipId("editor"),
        password,
      }),
    );

    return {
      error,
      resets: await passwordResets(t),
      commands: (await auditSince(t, before)).map((entry) => entry.command),
      acceptAfter: await errorCode(editor.mutation(api.invites.accept, { token: other.token })),
    };
  }

  test("a password that Clerk refuses is a domain error; the reset failed and blocks nothing", async () => {
    const result = await setPasswordWith(() =>
      clerkResponds(422, { errors: [{ code: "form_password_pwned" }] }),
    );

    expect(result.error).toBe("member.passwordRejected");
    expect(result.resets).toMatchObject([{ status: "failed" }]);
    expect(result.commands).toEqual(["member.requestPassword", "member.setPasswordFailed"]);
    expect(result.acceptAfter).toBeNull();
  });

  test("another refusal of Clerk is no domain error; the reset failed and blocks nothing", async () => {
    const result = await setPasswordWith(() =>
      clerkResponds(404, { errors: [{ code: "not_found" }] }),
    );

    expect(result.error).toBeInstanceOf(Error);
    expect(result.resets).toMatchObject([{ status: "failed" }]);
    expect(result.commands).toEqual(["member.requestPassword", "member.setPasswordFailed"]);
    expect(result.acceptAfter).toBeNull();
  });

  const unknownAnswers: [string, () => void][] = [
    ["an error of the Clerk server", () => clerkResponds(500, null)],
    [
      "no answer from Clerk",
      () => fetchMock.mockRejectedValue(new Error("The operation was aborted.")),
    ],
  ];
  for (const [answer, stub] of unknownAnswers) {
    test(`after ${answer}, the reset is unknown and still blocks the Member`, async () => {
      const result = await setPasswordWith(stub);

      expect(result.error).toBeInstanceOf(Error);
      expect(result.resets).toMatchObject([{ status: "unknown" }]);
      expect(result.commands).toEqual(["member.requestPassword", "member.setPasswordUnknown"]);
      expect(result.acceptAfter).toBe("user.passwordResetPending");
    });
  }

  test("while Clerk sets the password, the Member cannot join another Farm", async () => {
    const t = setup();
    const { admin, editor, farmId, membershipId } = await farmWithEditor(t);
    const other = await makeFarm(t, "Другая");
    let duringCall: unknown;
    fetchMock.mockImplementation(async () => {
      duringCall = await errorCode(editor.mutation(api.invites.accept, { token: other.token }));
      return { ok: true, status: 200, json: async () => ({}) };
    });

    await admin.action(api.members.setPassword, {
      farmId,
      membershipId: await membershipId("editor"),
      password,
    });

    expect(duringCall).toBe("user.passwordResetPending");
    await expect(editor.mutation(api.invites.accept, { token: other.token })).resolves.toEqual({
      farmId: other.farmId,
    });
  });

  test("a short password never reaches Clerk, and writes nothing", async () => {
    const t = setup();
    const { admin, farmId, membershipId } = await farmWithEditor(t);
    const before = (await auditLog(t)).length;

    expect(
      await errorCode(
        admin.action(api.members.setPassword, {
          farmId,
          membershipId: await membershipId("editor"),
          password: "short",
        }),
      ),
    ).toBe("member.passwordInvalid");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await passwordResets(t)).toEqual([]);
    expect(await auditLog(t)).toHaveLength(before);
  });

  test("an Admin cannot set the own password, nor that of a Member of another Farm", async () => {
    const t = setup();
    const { admin, farmId, membershipId } = await farmWithEditor(t);
    const other = await farmWithEditor(t, "Другая");
    const { token } = await other.admin.mutation(api.members.invite, { farmId: other.farmId });
    const editor = await logIn(t, "editor");
    await editor.mutation(api.invites.accept, { token });

    for (const username of ["admin", "editor"]) {
      expect(
        await errorCode(
          admin.action(api.members.setPassword, {
            farmId,
            membershipId: await membershipId(username),
            password,
          }),
        ),
      ).toBe("member.passwordNotAllowed");
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await passwordResets(t)).toEqual([]);
  });

  test("an Editor, a removed Member and a stranger never reach Clerk, and write nothing", async () => {
    const t = setup();
    const { admin, editor, farmId, membershipId } = await farmWithEditor(t);
    const adminId = await membershipId("admin");
    const stranger = await logIn(t, "stranger");
    const before = (await auditLog(t)).length;

    expect(
      await errorCode(
        editor.action(api.members.setPassword, { farmId, membershipId: adminId, password }),
      ),
    ).toBe("access.denied");
    expect(
      await errorCode(
        stranger.action(api.members.setPassword, { farmId, membershipId: adminId, password }),
      ),
    ).toBe("farm.notMember");
    expect(
      await errorCode(
        t.action(api.members.setPassword, { farmId, membershipId: adminId, password }),
      ),
    ).toBe("auth.signedOut");
    expect(await auditLog(t)).toHaveLength(before);
    const editorId = await membershipId("editor");
    await admin.mutation(api.members.remove, { farmId, membershipId: editorId });
    expect(
      await errorCode(
        admin.action(api.members.setPassword, { farmId, membershipId: editorId, password }),
      ),
    ).toBe("member.notFound");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await passwordResets(t)).toEqual([]);
  });
});

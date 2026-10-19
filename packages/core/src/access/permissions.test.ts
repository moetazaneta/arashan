import { describe, expect, test } from "vite-plus/test";

import type { FarmId, MembershipId, UserId } from "../ids";
import { roles } from "../members/membership";
import { type Action, authorize, can, type Member, permissions } from "./permissions";

const farmId = "farm-1" as FarmId;
const otherFarmId = "farm-2" as FarmId;

function member(role: Member["role"]): Member {
  return { membershipId: "membership-1" as MembershipId, userId: "user-1" as UserId, farmId, role };
}

// The whole matrix, written out: a change of a permission must change this table too.
const expected: Record<Action, Record<Member["role"], boolean>> = {
  "farm.view": { admin: true, editor: true },
  "farm.updateSettings": { admin: true, editor: false },
  "member.list": { admin: true, editor: false },
  "member.invite": { admin: true, editor: false },
  "member.changeRole": { admin: true, editor: false },
  "member.remove": { admin: true, editor: false },
  "member.setPassword": { admin: true, editor: false },
  "sheep.view": { admin: true, editor: true },
  "sheep.register": { admin: true, editor: true },
  "sheep.update": { admin: true, editor: true },
  "sheep.changeOwner": { admin: true, editor: true },
  "sheep.delete": { admin: true, editor: true },
  "breed.view": { admin: true, editor: true },
  "breed.add": { admin: true, editor: true },
  "breed.update": { admin: true, editor: true },
  "breed.delete": { admin: true, editor: true },
  "sheep.move": { admin: true, editor: true },
  "sheep.changeStatus": { admin: true, editor: true },
  "flock.view": { admin: true, editor: true },
  "flock.create": { admin: true, editor: true },
  "flock.update": { admin: true, editor: true },
  "flock.archive": { admin: true, editor: true },
  "flock.assignShepherd": { admin: true, editor: true },
  "location.create": { admin: true, editor: true },
  "location.update": { admin: true, editor: true },
  "location.archive": { admin: true, editor: true },
  "shepherd.create": { admin: true, editor: true },
  "shepherd.update": { admin: true, editor: true },
  "shepherd.archive": { admin: true, editor: true },
  "lambing.record": { admin: true, editor: true },
  "money.view": { admin: true, editor: true },
  "money.create": { admin: true, editor: true },
  "money.update": { admin: true, editor: true },
  "money.delete": { admin: true, editor: true },
  "moneyCategory.create": { admin: true, editor: true },
  "moneyCategory.update": { admin: true, editor: true },
  "moneyCategory.archive": { admin: true, editor: true },
  "moneyCategory.delete": { admin: true, editor: true },
  "deal.view": { admin: true, editor: true },
  "deal.create": { admin: true, editor: true },
  "deal.update": { admin: true, editor: true },
  "deal.cancel": { admin: true, editor: true },
  "resource.view": { admin: true, editor: true },
  "resource.create": { admin: true, editor: true },
  "resource.update": { admin: true, editor: true },
  "resource.archive": { admin: true, editor: true },
  "resource.record": { admin: true, editor: true },
};

describe("can", () => {
  test("the table covers each action of the matrix", () => {
    expect(Object.keys(expected).sort()).toEqual(Object.keys(permissions).sort());
  });

  for (const action of Object.keys(expected) as Action[]) {
    for (const role of roles) {
      test(`${role}: ${action} in the own Farm is ${expected[action][role]}`, () => {
        expect(can(member(role), action, { farmId })).toBe(expected[action][role]);
      });

      test(`${role}: ${action} in another Farm is false`, () => {
        expect(can(member(role), action, { farmId: otherFarmId })).toBe(false);
      });
    }
  }
});

describe("authorize", () => {
  test("throws access.denied when the Member cannot do the action", () => {
    expect(() => authorize(member("editor"), "farm.updateSettings", { farmId })).toThrow(
      expect.objectContaining({ name: "DomainError", code: "access.denied" }),
    );
  });

  test("returns when the Member can do the action", () => {
    expect(() => authorize(member("admin"), "farm.updateSettings", { farmId })).not.toThrow();
  });
});

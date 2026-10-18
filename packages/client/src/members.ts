import type { FarmId, MembershipId, Role } from "@arashan/core";
import { api } from "@arashan/backend/api";
import { convexQuery, useConvexAction, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";

import { callCommand } from "./errors";

/** The Members of the Farm, also the removed ones, for an Admin. An Editor gets `access.denied`. */
export function useMembers(farmId: FarmId) {
  return useQuery(convexQuery(api.members.list, { farmId }));
}

/** An Admin makes a one-time invite link for a new Editor, and gets its token. */
export function useInviteMember(farmId: FarmId) {
  const invite = useConvexMutation(api.members.invite);
  return useMutation({ mutationFn: () => callCommand(invite, { farmId }) });
}

/** An Admin changes the Role of a Member. */
export function useChangeMemberRole(farmId: FarmId) {
  const changeRole = useConvexMutation(api.members.changeRole);
  return useMutation({
    mutationFn: (input: { membershipId: MembershipId; role: Role }) =>
      callCommand(changeRole, { farmId, ...input }),
  });
}

/** An Admin removes a Member from the Farm. */
export function useRemoveMember(farmId: FarmId) {
  const remove = useConvexMutation(api.members.remove);
  return useMutation({
    mutationFn: (membershipId: MembershipId) => callCommand(remove, { farmId, membershipId }),
  });
}

/** An Admin sets a new password for a Member. */
export function useSetMemberPassword(farmId: FarmId) {
  const setPassword = useConvexAction(api.members.setPassword);
  return useMutation({
    mutationFn: (input: { membershipId: MembershipId; password: string }) =>
      callCommand(setPassword, { farmId, ...input }),
  });
}

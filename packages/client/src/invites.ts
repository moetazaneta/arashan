import { api } from "@arashan/backend/api";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";

import { callCommand } from "./errors";

/** The Farm and the Role that an invite link offers, or the domain error of the link. */
export function useInvite(token: string) {
  return useQuery(convexQuery(api.invites.preview, { token }));
}

/** The User becomes a Member of the Farm of the invite link. */
export function useAcceptInvite() {
  const accept = useConvexMutation(api.invites.accept);
  return useMutation({ mutationFn: (token: string) => callCommand(accept, { token }) });
}

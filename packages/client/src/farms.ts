import type { FarmId, FarmSettings } from "@arashan/core";
import { api } from "@arashan/backend/api";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";

import { callCommand } from "./errors";

/** The Operator's list of all Farms, the newest first: the name and whether a Member joined. */
export function useOperatorFarms() {
  return useQuery(convexQuery(api.farms.list, {}));
}

/** The Operator makes a Farm, and gets the token of the invite link of its first Admin. */
export function useCreateFarm() {
  const create = useConvexMutation(api.farms.create);
  return useMutation({
    mutationFn: (input: { name: string } & FarmSettings) => callCommand(create, input),
  });
}

/** The Operator makes a new invite link for the first Admin of a Farm with no Member. */
export function useInviteFarmAdmin() {
  const invite = useConvexMutation(api.farms.inviteAdmin);
  return useMutation({ mutationFn: (farmId: FarmId) => callCommand(invite, { farmId }) });
}

/** The Farm, with its settings. Fails with `farm.notMember` if the User is not a Member of it. */
export function useFarm(farmId: FarmId) {
  return useQuery(convexQuery(api.farms.get, { farmId }));
}

/** An Admin changes the settings of the Farm. */
export function useUpdateFarmSettings(farmId: FarmId) {
  const update = useConvexMutation(api.farms.updateSettings);
  return useMutation({
    mutationFn: (settings: FarmSettings) => callCommand(update, { farmId, ...settings }),
  });
}

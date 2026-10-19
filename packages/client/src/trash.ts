import type { FarmId, TrashKind } from "@arashan/core";
import { api } from "@arashan/backend/api";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";

import { callCommand } from "./errors";

/** The Deleted records of the Farm of all kinds, the one that became Deleted last first. */
export function useTrash(farmId: FarmId) {
  return useQuery(convexQuery(api.trash.list, { farmId }));
}

/** A Member restores a Deleted record, with the records that became Deleted with it. */
export function useRestoreFromTrash(farmId: FarmId) {
  const restore = useConvexMutation(api.trash.restore);
  return useMutation({
    mutationFn: (input: { kind: TrashKind; id: string }) =>
      callCommand(restore, { farmId, ...input }),
  });
}

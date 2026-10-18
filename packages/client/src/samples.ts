import type { SampleId } from "@arashan/core";
import { api } from "@arashan/backend/api";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";

import { callCommand } from "./errors";

// The hooks of the throwaway sample module of the core. Delete them with that module.

/** The Samples that are not Deleted, by name. */
export function useSamples() {
  return useQuery(convexQuery(api.samples.list, {}));
}

export function useAddSample() {
  const add = useConvexMutation(api.samples.add);
  return useMutation({ mutationFn: (input: { name: string }) => callCommand(add, input) });
}

export function useDeleteSample() {
  const remove = useConvexMutation(api.samples.delete);
  return useMutation({ mutationFn: (id: SampleId) => callCommand(remove, { id }) });
}

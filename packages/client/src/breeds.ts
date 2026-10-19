import type { BreedId, FarmId } from "@arashan/core";
import { api } from "@arashan/backend/api";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";

import { callCommand } from "./errors";

/**
 * The Breeds of the Farm: Arashan first, then by name, also the Archived ones. `inUse` marks a Breed
 * that a Sheep has: it can only become Archived.
 */
export function useBreeds(farmId: FarmId) {
  return useQuery(convexQuery(api.breeds.list, { farmId }));
}

/** A Member adds a Breed to the list of the Farm, and gets its id. */
export function useAddBreed(farmId: FarmId) {
  const add = useConvexMutation(api.breeds.add);
  return useMutation({
    mutationFn: (input: { name: string }) => callCommand(add, { farmId, ...input }),
  });
}

/** A Member renames a Breed. */
export function useRenameBreed(farmId: FarmId) {
  const rename = useConvexMutation(api.breeds.rename);
  return useMutation({
    mutationFn: (input: { breedId: BreedId; name: string }) =>
      callCommand(rename, { farmId, ...input }),
  });
}

/** A Member archives a Breed, or takes it out of the archive. */
export function useSetBreedArchived(farmId: FarmId) {
  const setArchived = useConvexMutation(api.breeds.setArchived);
  return useMutation({
    mutationFn: (input: { breedId: BreedId; archived: boolean }) =>
      callCommand(setArchived, { farmId, ...input }),
  });
}

/** A Member deletes a Breed added by mistake. A Breed in use can only become Archived. */
export function useDeleteBreed(farmId: FarmId) {
  const markDeleted = useConvexMutation(api.breeds.markDeleted);
  return useMutation({
    mutationFn: (breedId: BreedId) => callCommand(markDeleted, { farmId, breedId }),
  });
}

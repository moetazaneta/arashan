import type { BreedId } from "../ids";
import type { TrashType } from "../trash/trash";
import { restoreBreed } from "./commands";

/** A Deleted Breed as the Trash shows it. */
export interface TrashBreed {
  name: string;
}

/** The Breeds that a Member deleted. */
export const breedTrash: TrashType<"breed", TrashBreed> = {
  async list(ctx) {
    return (await ctx.repos.breeds.listDeleted()).map((breed) => ({
      kind: "breed",
      id: breed.id,
      deletedAt: breed.deletedAt,
      record: { name: breed.name },
    }));
  },
  restore: (ctx, id) => restoreBreed(ctx, id as BreedId),
};

import {
  addBreed,
  type BreedId,
  deleteBreed,
  listBreeds,
  renameBreed,
  setBreedArchived,
} from "@arashan/core";
import { v } from "convex/values";

import { farmCommand, farmQuery } from "./lib/functions";

// The Breed list of a Farm (the list «Породы»): Arashan, which each Farm has, and the Breeds that the
// Members add. The ids of Breeds are strings, not `v.id(…)`, as in sheep.ts: Arashan has the id
// "arashan", and an unknown id is a domain error.

/** The Breeds of the Farm: Arashan first, then by name, also the Archived ones. */
export const list = farmQuery({
  args: {},
  handler: (ctx) => listBreeds(ctx),
});

/** A Member adds a Breed to the list of the Farm, and gets its id. */
export const add = farmCommand({
  args: { name: v.string() },
  handler: (ctx, args) => addBreed(ctx, args),
});

/** A Member renames a Breed. */
export const rename = farmCommand({
  args: { breedId: v.string(), name: v.string() },
  handler: (ctx, args) => renameBreed(ctx, { breedId: args.breedId as BreedId, name: args.name }),
});

/** A Member archives a Breed, also one in use, or takes it out of the archive. */
export const setArchived = farmCommand({
  args: { breedId: v.string(), archived: v.boolean() },
  handler: (ctx, args) =>
    setBreedArchived(ctx, { breedId: args.breedId as BreedId, archived: args.archived }),
});

/**
 * A Member deletes a Breed that no Sheep uses: it becomes Deleted (ADR 0005). The name is not
 * `delete`, because that is a reserved word.
 */
export const markDeleted = farmCommand({
  args: { breedId: v.string() },
  handler: (ctx, args) => deleteBreed(ctx, { breedId: args.breedId as BreedId }),
});

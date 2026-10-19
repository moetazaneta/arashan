import { authorize } from "../access/permissions";
import { recordFarmAudit } from "../audit/audit";
import type { FarmCommandContext, FarmQueryContext } from "../context";
import { DomainError } from "../errors";
import type { BreedId } from "../ids";
import { arashanBreedId, type Breed, breedNameKey, maxBreedNameLength } from "./breed";

// The Breed list of a Farm: Arashan, which each Farm has, and the Breeds that the Members add. A
// Breed that a Sheep uses can only become Archived; a Breed that no Sheep uses can become Deleted.

/** A Breed as the list «Породы» and the forms show it. */
export interface BreedRow {
  id: BreedId;
  /** The name that a Member gave, or null for Arashan: the UI shows its name in its own language. */
  name: string | null;
  archived: boolean;
  /** True if a Sheep has a part of this Breed by hand: then the Breed can only become Archived. */
  inUse: boolean;
}

/** The Breeds of the Farm: Arashan first, then by name, also the Archived ones. */
export async function listBreeds(ctx: FarmQueryContext): Promise<BreedRow[]> {
  authorize(ctx.member, "breed.view", { farmId: ctx.farm.id });
  const used = await usedBreeds(ctx);
  const breeds = (await ctx.repos.breeds.list()).sort((a, b) => collator.compare(a.name, b.name));
  return [
    { id: arashanBreedId, name: null, archived: false, inUse: used.has(arashanBreedId) },
    ...breeds.map((breed) => ({
      id: breed.id,
      name: breed.name,
      archived: breed.archivedAt !== null,
      inUse: used.has(breed.id),
    })),
  ];
}

/** A Member adds a Breed to the list of the Farm. The name is unique in the Farm. */
export async function addBreed(ctx: FarmCommandContext, input: { name: string }): Promise<BreedId> {
  authorize(ctx.member, "breed.add", { farmId: ctx.farm.id });
  const name = validName(input.name);
  await requireFreeName(ctx, name, null);
  const breedId = await ctx.repos.breeds.insert({ name, archivedAt: null, createdAt: ctx.now() });
  await recordBreedAudit(ctx, "breed.add", breedId);
  return breedId;
}

/** A Member renames a Breed. A rename to the same name writes nothing. */
export async function renameBreed(
  ctx: FarmCommandContext,
  input: { breedId: BreedId; name: string },
): Promise<void> {
  authorize(ctx.member, "breed.update", { farmId: ctx.farm.id });
  const breed = await requireBreed(ctx, input.breedId);
  const name = validName(input.name);
  if (name === breed.name) return;
  await requireFreeName(ctx, name, breed.id);
  await ctx.repos.breeds.update(breed.id, { name });
  await recordBreedAudit(ctx, "breed.rename", breed.id);
}

/**
 * A Member archives a Breed, also one in use, or takes it out of the archive. The Sheep keep their
 * parts of an Archived Breed, but a form does not offer it. A change to the same state writes
 * nothing.
 */
export async function setBreedArchived(
  ctx: FarmCommandContext,
  input: { breedId: BreedId; archived: boolean },
): Promise<void> {
  authorize(ctx.member, "breed.update", { farmId: ctx.farm.id });
  const breed = await requireBreed(ctx, input.breedId);
  if ((breed.archivedAt !== null) === input.archived) return;
  await ctx.repos.breeds.update(breed.id, { archivedAt: input.archived ? ctx.now() : null });
  await recordBreedAudit(ctx, input.archived ? "breed.archive" : "breed.unarchive", breed.id);
}

/**
 * A Member deletes a Breed added by mistake: it becomes Deleted (ADR 0005). A Breed that a Sheep
 * uses can only become Archived (`breed.inUse`).
 */
export async function deleteBreed(
  ctx: FarmCommandContext,
  input: { breedId: BreedId },
): Promise<void> {
  authorize(ctx.member, "breed.delete", { farmId: ctx.farm.id });
  const breed = await requireBreed(ctx, input.breedId);
  if ((await usedBreeds(ctx)).has(breed.id)) throw new DomainError("breed.inUse");
  await ctx.repos.breeds.markDeleted(breed.id, ctx.now());
  await recordBreedAudit(ctx, "breed.delete", breed.id);
}

/**
 * The Breeds that the Sheep of the Farm have by hand. Each part of a Breed composition comes from
 * the parts by hand of a Sheep or of its ancestors, so a Breed that is not here is in no composition.
 */
async function usedBreeds(ctx: FarmQueryContext | FarmCommandContext): Promise<Set<BreedId>> {
  const used = new Set<BreedId>();
  for (const sheep of await ctx.repos.sheep.list()) {
    for (const part of sheep.manualBreeds) used.add(part.breedId);
  }
  return used;
}

/** The Breed of the Farm, or `breed.notFound`; Arashan gives `breed.arashanLocked`. */
async function requireBreed(ctx: FarmCommandContext, id: BreedId): Promise<Breed> {
  if (id === arashanBreedId) throw new DomainError("breed.arashanLocked");
  const breed = await ctx.repos.breeds.get(id);
  if (breed === null) throw new DomainError("breed.notFound");
  return breed;
}

/** Throws `breed.nameTaken` if another Breed of the Farm, also an Archived one, has the name. */
async function requireFreeName(
  ctx: FarmCommandContext,
  name: string,
  self: BreedId | null,
): Promise<void> {
  const same = await ctx.repos.breeds.findByName(name);
  if (same.some((other) => other.id !== self)) throw new DomainError("breed.nameTaken");
}

/** The name with the spaces trimmed, or a domain error. */
function validName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed === "") throw new DomainError("breed.nameRequired");
  if (trimmed.length > maxBreedNameLength) throw new DomainError("breed.nameTooLong");
  // Arashan is built in: another Breed with its name would be the same Breed twice.
  if (arashanNames.has(breedNameKey(trimmed))) throw new DomainError("breed.nameTaken");
  return trimmed;
}

function recordBreedAudit(
  ctx: FarmCommandContext,
  command: "breed.add" | "breed.rename" | "breed.archive" | "breed.unarchive" | "breed.delete",
  breedId: BreedId,
): Promise<void> {
  return recordFarmAudit(ctx, { command, target: { kind: "Breed", id: breedId } });
}

const collator = new Intl.Collator("ru", { numeric: true });

/** The keys of the names of Arashan, in Russian and in English. */
const arashanNames = new Set(["арашан", "arashan"].map(breedNameKey));

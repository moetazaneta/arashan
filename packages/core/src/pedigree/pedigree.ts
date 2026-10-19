import { DomainError } from "../errors";
import type { SheepId } from "../ids";
import type { Sheep } from "../sheep/sheep";
import { type BreedComposition, compositionOf } from "./composition";

// The pedigree of a Sheep: its parents, and the Breed composition that comes from them. The app
// stores only the parents and the parts by hand, and computes each composition when it reads it, so
// a change of a Sheep changes the composition of all its descendants at once.

/** The fields of a Sheep that its pedigree uses. */
export type PedigreeSheep = Pick<
  Sheep,
  "id" | "sex" | "birthDate" | "motherId" | "fatherId" | "manualBreeds" | "passport"
>;

/** Gives a Sheep of the Farm, or null if there is none or it is Deleted. */
export type SheepLookup<Item extends PedigreeSheep = PedigreeSheep> = (
  id: SheepId,
) => Promise<Item | null>;

/**
 * The lookup that reads each Sheep one time: a command that checks the parents, the ancestors and
 * the Breed composition reads each ancestor only once.
 */
export function cachedLookup<Item extends PedigreeSheep>(
  lookup: SheepLookup<Item>,
): SheepLookup<Item> {
  const cache = new Map<SheepId, Promise<Item | null>>();
  return (id) => {
    let found = cache.get(id);
    if (found === undefined) {
      found = lookup(id);
      cache.set(id, found);
    }
    return found;
  };
}

/**
 * Computes the Breed composition of Sheep from their parents. It remembers each answer, so a query
 * of many Sheep computes each ancestor one time.
 */
export function compositions(
  lookup: SheepLookup,
): (sheep: PedigreeSheep) => Promise<BreedComposition> {
  const memo = new Map<SheepId, Promise<BreedComposition>>();

  const of = (sheep: PedigreeSheep, path: ReadonlySet<SheepId>): Promise<BreedComposition> => {
    const known = memo.get(sheep.id);
    if (known !== undefined) return known;
    const result = (async () => {
      const inner = new Set(path).add(sheep.id);
      const parent = async (id: SheepId | null) => {
        // A cycle cannot happen (`requireParents`), but a broken record must not hang a query.
        if (id === null || inner.has(id)) return null;
        const found = await lookup(id);
        return found === null ? null : of(found, inner);
      };
      const [mother, father] = await Promise.all([parent(sheep.motherId), parent(sheep.fatherId)]);
      return compositionOf(mother, father, sheep.manualBreeds);
    })();
    memo.set(sheep.id, result);
    return result;
  };

  return (sheep) => of(sheep, new Set());
}

/** The number of the parents of a Sheep that are known. */
export function knownParents(sheep: Pick<Sheep, "motherId" | "fatherId">): 0 | 1 | 2 {
  return ((sheep.motherId === null ? 0 : 1) + (sheep.fatherId === null ? 0 : 1)) as 0 | 1 | 2;
}

/**
 * Checks the parents of a Sheep: each one is a Sheep of the Farm (also an External one, or one that
 * is not Active), the Mother is an Ewe, the Father is a Ram, each one was born before the child if
 * both dates are known, and the child is not an ancestor of a parent. `child.id` is null for a new
 * Sheep, which has no descendants yet.
 */
export async function requireParents(
  lookup: SheepLookup,
  child: Pick<Sheep, "birthDate" | "motherId" | "fatherId"> & { id: SheepId | null },
): Promise<void> {
  const check = async (id: SheepId | null, sex: Sheep["sex"]) => {
    if (id === null) return;
    if (id === child.id) throw new DomainError("pedigree.ownAncestor");
    const parent = await lookup(id);
    if (parent === null) throw new DomainError("pedigree.parentNotFound");
    if (parent.sex !== sex) {
      throw new DomainError(sex === "ewe" ? "pedigree.motherNotEwe" : "pedigree.fatherNotRam");
    }
    if (bornNotBefore(parent.birthDate, child.birthDate)) {
      throw new DomainError("pedigree.parentBornAfterChild");
    }
    if (child.id !== null && (await hasAncestor(lookup, parent, child.id))) {
      throw new DomainError("pedigree.ownAncestor");
    }
  };
  await check(child.motherId, "ewe");
  await check(child.fatherId, "ram");
}

/** True if both dates are known and the parent was not born before the child. */
export function bornNotBefore(
  parentBirthDate: Sheep["birthDate"],
  childBirthDate: Sheep["birthDate"],
): boolean {
  return parentBirthDate !== null && childBirthDate !== null && parentBirthDate >= childBirthDate;
}

/** True if the Sheep with the id is an ancestor of the Sheep. */
async function hasAncestor(
  lookup: SheepLookup,
  sheep: PedigreeSheep,
  id: SheepId,
): Promise<boolean> {
  const seen = new Set<SheepId>([sheep.id]);
  const queue: PedigreeSheep[] = [sheep];
  while (queue.length > 0) {
    const next = queue.shift()!;
    for (const parentId of [next.motherId, next.fatherId]) {
      if (parentId === null || seen.has(parentId)) continue;
      if (parentId === id) return true;
      seen.add(parentId);
      const parent = await lookup(parentId);
      if (parent !== null) queue.push(parent);
    }
  }
  return false;
}

import { arashanBreedId } from "../breeds/breed";
import { DomainError } from "../errors";
import type { BreedId } from "../ids";

// The Breed composition of a Sheep: the part of each Breed, and the Unknown part. A part is an integer
// in millionths of the whole, so that the sum is exact and "100 percent Arashan" is an equality.

/** The whole of a Breed composition, 100 percent. A part of 125 000 is 12.5 percent. */
export const wholeShare = 1_000_000;

/** The part of one Breed in a Sheep, in millionths (`wholeShare` is 100 percent). */
export interface BreedShare {
  breedId: BreedId;
  share: number;
}

/**
 * The part of each Breed in one Sheep, and the Unknown part. The parts and the Unknown part sum to
 * `wholeShare`.
 */
export interface BreedComposition {
  /** The known parts, each more than zero: the largest first, then by the id of the Breed. */
  breeds: BreedShare[];
  unknown: number;
}

/** The part of the Breed composition that a Member can give by hand, for 0, 1 or 2 known parents. */
export function manualLimit(knownParents: 0 | 1 | 2): number {
  return (wholeShare / 2) * (2 - knownParents);
}

/**
 * The Breed composition of a Sheep: the average of its parents. A parent that is not known gives
 * its half as the Unknown part, less the parts that a Member gave by hand. A Sheep without known
 * parents has only the parts by hand, and the rest is Unknown.
 */
export function compositionOf(
  mother: BreedComposition | null,
  father: BreedComposition | null,
  manualBreeds: readonly BreedShare[],
): BreedComposition {
  const known = [mother, father].filter((parent) => parent !== null);
  const manual = manualBreeds.reduce((sum, part) => sum + part.share, 0);
  if (known.length === 0) {
    return normalize(manualBreeds, wholeShare - manual);
  }
  const [first, second] = known;
  if (second !== undefined) return average(first!, second);
  // The unknown parent as a whole Sheep: twice its half, so that the average gives the half back.
  const unknownParent = normalize(
    manualBreeds.map((part) => ({ breedId: part.breedId, share: part.share * 2 })),
    wholeShare - manual * 2,
  );
  return average(first!, unknownParent);
}

/** The part of Arashan in the composition. */
export function arashanShare(composition: BreedComposition): number {
  return composition.breeds.find((part) => part.breedId === arashanBreedId)?.share ?? 0;
}

/** True for 100 percent Arashan and 0 percent Unknown: only such a Sheep can have a Passport. */
export function isPureArashan(composition: BreedComposition): boolean {
  return arashanShare(composition) === wholeShare;
}

export function sameComposition(a: BreedComposition, b: BreedComposition): boolean {
  return (
    a.unknown === b.unknown &&
    a.breeds.length === b.breeds.length &&
    a.breeds.every(
      (part, index) =>
        part.breedId === b.breeds[index]?.breedId && part.share === b.breeds[index]?.share,
    )
  );
}

/**
 * The parts by hand, sorted, or `sheep.breedsInvalid` if a part is not a positive integer or a Breed
 * comes twice, and `sheep.breedsTooLarge` if they are more than the Member can give by hand.
 */
export function validManualBreeds(
  manualBreeds: readonly BreedShare[],
  knownParents: 0 | 1 | 2,
): BreedShare[] {
  const seen = new Set<BreedId>();
  let sum = 0;
  for (const part of manualBreeds) {
    if (!Number.isSafeInteger(part.share) || part.share <= 0 || seen.has(part.breedId)) {
      throw new DomainError("sheep.breedsInvalid");
    }
    seen.add(part.breedId);
    sum += part.share;
  }
  if (sum > manualLimit(knownParents)) throw new DomainError("sheep.breedsTooLarge");
  return normalize(manualBreeds, 0).breeds;
}

// The key of the Unknown part in a sum. No Breed has an empty id.
const unknownKey = "";

/**
 * The average of two compositions. When the two parts of a Breed sum to an odd number, the half is
 * not an integer: the largest remainder method then gives the extra millionths to the largest
 * parts, so that the sum stays `wholeShare`. This starts only after about six generations, and the
 * difference is one millionth.
 */
function average(a: BreedComposition, b: BreedComposition): BreedComposition {
  const sums = new Map<string, number>();
  for (const composition of [a, b]) {
    for (const part of composition.breeds) {
      sums.set(part.breedId, (sums.get(part.breedId) ?? 0) + part.share);
    }
    sums.set(unknownKey, (sums.get(unknownKey) ?? 0) + composition.unknown);
  }
  const halves = new Map<string, number>();
  const odd: [string, number][] = [];
  for (const [key, sum] of sums) {
    halves.set(key, Math.floor(sum / 2));
    if (sum % 2 === 1) odd.push([key, sum]);
  }
  // The number of odd sums is even, because all sums together are 2 × wholeShare.
  odd.sort(
    ([keyA, sumA], [keyB, sumB]) =>
      sumB - sumA || unknownLast(keyA, keyB) || keyA.localeCompare(keyB),
  );
  for (const [key] of odd.slice(0, odd.length / 2)) halves.set(key, halves.get(key)! + 1);
  const unknown = halves.get(unknownKey) ?? 0;
  halves.delete(unknownKey);
  return normalize(
    [...halves].map(([breedId, share]) => ({ breedId: breedId as BreedId, share })),
    unknown,
  );
}

function unknownLast(a: string, b: string): number {
  return Number(a === unknownKey) - Number(b === unknownKey);
}

/** The composition with the parts of zero left out, the largest first, then by the id of the Breed. */
function normalize(breeds: readonly BreedShare[], unknown: number): BreedComposition {
  return {
    breeds: breeds
      .filter((part) => part.share > 0)
      .map((part) => ({ breedId: part.breedId, share: part.share }))
      .sort((a, b) => b.share - a.share || a.breedId.localeCompare(b.breedId)),
    unknown,
  };
}

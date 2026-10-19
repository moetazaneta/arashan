import type { BreedId, FarmId } from "../ids";
import { tagKey } from "../sheep/sheep";
import type { Deleted } from "../trash/trash";

/**
 * The id of the Breed Arashan, the main Breed. Each Farm has it from the start: it is built into the
 * app, not a record of the Farm, so a Member cannot rename, archive or delete it. The UI shows its
 * name in the language of the UI.
 */
export const arashanBreedId = "arashan" as BreedId;

/** A Breed that a Member added to the list of the Farm. Arashan is not one: see `arashanBreedId`. */
export interface Breed {
  id: BreedId;
  farmId: FarmId;
  name: string;
  /** When a Member archived the Breed, or null. A form does not offer an Archived Breed. */
  archivedAt: number | null;
  /** When a Member added the Breed, in milliseconds since the Unix epoch. */
  createdAt: number;
}

/** The longest name of a Breed. */
export const maxBreedNameLength = 60;

/**
 * The key that compares the names of two Breeds, as `tagKey` compares Tags: the case, the spaces at
 * the ends, and the Cyrillic letters that look like Latin ones do not count.
 */
export function breedNameKey(name: string): string {
  return tagKey(name);
}

/**
 * Reads the Breeds of one Farm. The backend binds it to the Farm, so it never gives a Breed of
 * another Farm. Each method hides Deleted Breeds (ADR 0005) and shows the Archived ones.
 */
export interface FarmBreedReader {
  /** The Breed, or null if the Farm has none with this id, or it is Deleted. */
  get(id: BreedId): Promise<Breed | null>;
  /** All Breeds of the Farm, also the Archived ones. */
  list(): Promise<Breed[]>;
  /** The Breeds whose name has the same key (`breedNameKey`) as this name. */
  findByName(name: string): Promise<Breed[]>;
  /** The Deleted Breeds of the Farm, for the Trash, in no order. */
  listDeleted(): Promise<Deleted<Breed>[]>;
}

/** Reads and writes the Breeds of one Farm. Nothing erases a Breed. */
export interface FarmBreedRepository extends FarmBreedReader {
  insert(breed: Omit<Breed, "id" | "farmId">): Promise<BreedId>;
  update(id: BreedId, fields: Partial<Pick<Breed, "name" | "archivedAt">>): Promise<void>;
  /** Makes the Breed Deleted. A Member can restore it later. */
  markDeleted(id: BreedId, deletedAt: number): Promise<void>;
  /** The Breed if it is Deleted, for its restore; else null. */
  getDeleted(id: BreedId): Promise<Breed | null>;
  /** Makes a Deleted Breed not Deleted: a Member restored it from the Trash. */
  markRestored(id: BreedId): Promise<void>;
}

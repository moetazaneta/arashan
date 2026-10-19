import type { FarmCommandContext, FarmQueryContext } from "../context";

// The Trash («Корзина») lists the Deleted records of a Farm, and a Member restores them (ADR 0005).
// Each module with records that a Member can delete gives one `TrashType` in its file `trash.ts`:
// what the list shows of a record, and its restore with the rules of the module. `trashTypes` in
// `trash/registry.ts` lists them, so a new kind of record plugs in with one line there.

/** A record with the time when it became Deleted, as a method of a repository for the Trash gives it. */
export type Deleted<T> = T & { deletedAt: number };

/** One record in the Trash: its kind, its id, when it became Deleted, and what the list shows. */
export interface TrashEntry<Kind extends string, Shown> {
  kind: Kind;
  id: string;
  /** When the record became Deleted, in milliseconds since the Unix epoch. */
  deletedAt: number;
  record: Shown;
}

/**
 * One kind of record in the Trash. A record that belongs to another one (the Automatic record of a
 * deal, the Sheep of a Purchase) is not an entry of its own: it comes back with that record.
 */
export interface TrashType<Kind extends string, Shown> {
  /** The Deleted records of the kind that the Trash shows, in no order. */
  list(ctx: FarmQueryContext): Promise<TrashEntry<Kind, Shown>[]>;
  /**
   * Restores one record: checks all the rules first, then makes the record and its parts not
   * Deleted, and appends an audit entry for each record that it changes. Throws `trash.notFound` if
   * the Trash has no record of the kind with this id, or the error of the first rule that the restore
   * breaks. The command checks the permission before it calls this.
   */
  restore(ctx: FarmCommandContext, id: string): Promise<void>;
}

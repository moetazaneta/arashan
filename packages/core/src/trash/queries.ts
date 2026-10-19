import { authorize } from "../access/permissions";
import type { FarmQueryContext } from "../context";
import { type TrashItem, trashTypes } from "./registry";

/**
 * The Trash of the Farm: its Deleted records of all kinds, the one that became Deleted last first.
 * A record that belongs to another one, such as the Automatic record of a cancelled deal, is not in
 * the list: it comes back with that record.
 */
export async function listTrash(ctx: FarmQueryContext): Promise<TrashItem[]> {
  authorize(ctx.member, "trash.view", { farmId: ctx.farm.id });
  const lists: TrashItem[][] = await Promise.all(
    Object.values(trashTypes).map((type) => type.list(ctx)),
  );
  return lists.flat().sort((a, b) => b.deletedAt - a.deletedAt);
}

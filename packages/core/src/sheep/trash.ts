import type { SheepId } from "../ids";
import type { TrashType } from "../trash/trash";
import { restoreSheep } from "./commands";
import type { SheepRef } from "./queries";
import type { SheepStatus } from "./sheep";

/** A Deleted Sheep as the Trash shows it. */
export interface TrashSheep extends SheepRef {
  status: SheepStatus;
}

/**
 * The Sheep that a Member deleted, also the External ones. The Sheep of a cancelled Purchase come
 * back with their Purchase, so the Trash shows the Purchase and not them.
 */
export const sheepTrash: TrashType<"sheep", TrashSheep> = {
  async list(ctx) {
    return (await ctx.repos.sheep.listDeleted())
      .filter((sheep) => sheep.purchaseId === null)
      .map((sheep) => ({
        kind: "sheep",
        id: sheep.id,
        deletedAt: sheep.deletedAt,
        record: {
          id: sheep.id,
          tag: sheep.tag,
          name: sheep.name,
          sex: sheep.sex,
          origin: sheep.origin,
          status: sheep.status,
        },
      }));
  },
  restore: (ctx, id) => restoreSheep(ctx, id as SheepId),
};

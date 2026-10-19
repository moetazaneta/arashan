import { authorize } from "../access/permissions";
import type { FarmCommandContext } from "../context";
import { DomainError } from "../errors";
import { isTrashKind, type TrashKind, trashTypes } from "./registry";

/**
 * A Member restores a Deleted record from the Trash (ADR 0005). The record comes back as it was, with
 * the records that became Deleted with it: a cancelled deal with its Automatic record and the Sheep
 * of a Purchase, a cancelled Restock with its Automatic Expense. If the restore breaks a rule, for
 * example the Tag of a Sheep is now the Tag of another Sheep, it fails with the error of the rule and
 * writes nothing. Each record that comes back gets an audit entry. An unknown kind or a record that
 * is not in the Trash gives `trash.notFound`.
 */
export async function restoreFromTrash(
  ctx: FarmCommandContext,
  input: { kind: TrashKind; id: string },
): Promise<void> {
  authorize(ctx.member, "trash.restore", { farmId: ctx.farm.id });
  if (!isTrashKind(input.kind)) throw new DomainError("trash.notFound");
  await trashTypes[input.kind].restore(ctx, input.id);
}

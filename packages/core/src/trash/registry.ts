import { breedTrash } from "../breeds/trash";
import { dealTrash } from "../deals/trash";
import { shepherdAssignmentTrash } from "../flocks/trash";
import { moneyCategoryTrash, moneyRecordTrash } from "../money/trash";
import { resourceEventTrash } from "../resources/trash";
import { sheepTrash } from "../sheep/trash";

/**
 * The kinds of records in the Trash, each with its `TrashType`. A module with records that a Member
 * deletes adds its kind here: the list of the Trash, the restore command and the backend take it from
 * here, and the web app shows it with a label of the kind.
 */
export const trashTypes = {
  sheep: sheepTrash,
  deal: dealTrash,
  moneyRecord: moneyRecordTrash,
  moneyCategory: moneyCategoryTrash,
  resourceEvent: resourceEventTrash,
  breed: breedTrash,
  shepherdAssignment: shepherdAssignmentTrash,
};

/** The kind of a record in the Trash. */
export type TrashKind = keyof typeof trashTypes;

/** The kinds of records in the Trash. */
export const trashKinds = Object.keys(trashTypes) as TrashKind[];

/** A record in the Trash, of any kind: `kind` tells which, and `record` has what the list shows. */
export type TrashItem = {
  [Kind in TrashKind]: Awaited<ReturnType<(typeof trashTypes)[Kind]["list"]>>[number];
}[TrashKind];

/** True if the value is the kind of a record in the Trash. */
export function isTrashKind(value: string): value is TrashKind {
  return Object.hasOwn(trashTypes, value);
}

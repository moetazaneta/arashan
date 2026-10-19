import { listTrash, restoreFromTrash, type TrashKind } from "@arashan/core";
import { v } from "convex/values";

import { farmCommand, farmQuery } from "./lib/functions";

// The Trash of a Farm: its Deleted records, and the restore of one. The kind is a string, not a
// union of literals: the core checks it (`trash.notFound`), so a new kind of record in the Trash
// needs no change here.

/** The Deleted records of the Farm of all kinds, the one that became Deleted last first. */
export const list = farmQuery({
  args: {},
  handler: (ctx) => listTrash(ctx),
});

/** A Member restores a Deleted record, with the records that became Deleted with it. */
export const restore = farmCommand({
  args: { kind: v.string(), id: v.string() },
  handler: (ctx, args) => restoreFromTrash(ctx, { kind: args.kind as TrashKind, id: args.id }),
});

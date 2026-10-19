import {
  archiveMoneyCategory,
  createMoneyCategory,
  createMoneyRecord,
  deleteMoneyCategory,
  deleteMoneyRecord,
  ensureFarmMoneyCategories,
  listMoneyCategories,
  listMoneyRecords,
  type MoneyCategoryId,
  type MoneyRecordId,
  type MoneyRecordInput,
  type MoneyScope,
  renameMoneyCategory,
  type ShepherdId,
  unarchiveMoneyCategory,
  updateMoneyRecord,
} from "@arashan/core";
import { type Infer, v } from "convex/values";

import { farmCommand, farmQuery } from "./lib/functions";

// The Expenses and the Incomes of a Farm, and their categories. The ids are strings, not `v.id(…)`:
// the core gets its own ids, and an unknown id is a domain error. A date is "YYYY-MM-DD", and an
// amount is an integer of hundredths of the currency unit of the Farm.

const kind = v.union(v.literal("expense"), v.literal("income"));
/** A text that the Member can leave empty. */
const optionalText = v.union(v.string(), v.null());
/** What a record is about: the Farm as a whole, a Flock or a Sheep. */
const scope = v.union(
  v.object({ kind: v.literal("farm") }),
  v.object({ kind: v.literal("flock"), flockId: v.string() }),
  v.object({ kind: v.literal("sheep"), sheepId: v.string() }),
);
/** The fields of the form of an Expense or an Income. */
const fields = {
  date: v.string(),
  amount: v.number(),
  categoryId: v.string(),
  scope,
  shepherdId: v.union(v.string(), v.null()),
  notes: optionalText,
};

/** The fields of the form, with the ids of the core. */
function recordInput(args: Infer<ReturnType<typeof v.object<typeof fields>>>): MoneyRecordInput {
  return {
    ...args,
    categoryId: args.categoryId as MoneyCategoryId,
    scope: args.scope as MoneyScope,
    shepherdId: args.shepherdId as ShepherdId | null,
  };
}

/** The categories of Expenses or of Incomes, also the Archived ones, in the order of the list. */
export const categories = farmQuery({
  args: { kind },
  handler: (ctx, args) => listMoneyCategories(ctx, args),
});

/** The Expenses or the Incomes that the filter selects, the newest first, and their total. */
export const list = farmQuery({
  args: {
    kind,
    from: optionalText,
    to: optionalText,
    categoryId: v.union(v.string(), v.null()),
    scope: v.union(scope, v.null()),
  },
  handler: (ctx, args) =>
    listMoneyRecords(ctx, {
      ...args,
      categoryId: args.categoryId as MoneyCategoryId | null,
      scope: args.scope as MoneyScope | null,
    }),
});

/** A Member records an Expense or an Income, and gets its id. */
export const create = farmCommand({
  args: { kind, ...fields },
  handler: (ctx, { kind, ...args }) => createMoneyRecord(ctx, { kind, ...recordInput(args) }),
});

/** A Member changes an Expense or an Income. */
export const update = farmCommand({
  args: { recordId: v.string(), ...fields },
  handler: (ctx, { recordId, ...args }) =>
    updateMoneyRecord(ctx, { recordId: recordId as MoneyRecordId, ...recordInput(args) }),
});

/** A Member deletes an Expense or an Income made by mistake: it becomes Deleted. */
export const remove = farmCommand({
  args: { recordId: v.string() },
  handler: (ctx, args) => deleteMoneyRecord(ctx, { recordId: args.recordId as MoneyRecordId }),
});

/**
 * The lazy migration: a Farm that existed before the Expenses and Incomes gets the default lists of
 * categories. The client calls it when a list is empty. Gives the number of categories it made.
 */
export const ensureCategories = farmCommand({
  args: {},
  handler: (ctx) => ensureFarmMoneyCategories(ctx),
});

/** A Member adds a category of Expenses or of Incomes, and gets its id. */
export const createCategory = farmCommand({
  args: { kind, name: v.string() },
  handler: (ctx, args) => createMoneyCategory(ctx, args),
});

/** A Member renames a category that is not a System category. */
export const renameCategory = farmCommand({
  args: { categoryId: v.string(), name: v.string() },
  handler: (ctx, args) =>
    renameMoneyCategory(ctx, { categoryId: args.categoryId as MoneyCategoryId, name: args.name }),
});

/** A Member archives a category that is not a System category. */
export const archiveCategory = farmCommand({
  args: { categoryId: v.string() },
  handler: (ctx, args) =>
    archiveMoneyCategory(ctx, { categoryId: args.categoryId as MoneyCategoryId }),
});

/** A Member takes a category out of the archive. */
export const unarchiveCategory = farmCommand({
  args: { categoryId: v.string() },
  handler: (ctx, args) =>
    unarchiveMoneyCategory(ctx, { categoryId: args.categoryId as MoneyCategoryId }),
});

/** A Member deletes a category that no record uses: it becomes Deleted. */
export const deleteCategory = farmCommand({
  args: { categoryId: v.string() },
  handler: (ctx, args) =>
    deleteMoneyCategory(ctx, { categoryId: args.categoryId as MoneyCategoryId }),
});

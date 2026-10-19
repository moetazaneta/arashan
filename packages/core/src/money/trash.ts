import type { CalendarDate } from "../dates";
import type { MoneyCategoryId, MoneyRecordId } from "../ids";
import type { TrashType } from "../trash/trash";
import { restoreMoneyCategory, restoreMoneyRecord } from "./commands";
import type { MoneyCategory, MoneyKind } from "./money";
import { categoryRef, categoryRefOf, type MoneyCategoryRef } from "./queries";

/** A Deleted Expense or Income as the Trash shows it. */
export interface TrashMoneyRecord {
  kind: MoneyKind;
  date: CalendarDate;
  /** In hundredths of the currency unit of the Farm. */
  amount: number;
  category: MoneyCategoryRef;
  notes: string | null;
}

/**
 * The Expenses and the Incomes that a Member deleted. An Automatic record comes back with its event,
 * so the Trash shows the event and not the record.
 */
export const moneyRecordTrash: TrashType<"moneyRecord", TrashMoneyRecord> = {
  async list(ctx) {
    const records = (await ctx.repos.moneyRecords.listDeleted()).filter(
      (record) => record.source === null,
    );
    if (records.length === 0) return [];
    // A category that a record has, also a Deleted record, is never Deleted.
    const categories = new Map<MoneyCategoryId, MoneyCategory>();
    for (const category of [
      ...(await ctx.repos.moneyCategories.list("expense")),
      ...(await ctx.repos.moneyCategories.list("income")),
    ]) {
      categories.set(category.id, category);
    }
    return records.map((record) => ({
      kind: "moneyRecord",
      id: record.id,
      deletedAt: record.deletedAt,
      record: {
        kind: record.kind,
        date: record.date,
        amount: record.amount,
        category: categoryRefOf(categories, record.categoryId),
        notes: record.notes,
      },
    }));
  },
  restore: (ctx, id) => restoreMoneyRecord(ctx, id as MoneyRecordId),
};

/** A Deleted category as the Trash shows it. */
export interface TrashMoneyCategory extends MoneyCategoryRef {
  kind: MoneyKind;
}

/** The categories of Expenses and of Incomes that a Member deleted. */
export const moneyCategoryTrash: TrashType<"moneyCategory", TrashMoneyCategory> = {
  async list(ctx) {
    return (await ctx.repos.moneyCategories.listDeleted()).map((category) => ({
      kind: "moneyCategory",
      id: category.id,
      deletedAt: category.deletedAt,
      record: { ...categoryRef(category), kind: category.kind },
    }));
  },
  restore: (ctx, id) => restoreMoneyCategory(ctx, id as MoneyCategoryId),
};

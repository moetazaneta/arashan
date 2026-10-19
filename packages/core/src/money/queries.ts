import { authorize } from "../access/permissions";
import type { FarmQueryContext } from "../context";
import { type CalendarDate, isCalendarDate } from "../dates";
import { DomainError } from "../errors";
import type { Shepherd } from "../flocks/flock";
import { type FlockRef, flockRefOf, flocksById, type ShepherdRef } from "../flocks/queries";
import type { MoneyCategoryId, MoneyRecordId, SheepId, ShepherdId } from "../ids";
import {
  type CategoryKey,
  defaultCategoryKeys,
  isSystemCategory,
  type MoneyCategory,
  type MoneyKind,
  type MoneyRecord,
  type MoneyScope,
  type MoneySource,
  sameScope,
} from "./money";

// The queries of the Expenses, the Incomes and their categories. A list shows the Archived
// categories too, with the flag `archived`: the records and the filters show them, and a form leaves
// them out.

/** A category as a record shows it. The UI shows the `name`, or the name of the `key` if it is null. */
export interface MoneyCategoryRef {
  id: MoneyCategoryId;
  key: CategoryKey | null;
  name: string | null;
  system: boolean;
  archived: boolean;
}

/** A category as its list shows it. */
export interface MoneyCategoryRow extends MoneyCategoryRef {
  kind: MoneyKind;
  /**
   * True if a record, also a Deleted one, has the category: then a Member can archive it, but not
   * delete it.
   */
  inUse: boolean;
}

/** A Sheep as a money record shows it. A Sheep that became Deleted has no Tag and no name here. */
export interface MoneySheepRef {
  id: SheepId;
  tag: string | null;
  name: string | null;
}

/** The scope of a record, with the name of its Flock or the Tag of its Sheep. */
export type MoneyScopeRef =
  | { kind: "farm" }
  | { kind: "flock"; flock: FlockRef }
  | { kind: "sheep"; sheep: MoneySheepRef };

/** An Expense or an Income as its table shows it. */
export interface MoneyRecordRow {
  id: MoneyRecordId;
  kind: MoneyKind;
  date: CalendarDate;
  /** In hundredths of the currency unit of the Farm. */
  amount: number;
  category: MoneyCategoryRef;
  scope: MoneyScopeRef;
  shepherd: ShepherdRef | null;
  notes: string | null;
  /** The event of an Automatic record, or null for a record that a Member made. */
  source: MoneySource | null;
}

/** What the table of Expenses or of Incomes shows. A null filter shows all. */
export interface MoneyRecordFilter {
  kind: MoneyKind;
  /** The first day of the period, both days included. */
  from: CalendarDate | null;
  /** The last day of the period. */
  to: CalendarDate | null;
  categoryId: MoneyCategoryId | null;
  /** Only the records of this scope: of the Farm as a whole, of this Flock, or of this Sheep. */
  scope: MoneyScope | null;
}

/** The records that a filter selects, and the sum of their amounts. */
export interface MoneyRecordList {
  records: MoneyRecordRow[];
  /** The sum of the amounts, in hundredths of the currency unit. */
  total: number;
}

/**
 * The categories of Expenses or of Incomes, in the order of the list: the default categories, the
 * categories that the Members made by name, and the System categories last.
 */
export async function listMoneyCategories(
  ctx: FarmQueryContext,
  input: { kind: MoneyKind },
): Promise<MoneyCategoryRow[]> {
  authorize(ctx.member, "money.view", { farmId: ctx.farm.id });
  const categories = (await ctx.repos.moneyCategories.list(input.kind)).sort(inListOrder);
  return Promise.all(
    categories.map(async (category) => ({
      ...categoryRef(category),
      kind: category.kind,
      inUse: await ctx.repos.moneyRecords.usesCategoryWithDeleted(category.id),
    })),
  );
}

/**
 * The Expenses or the Incomes that the filter selects, the newest first, and their total. The period
 * has real dates, and its first day is not after its last day (`money.periodInvalid`).
 */
export async function listMoneyRecords(
  ctx: FarmQueryContext,
  filter: MoneyRecordFilter,
): Promise<MoneyRecordList> {
  authorize(ctx.member, "money.view", { farmId: ctx.farm.id });
  if (
    (filter.from !== null && !isCalendarDate(filter.from)) ||
    (filter.to !== null && !isCalendarDate(filter.to)) ||
    (filter.from !== null && filter.to !== null && filter.from > filter.to)
  ) {
    throw new DomainError("money.periodInvalid");
  }
  const records = (
    await ctx.repos.moneyRecords.list(filter.kind, { from: filter.from, to: filter.to })
  ).filter(
    (record) =>
      (filter.categoryId === null || record.categoryId === filter.categoryId) &&
      (filter.scope === null || sameScope(record.scope, filter.scope)),
  );
  const [categories, flocks, shepherds, sheep] = await Promise.all([
    ctx.repos.moneyCategories.list(filter.kind),
    flocksById(ctx),
    ctx.repos.shepherds.list(),
    sheepOf(ctx, records),
  ]);
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const shepherdById = new Map(shepherds.map((shepherd) => [shepherd.id, shepherd]));
  const rows = records.sort(newestFirst).map((record): MoneyRecordRow => ({
    id: record.id,
    kind: record.kind,
    date: record.date,
    amount: record.amount,
    category: categoryRefOf(categoryById, record.categoryId),
    scope:
      record.scope.kind === "farm"
        ? { kind: "farm" }
        : record.scope.kind === "flock"
          ? { kind: "flock", flock: flockRefOf(flocks, record.scope.flockId) }
          : {
              kind: "sheep",
              sheep: sheep.get(record.scope.sheepId) ?? {
                id: record.scope.sheepId,
                tag: null,
                name: null,
              },
            },
    shepherd: record.shepherdId === null ? null : shepherdRefOf(shepherdById, record.shepherdId),
    notes: record.notes,
    source: record.source,
  }));
  return { records: rows, total: rows.reduce((sum, row) => sum + row.amount, 0) };
}

/** The Sheep of the records, each read one time. */
async function sheepOf(
  ctx: FarmQueryContext,
  records: readonly MoneyRecord[],
): Promise<Map<SheepId, MoneySheepRef>> {
  const ids = new Set(
    records.flatMap((record) => (record.scope.kind === "sheep" ? [record.scope.sheepId] : [])),
  );
  const refs = new Map<SheepId, MoneySheepRef>();
  for (const id of ids) {
    const sheep = await ctx.repos.sheep.get(id);
    if (sheep !== null) refs.set(id, { id, tag: sheep.tag, name: sheep.name });
  }
  return refs;
}

function categoryRef(category: MoneyCategory): MoneyCategoryRef {
  return {
    id: category.id,
    key: category.key,
    name: category.name,
    system: isSystemCategory(category),
    archived: category.archivedAt !== null,
  };
}

function categoryRefOf(
  categories: Map<MoneyCategoryId, MoneyCategory>,
  id: MoneyCategoryId,
): MoneyCategoryRef {
  const category = categories.get(id);
  // A category in use is never Deleted, so this is only a guard.
  return category === undefined
    ? { id, key: null, name: null, system: false, archived: false }
    : categoryRef(category);
}

function shepherdRefOf(shepherds: Map<ShepherdId, Shepherd>, id: ShepherdId): ShepherdRef {
  const shepherd = shepherds.get(id);
  return {
    id,
    name: shepherd?.name ?? "",
    archived: shepherd !== undefined && shepherd.archivedAt !== null,
  };
}

/** By date, the newest first; on one date, the one made last first. */
function newestFirst(a: MoneyRecord, b: MoneyRecord): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return b.createdAt - a.createdAt;
}

const collator = new Intl.Collator("ru", { numeric: true });

/**
 * The default categories in the order of their keys, then the categories that the Members made, by
 * name, then the System categories.
 */
function inListOrder(a: MoneyCategory, b: MoneyCategory): number {
  const rank = (category: MoneyCategory) =>
    isSystemCategory(category) ? 2 : category.key === null ? 1 : 0;
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (a.key === null || b.key === null) return collator.compare(a.name ?? "", b.name ?? "");
  const keys: readonly string[] = defaultCategoryKeys[a.kind];
  return keys.indexOf(a.key) - keys.indexOf(b.key);
}

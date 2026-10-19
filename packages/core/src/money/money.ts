import type { CalendarDate } from "../dates";
import type { FarmId, FlockId, MoneyCategoryId, MoneyRecordId, SheepId, ShepherdId } from "../ids";

// The money of a Farm: the Expenses and the Incomes, and the list of categories of each kind. An
// Expense and an Income have the same fields, so one module keeps both: a "money record" is an
// Expense or an Income, and its `kind` tells which.

/** An Expense (money that the Farm paid) or an Income (money that the Farm got). */
export type MoneyKind = "expense" | "income";

export const moneyKinds = ["expense", "income"] as const satisfies readonly MoneyKind[];

/**
 * The keys of the categories that the app makes for each Farm, in the order of the lists. A key
 * stays when a Member renames the category, so a rule finds the category by its key, never by its
 * name: an Expense of «Оплата чабану» (`shepherdPay`) has a link to a Shepherd. The core keeps no
 * names (ADR 0004): the UI shows the name of each key, until a Member gives the category another
 * name.
 */
export const defaultCategoryKeys = {
  expense: [
    "shearing",
    "treatment",
    "shepherdPay",
    "equipment",
    "other",
    "sheepPurchase",
    "restock",
  ],
  income: ["wool", "meat", "other", "sheepSale"],
} as const satisfies Record<MoneyKind, readonly string[]>;

export type ExpenseCategoryKey = (typeof defaultCategoryKeys.expense)[number];
export type IncomeCategoryKey = (typeof defaultCategoryKeys.income)[number];
export type CategoryKey = ExpenseCategoryKey | IncomeCategoryKey;

/**
 * The System categories: the app uses them for the Automatic records of a Sale («Продажа баранов»),
 * a Purchase («Покупка баранов») and a Restock with a price («Пополнение ресурса»). A Member cannot
 * rename, archive or delete them, nor select them for a manual record.
 */
export const systemCategoryKinds = {
  sheepPurchase: "expense",
  restock: "expense",
  sheepSale: "income",
} as const satisfies Record<string, MoneyKind>;

export type SystemCategoryKey = keyof typeof systemCategoryKinds;

export function isSystemKey(key: CategoryKey | null): key is SystemCategoryKey {
  return key !== null && Object.hasOwn(systemCategoryKinds, key);
}

/** A category of Expenses or of Incomes. Each Farm has its own lists. */
export interface MoneyCategory {
  id: MoneyCategoryId;
  farmId: FarmId;
  kind: MoneyKind;
  /** The key of a category that the app made, or null for a category that a Member made. */
  key: CategoryKey | null;
  /**
   * The name that a Member gave, or null: then the UI shows the name of the key. A category that a
   * Member made always has a name.
   */
  name: string | null;
  /** When a Member archived the category, in milliseconds since the Unix epoch, or null. */
  archivedAt: number | null;
}

/** True if the category is a System category. */
export function isSystemCategory(category: Pick<MoneyCategory, "key">): boolean {
  return isSystemKey(category.key);
}

/**
 * What a money record is about: the Farm as a whole, one Flock, or one Sheep. A record of the Farm
 * is the default.
 */
export type MoneyScope =
  | { kind: "farm" }
  | { kind: "flock"; flockId: FlockId }
  | { kind: "sheep"; sheepId: SheepId };

/** True if two scopes are the same: both the Farm, the same Flock or the same Sheep. */
export function sameScope(a: MoneyScope, b: MoneyScope): boolean {
  switch (a.kind) {
    case "farm":
      return b.kind === "farm";
    case "flock":
      return b.kind === "flock" && a.flockId === b.flockId;
    case "sheep":
      return b.kind === "sheep" && a.sheepId === b.sheepId;
  }
}

/** The kinds of events that make an Automatic record. */
export type MoneySourceKind = "sale" | "purchase" | "restock";

/**
 * The event that made an Automatic record: a Sale, a Purchase or a Restock with a price. The record
 * has the amount of its event, and it goes away only when someone cancels the event.
 */
export interface MoneySource {
  kind: MoneySourceKind;
  /** The id of the event, of its own kind. */
  id: string;
}

/**
 * An Expense or an Income. The amount is in hundredths of the unit of the currency of the Farm (for
 * the som, in tyiyn): an integer, so that a sum is exact.
 */
export interface MoneyRecord {
  id: MoneyRecordId;
  farmId: FarmId;
  kind: MoneyKind;
  date: CalendarDate;
  /** The amount in hundredths of the currency unit: 150050 is 1 500,50. More than 0. */
  amount: number;
  /** A category of the same kind. */
  categoryId: MoneyCategoryId;
  scope: MoneyScope;
  /** The Shepherd who got the money: only for an Expense of «Оплата чабану», which must have one. */
  shepherdId: ShepherdId | null;
  notes: string | null;
  /** The event of an Automatic record, or null for a record that a Member made. */
  source: MoneySource | null;
  /** When the record was made, in milliseconds since the Unix epoch. */
  createdAt: number;
}

/** The largest amount: 1 000 000 000,00. A sum of many records stays an exact integer. */
export const maxAmount = 100_000_000_000;
/** The longest name of a category. */
export const maxCategoryNameLength = 60;
/** The longest notes of a money record. */
export const maxMoneyNotesLength = 500;

/**
 * Reads the categories of one Farm. The backend binds it to the Farm (`FarmReaders` in context.ts).
 * Each method hides Deleted categories (ADR 0005) and shows the Archived ones.
 */
export interface FarmMoneyCategoryReader {
  get(id: MoneyCategoryId): Promise<MoneyCategory | null>;
  /** The categories of the kind, in no order. */
  list(kind: MoneyKind): Promise<MoneyCategory[]>;
  /** The categories of the kind whose name has the same key (`nameKey`) as this name. */
  findByName(kind: MoneyKind, name: string): Promise<MoneyCategory[]>;
  /** The category of the kind with the key, or null. */
  findByKey(kind: MoneyKind, key: CategoryKey): Promise<MoneyCategory | null>;
}

export type MoneyCategoryFields = Omit<MoneyCategory, "id" | "farmId">;

/** Reads and writes the categories of one Farm. Nothing erases a category. */
export interface FarmMoneyCategoryRepository extends FarmMoneyCategoryReader {
  /** The kinds and keys of the categories that have a key, also of the Deleted ones. */
  keysWithDeleted(): Promise<{ kind: MoneyKind; key: CategoryKey }[]>;
  insert(fields: MoneyCategoryFields): Promise<MoneyCategoryId>;
  /** Changes the name or the archive time. The kind and the key never change. */
  update(
    id: MoneyCategoryId,
    fields: Partial<Pick<MoneyCategory, "name" | "archivedAt">>,
  ): Promise<void>;
  markDeleted(id: MoneyCategoryId, deletedAt: number): Promise<void>;
}

/**
 * The categories of any Farm, for a command that has no Farm of its own: the Operator makes a Farm,
 * and the migration gives the default lists to the Farms that existed before them.
 */
export interface MoneyCategorySeedRepository {
  /** The kinds and keys of the categories of the Farm that have a key, also of the Deleted ones. */
  keysWithDeleted(farmId: FarmId): Promise<{ kind: MoneyKind; key: CategoryKey }[]>;
  insert(category: Omit<MoneyCategory, "id">): Promise<MoneyCategoryId>;
}

/** Both days of a period count. A null limit is no limit. */
export interface Period {
  from: CalendarDate | null;
  to: CalendarDate | null;
}

/**
 * Reads the money records of one Farm, as `FarmMoneyCategoryReader` reads the categories. Each method
 * hides Deleted records, unless its name says otherwise.
 */
export interface FarmMoneyRecordReader {
  get(id: MoneyRecordId): Promise<MoneyRecord | null>;
  /** The records of the kind in the period, in no order. */
  list(kind: MoneyKind, period: Period): Promise<MoneyRecord[]>;
  /**
   * True if a record, also a Deleted one, has the category. A Member can restore a Deleted record,
   * so its category must stay.
   */
  usesCategoryWithDeleted(categoryId: MoneyCategoryId): Promise<boolean>;
  /** The Automatic record of the event, or null. */
  findBySource(source: MoneySource): Promise<MoneyRecord | null>;
  /** True if the Farm has a record, also a Deleted one. */
  anyWithDeleted(): Promise<boolean>;
}

export type MoneyRecordFields = Omit<MoneyRecord, "id" | "farmId">;

/** Reads and writes the money records of one Farm. Nothing erases a record. */
export interface FarmMoneyRecordRepository extends FarmMoneyRecordReader {
  insert(fields: MoneyRecordFields): Promise<MoneyRecordId>;
  /** Changes the fields that `fields` has. The kind and the source never change. */
  update(
    id: MoneyRecordId,
    fields: Partial<Omit<MoneyRecordFields, "kind" | "source" | "createdAt">>,
  ): Promise<void>;
  /** Makes the record Deleted. */
  markDeleted(id: MoneyRecordId, deletedAt: number): Promise<void>;
}

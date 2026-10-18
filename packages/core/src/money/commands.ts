import { authorize } from "../access/permissions";
import {
  type AuditLog,
  type CommandName,
  recordAudit,
  recordFarmAudit,
  type TargetKind,
} from "../audit/audit";
import type { FarmCommandContext } from "../context";
import { type CalendarDate, dateAt, isCalendarDate } from "../dates";
import { DomainError } from "../errors";
import type { FarmId, MoneyCategoryId, MoneyRecordId, ShepherdId, UserId } from "../ids";
import {
  defaultCategoryKeys,
  type FarmMoneyCategoryRepository,
  isSystemCategory,
  maxAmount,
  maxCategoryNameLength,
  maxMoneyNotesLength,
  type MoneyCategory,
  type MoneyCategorySeedRepository,
  type MoneyKind,
  moneyKinds,
  type MoneyRecord,
  type MoneyScope,
  type MoneySource,
  sameScope,
  systemCategoryKinds,
  type SystemCategoryKey,
} from "./money";

// The commands of the Expenses, the Incomes and their categories. Each one checks the permission
// first and appends one audit entry for each record that it changes. A command that changes nothing
// writes nothing.

// Money records.

/** The fields of an Expense or an Income that a Member enters. An empty text is no value. */
export interface MoneyRecordInput {
  date: CalendarDate;
  /** In hundredths of the currency unit of the Farm. */
  amount: number;
  categoryId: MoneyCategoryId;
  scope: MoneyScope;
  /** The Shepherd of an Expense of «Оплата чабану», or null for any other category. */
  shepherdId: ShepherdId | null;
  notes: string | null;
}

/**
 * A Member records an Expense or an Income. The date is not in the future, and the category is of
 * the same kind, not System and not Archived. An Expense of «Оплата чабану» has a Shepherd, and no
 * other record has one.
 */
export async function createMoneyRecord(
  ctx: FarmCommandContext,
  input: MoneyRecordInput & { kind: MoneyKind },
): Promise<MoneyRecordId> {
  authorize(ctx.member, "money.create", { farmId: ctx.farm.id });
  const fields = await validRecord(ctx, input.kind, input, null);
  const recordId = await ctx.repos.moneyRecords.insert({
    kind: input.kind,
    ...fields,
    source: null,
    createdAt: ctx.now(),
  });
  await auditRecord(ctx, "money.create", input.kind, recordId);
  return recordId;
}

/**
 * A Member changes an Expense or an Income, with the rules of `createMoneyRecord`. The kind stays. A
 * category, a Flock or a Shepherd that the record has already can be Archived now. Of an Automatic
 * record, a Member changes only the amount and the notes: its event owns the date, the category and
 * the scope (`money.automatic`), and the event reads its price from the record.
 */
export async function updateMoneyRecord(
  ctx: FarmCommandContext,
  input: MoneyRecordInput & { recordId: MoneyRecordId },
): Promise<void> {
  authorize(ctx.member, "money.update", { farmId: ctx.farm.id });
  const record = await requireRecord(ctx, input.recordId);
  const fields =
    record.source === null
      ? await validRecord(ctx, record.kind, input, record)
      : validAutomaticChange(record, input);
  if (
    record.date === fields.date &&
    record.amount === fields.amount &&
    record.categoryId === fields.categoryId &&
    sameScope(record.scope, fields.scope) &&
    record.shepherdId === fields.shepherdId &&
    record.notes === fields.notes
  ) {
    return;
  }
  await ctx.repos.moneyRecords.update(record.id, fields);
  await auditRecord(ctx, "money.update", record.kind, record.id);
}

/**
 * A Member deletes an Expense or an Income made by mistake: it becomes Deleted (ADR 0005). An
 * Automatic record goes away only when someone cancels its event (`money.automatic`).
 */
export async function deleteMoneyRecord(
  ctx: FarmCommandContext,
  input: { recordId: MoneyRecordId },
): Promise<void> {
  authorize(ctx.member, "money.delete", { farmId: ctx.farm.id });
  const record = await requireRecord(ctx, input.recordId);
  if (record.source !== null) throw new DomainError("money.automatic");
  await ctx.repos.moneyRecords.markDeleted(record.id, ctx.now());
  await auditRecord(ctx, "money.delete", record.kind, record.id);
}

// Automatic records, for the commands of other slices.

/** The fields of an Automatic record that its event gives. */
export interface AutomaticRecordInput {
  date: CalendarDate;
  /** The price of the event, in hundredths of the currency unit. */
  amount: number;
  scope: MoneyScope;
}

/**
 * Makes the Automatic record of an event: the Income of a Sale, the Expense of a Purchase or of a
 * Restock with a price. The record gets the System category of the key, and the date, the amount and
 * the scope follow the rules of a manual record. For the command of the event: it checks its own
 * permission, and `command` is its name, for the audit entry of the record. The record keeps the
 * price: the event reads it with `findBySource`, so the two never differ.
 */
export async function createAutomaticRecord(
  ctx: FarmCommandContext,
  command: CommandName,
  input: AutomaticRecordInput & { key: SystemCategoryKey; source: MoneySource },
): Promise<MoneyRecordId> {
  const kind = systemCategoryKinds[input.key];
  const category = await requireSystemCategory(ctx, input.key);
  const fields = await validAutomatic(ctx, input, null);
  const recordId = await ctx.repos.moneyRecords.insert({
    kind,
    ...fields,
    categoryId: category.id,
    shepherdId: null,
    notes: null,
    source: input.source,
    createdAt: ctx.now(),
  });
  await auditRecord(ctx, command, kind, recordId);
  return recordId;
}

/**
 * Changes the Automatic record of an event, when the event changes: for example a new date or price
 * of a Sale. Throws `money.notFound` if the event has no record. A change of nothing writes nothing.
 */
export async function updateAutomaticRecord(
  ctx: FarmCommandContext,
  command: CommandName,
  source: MoneySource,
  input: AutomaticRecordInput,
): Promise<void> {
  const record = await requireAutomatic(ctx, source);
  const fields = await validAutomatic(ctx, input, record);
  if (
    record.date === fields.date &&
    record.amount === fields.amount &&
    sameScope(record.scope, fields.scope)
  ) {
    return;
  }
  await ctx.repos.moneyRecords.update(record.id, fields);
  await auditRecord(ctx, command, record.kind, record.id);
}

/**
 * Makes the Automatic record of an event Deleted, when someone cancels the event. Throws
 * `money.notFound` if the event has no record.
 */
export async function deleteAutomaticRecord(
  ctx: FarmCommandContext,
  command: CommandName,
  source: MoneySource,
): Promise<void> {
  const record = await requireAutomatic(ctx, source);
  await ctx.repos.moneyRecords.markDeleted(record.id, ctx.now());
  await auditRecord(ctx, command, record.kind, record.id);
}

/**
 * The System category of the key. A Farm that has no categories yet gets its default lists first,
 * as when a Member opens its Expenses: see `ensureFarmMoneyCategories`.
 */
async function requireSystemCategory(
  ctx: FarmCommandContext,
  key: SystemCategoryKey,
): Promise<MoneyCategory> {
  const kind = systemCategoryKinds[key];
  const found = await ctx.repos.moneyCategories.findByKey(kind, key);
  if (found !== null) return found;
  await addDefaultCategories(ctx, ctx.farm.id, null, ctx.repos.moneyCategories);
  const made = await ctx.repos.moneyCategories.findByKey(kind, key);
  // Nothing deletes a System category, so the default lists always have it.
  if (made === null) throw new DomainError("moneyCategory.notFound");
  return made;
}

// Categories.

/** A Member adds a category of Expenses or of Incomes. Its name is unique in the list. */
export async function createMoneyCategory(
  ctx: FarmCommandContext,
  input: { kind: MoneyKind; name: string },
): Promise<MoneyCategoryId> {
  authorize(ctx.member, "moneyCategory.create", { farmId: ctx.farm.id });
  const name = validCategoryName(input.name);
  await requireFreeCategoryName(ctx, input.kind, name, null);
  const categoryId = await ctx.repos.moneyCategories.insert({
    kind: input.kind,
    key: null,
    name,
    archivedAt: null,
  });
  await auditCategory(ctx, "moneyCategory.create", input.kind, categoryId);
  return categoryId;
}

/**
 * A Member renames a category, also one of the default list: its key stays, so its rules stay. A
 * System category keeps its name (`moneyCategory.system`).
 */
export async function renameMoneyCategory(
  ctx: FarmCommandContext,
  input: { categoryId: MoneyCategoryId; name: string },
): Promise<void> {
  authorize(ctx.member, "moneyCategory.update", { farmId: ctx.farm.id });
  const category = await requireManagedCategory(ctx, input.categoryId);
  const name = validCategoryName(input.name);
  await requireFreeCategoryName(ctx, category.kind, name, category.id);
  if (category.name === name) return;
  await ctx.repos.moneyCategories.update(category.id, { name });
  await auditCategory(ctx, "moneyCategory.update", category.kind, category.id);
}

/**
 * A Member archives a category that the Farm does not use now: the forms do not offer it, and the
 * records and the reports still show it. Not a System category (`moneyCategory.system`).
 */
export async function archiveMoneyCategory(
  ctx: FarmCommandContext,
  input: { categoryId: MoneyCategoryId },
): Promise<void> {
  authorize(ctx.member, "moneyCategory.archive", { farmId: ctx.farm.id });
  const category = await requireManagedCategory(ctx, input.categoryId);
  if (category.archivedAt !== null) return;
  await ctx.repos.moneyCategories.update(category.id, { archivedAt: ctx.now() });
  await auditCategory(ctx, "moneyCategory.archive", category.kind, category.id);
}

/** A Member takes a category out of the archive: the forms offer it again. */
export async function unarchiveMoneyCategory(
  ctx: FarmCommandContext,
  input: { categoryId: MoneyCategoryId },
): Promise<void> {
  authorize(ctx.member, "moneyCategory.archive", { farmId: ctx.farm.id });
  const category = await requireCategory(ctx, input.categoryId);
  if (category.archivedAt === null) return;
  await ctx.repos.moneyCategories.update(category.id, { archivedAt: null });
  await auditCategory(ctx, "moneyCategory.unarchive", category.kind, category.id);
}

/**
 * A Member deletes a category that no record uses, for example one made by mistake: it becomes
 * Deleted (ADR 0005). A category in use can only become Archived (`moneyCategory.inUse`); a Deleted
 * record counts, because a Member can restore it. Not a System category (`moneyCategory.system`).
 */
export async function deleteMoneyCategory(
  ctx: FarmCommandContext,
  input: { categoryId: MoneyCategoryId },
): Promise<void> {
  authorize(ctx.member, "moneyCategory.delete", { farmId: ctx.farm.id });
  const category = await requireManagedCategory(ctx, input.categoryId);
  if (await ctx.repos.moneyRecords.usesCategoryWithDeleted(category.id)) {
    throw new DomainError("moneyCategory.inUse");
  }
  await ctx.repos.moneyCategories.markDeleted(category.id, ctx.now());
  await auditCategory(ctx, "moneyCategory.delete", category.kind, category.id);
}

// The default lists.

/**
 * Gives a Farm each category of the default lists (`defaultCategoryKeys`) that it does not have,
 * with an audit entry for each one. The Operator's command that makes a Farm calls it.
 */
export function ensureMoneyCategories(
  ctx: { repos: { moneyCategories: MoneyCategorySeedRepository; audit: AuditLog }; now(): number },
  farmId: FarmId,
  actorId: UserId | null,
): Promise<number> {
  return addDefaultCategories(ctx, farmId, actorId, {
    keysWithDeleted: () => ctx.repos.moneyCategories.keysWithDeleted(farmId),
    insert: (fields) => ctx.repos.moneyCategories.insert({ farmId, ...fields }),
  });
}

/**
 * The lazy migration of the Farms that existed before the Expenses and Incomes: the client calls it
 * when a list of categories of the Farm is empty, and the Farm gets the default lists, as a new Farm
 * does. A second call makes nothing. Any Member who can see the money can call it: it adds only the
 * app's own categories, so its audit entries have no actor. Gives the number of categories that it
 * made.
 */
export async function ensureFarmMoneyCategories(ctx: FarmCommandContext): Promise<number> {
  authorize(ctx.member, "money.view", { farmId: ctx.farm.id });
  return addDefaultCategories(ctx, ctx.farm.id, null, ctx.repos.moneyCategories);
}

/**
 * Adds each default category that the Farm does not have. A category that a Member deleted counts as
 * one that the Farm has, so it does not come back.
 */
async function addDefaultCategories(
  ctx: { repos: { audit: AuditLog }; now(): number },
  farmId: FarmId,
  actorId: UserId | null,
  categories: Pick<FarmMoneyCategoryRepository, "keysWithDeleted" | "insert">,
): Promise<number> {
  const existing = new Set(
    (await categories.keysWithDeleted()).map(({ kind, key }) => `${kind}.${key}`),
  );
  let made = 0;
  for (const kind of moneyKinds) {
    for (const key of defaultCategoryKeys[kind]) {
      if (existing.has(`${kind}.${key}`)) continue;
      const categoryId = await categories.insert({ kind, key, name: null, archivedAt: null });
      await recordAudit(ctx, {
        actorId,
        farmId,
        command: "moneyCategory.create",
        target: { kind: categoryTarget[kind], id: categoryId },
      });
      made += 1;
    }
  }
  return made;
}

// The rules that the commands share.

const recordTarget = { expense: "Expense", income: "Income" } as const satisfies Record<
  MoneyKind,
  TargetKind
>;

const categoryTarget = {
  expense: "ExpenseCategory",
  income: "IncomeCategory",
} as const satisfies Record<MoneyKind, TargetKind>;

function auditRecord(
  ctx: FarmCommandContext,
  command: CommandName,
  kind: MoneyKind,
  id: MoneyRecordId,
): Promise<void> {
  return recordFarmAudit(ctx, { command, target: { kind: recordTarget[kind], id } });
}

function auditCategory(
  ctx: FarmCommandContext,
  command: CommandName,
  kind: MoneyKind,
  id: MoneyCategoryId,
): Promise<void> {
  return recordFarmAudit(ctx, { command, target: { kind: categoryTarget[kind], id } });
}

/** Today in the time zone of the Farm. */
function today(ctx: FarmCommandContext): CalendarDate {
  return dateAt(ctx.now(), ctx.farm.timeZone);
}

async function requireRecord(ctx: FarmCommandContext, id: MoneyRecordId): Promise<MoneyRecord> {
  const record = await ctx.repos.moneyRecords.get(id);
  if (record === null) throw new DomainError("money.notFound");
  return record;
}

async function requireAutomatic(
  ctx: FarmCommandContext,
  source: MoneySource,
): Promise<MoneyRecord> {
  const record = await ctx.repos.moneyRecords.findBySource(source);
  if (record === null) throw new DomainError("money.notFound");
  return record;
}

async function requireCategory(
  ctx: FarmCommandContext,
  id: MoneyCategoryId,
): Promise<MoneyCategory> {
  const category = await ctx.repos.moneyCategories.get(id);
  if (category === null) throw new DomainError("moneyCategory.notFound");
  return category;
}

/** A category that a Member can rename, archive or delete: any one but a System category. */
async function requireManagedCategory(
  ctx: FarmCommandContext,
  id: MoneyCategoryId,
): Promise<MoneyCategory> {
  const category = await requireCategory(ctx, id);
  if (isSystemCategory(category)) throw new DomainError("moneyCategory.system");
  return category;
}

/** Throws `moneyCategory.nameTaken` if another category of the list, also an Archived one, has the name. */
async function requireFreeCategoryName(
  ctx: FarmCommandContext,
  kind: MoneyKind,
  name: string,
  self: MoneyCategoryId | null,
): Promise<void> {
  const same = await ctx.repos.moneyCategories.findByName(kind, name);
  if (same.some((other) => other.id !== self)) throw new DomainError("moneyCategory.nameTaken");
}

/** The name with the spaces trimmed and the inner spaces as one. */
function validCategoryName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed === "") throw new DomainError("moneyCategory.nameRequired");
  if (trimmed.length > maxCategoryNameLength) throw new DomainError("moneyCategory.nameTooLong");
  return trimmed;
}

type ValidFields = Pick<
  MoneyRecord,
  "date" | "amount" | "categoryId" | "scope" | "shepherdId" | "notes"
>;

/**
 * The fields of a manual record, or the error of the first rule that they break. `previous` is the
 * record before a change: what it has already stays valid when it becomes Archived.
 */
async function validRecord(
  ctx: FarmCommandContext,
  kind: MoneyKind,
  input: MoneyRecordInput,
  previous: MoneyRecord | null,
): Promise<ValidFields> {
  const date = validDate(ctx, input.date);
  const amount = validAmount(input.amount);
  const notes = validNotes(input.notes);
  const category = await ctx.repos.moneyCategories.get(input.categoryId);
  if (category === null || category.kind !== kind) throw new DomainError("moneyCategory.notFound");
  if (isSystemCategory(category)) throw new DomainError("moneyCategory.system");
  if (category.archivedAt !== null && category.id !== previous?.categoryId) {
    throw new DomainError("moneyCategory.archived");
  }
  const shepherdId = await validShepherd(ctx, category, input.shepherdId, previous);
  const scope = await validScope(ctx, input.scope, previous);
  return { date, amount, categoryId: category.id, scope, shepherdId, notes };
}

/** The fields of an Automatic record, with the rules of a manual one. */
async function validAutomatic(
  ctx: FarmCommandContext,
  input: AutomaticRecordInput,
  previous: MoneyRecord | null,
): Promise<Pick<MoneyRecord, "date" | "amount" | "scope">> {
  return {
    date: validDate(ctx, input.date),
    amount: validAmount(input.amount),
    scope: await validScope(ctx, input.scope, previous),
  };
}

/**
 * The fields of an Automatic record that a Member changes: the amount and the notes. The other fields
 * stay as its event made them (`money.automatic`).
 */
function validAutomaticChange(record: MoneyRecord, input: MoneyRecordInput): ValidFields {
  if (
    input.date !== record.date ||
    input.categoryId !== record.categoryId ||
    !sameScope(input.scope, record.scope) ||
    input.shepherdId !== record.shepherdId
  ) {
    throw new DomainError("money.automatic");
  }
  return {
    date: record.date,
    amount: validAmount(input.amount),
    categoryId: record.categoryId,
    scope: record.scope,
    shepherdId: record.shepherdId,
    notes: validNotes(input.notes),
  };
}

/** A real date, not in the future: the Farm paid or got the money on it. */
function validDate(ctx: FarmCommandContext, date: CalendarDate): CalendarDate {
  if (!isCalendarDate(date)) throw new DomainError("money.dateInvalid");
  if (date > today(ctx)) throw new DomainError("money.dateInFuture");
  return date;
}

/** A whole number of hundredths, from 1 to `maxAmount`. */
function validAmount(amount: number): number {
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > maxAmount) {
    throw new DomainError("money.amountInvalid");
  }
  return amount;
}

/** The trimmed notes, or null if they are empty. */
function validNotes(notes: string | null): string | null {
  const trimmed = notes?.trim() ?? "";
  if (trimmed === "") return null;
  if (trimmed.length > maxMoneyNotesLength) throw new DomainError("money.notesTooLong");
  return trimmed;
}

/**
 * The Shepherd of the record: an Expense of «Оплата чабану» has one, which exists and is not
 * Archived (unless the record had it already); any other record has none.
 */
async function validShepherd(
  ctx: FarmCommandContext,
  category: MoneyCategory,
  shepherdId: ShepherdId | null,
  previous: MoneyRecord | null,
): Promise<ShepherdId | null> {
  if (category.kind !== "expense" || category.key !== "shepherdPay") {
    if (shepherdId !== null) throw new DomainError("money.shepherdNotAllowed");
    return null;
  }
  if (shepherdId === null) throw new DomainError("money.shepherdRequired");
  if (shepherdId === previous?.shepherdId) return shepherdId;
  const shepherd = await ctx.repos.shepherds.get(shepherdId);
  if (shepherd === null) throw new DomainError("shepherd.notFound");
  if (shepherd.archivedAt !== null) throw new DomainError("shepherd.archived");
  return shepherd.id;
}

/**
 * The scope of the record: the Farm, a Flock that is not Archived, or a Sheep of the Farm (any
 * Status, not an External Sheep). A scope that the record has already stays as it is.
 */
async function validScope(
  ctx: FarmCommandContext,
  scope: MoneyScope,
  previous: MoneyRecord | null,
): Promise<MoneyScope> {
  if (previous !== null && sameScope(previous.scope, scope)) return previous.scope;
  switch (scope.kind) {
    case "farm":
      return { kind: "farm" };
    case "flock": {
      const flock = await ctx.repos.flocks.get(scope.flockId);
      if (flock === null) throw new DomainError("flock.notFound");
      if (flock.archivedAt !== null) throw new DomainError("flock.archived");
      return { kind: "flock", flockId: flock.id };
    }
    case "sheep": {
      const sheep = await ctx.repos.sheep.get(scope.sheepId);
      if (sheep === null || sheep.origin === "external") throw new DomainError("sheep.notFound");
      return { kind: "sheep", sheepId: sheep.id };
    }
  }
}

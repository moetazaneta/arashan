import { authorize } from "../access/permissions";
import type { FarmQueryContext } from "../context";
import { type CalendarDate, isCalendarDate } from "../dates";
import { DomainError } from "../errors";
import type { FlockRef, LocationRef } from "../flocks/queries";
import type { FlockId, LocationId, MembershipId, MoneyCategoryId } from "../ids";
import type { MoneyCategory, MoneyKind, Period } from "../money/money";
import { categoryRef, inListOrder, type MoneyCategoryRef, requirePeriod } from "../money/queries";
import { isLamb, isOnFarm, type Sheep, type SheepStatus, sheepStatuses } from "../sheep/sheep";

// The reports of a Farm: the head count of the Sheep, and the money of a period. A report reads the
// records through the repositories, so it never counts a Deleted record (ADR 0005). It counts the
// Archived ones: a removed Member, an Archived Flock or an Archived category stays in the report.

/** The groups of the Sheep, as the Norms have them: a Lamb, or an adult Ram or Ewe. */
export const sheepGroups = ["ram", "ewe", "lamb"] as const;
export type SheepGroup = (typeof sheepGroups)[number];

/** The group of the Sheep on the date: a Lamb of either sex, or else its sex. */
export function sheepGroup(
  sheep: Pick<Sheep, "sex" | "birthDate">,
  lambAgeMonths: number,
  date: CalendarDate,
): SheepGroup {
  return isLamb(sheep.birthDate, lambAgeMonths, date) ? "lamb" : sheep.sex;
}

/** A Member as the head count shows it. A removed Member is Archived. */
export interface HeadCountOwner {
  id: MembershipId;
  name: string;
  archived: boolean;
}

/** The number of Sheep of one row of the report. */
export interface HeadCountRow<Ref> {
  /** The Member, the Flock or the Location of the row, or null: the Sheep in no Flock. */
  ref: Ref | null;
  count: number;
}

/**
 * The head count of a Farm on a date. The Status counts all Sheep that are or were on the Farm; the
 * other parts count only the Sheep on the Farm now (`isOnFarm`), because only they have a Flock.
 */
export interface HeadCountReport {
  /** The date of the groups: a Sheep is a Lamb on this date or not. */
  date: CalendarDate;
  /** The Sheep on the Farm now. */
  onFarm: number;
  byStatus: Record<SheepStatus, number>;
  byGroup: Record<SheepGroup, number>;
  /**
   * By Owner, by name. The Members of the Farm have a row also without Sheep; a removed Member has
   * no Sheep on the Farm, so no row.
   */
  byOwner: HeadCountRow<HeadCountOwner>[];
  /** By Flock, by name, and the Sheep in no Flock last. Each Flock that is not Archived has a row. */
  byFlock: HeadCountRow<FlockRef>[];
  /**
   * By the Location of the Flock, by name, and last the Sheep in no Flock or in a Flock with no
   * Location. Each Location that is not Archived has a row.
   */
  byLocation: HeadCountRow<LocationRef>[];
}

/**
 * The head count of the Farm on the date: the number of Sheep by Status, Owner, Flock, Location and
 * group. A Lamb depends on the day, and the result of a query changes only with its data, so the
 * client gives the date: today in the time zone of the Farm. External Sheep are not counted: they
 * were never on the Farm.
 */
export async function getHeadCountReport(
  ctx: FarmQueryContext,
  input: { date: CalendarDate },
): Promise<HeadCountReport> {
  authorize(ctx.member, "sheep.view", { farmId: ctx.farm.id });
  if (!isCalendarDate(input.date)) throw new DomainError("report.dateInvalid");
  const [sheep, memberships, flocks, locations] = await Promise.all([
    ctx.repos.sheep.list(),
    ctx.repos.memberships.list(),
    ctx.repos.flocks.list(),
    ctx.repos.locations.list(),
  ]);
  const ofFarm = sheep.filter((one) => one.origin !== "external");
  const onFarm = ofFarm.filter(isOnFarm);

  const byStatus = Object.fromEntries(sheepStatuses.map((status) => [status, 0])) as Record<
    SheepStatus,
    number
  >;
  for (const one of ofFarm) byStatus[one.status] += 1;
  const byGroup: Record<SheepGroup, number> = { ram: 0, ewe: 0, lamb: 0 };
  for (const one of onFarm) byGroup[sheepGroup(one, ctx.farm.lambAgeMonths, input.date)] += 1;

  const owners: HeadCountOwner[] = await Promise.all(
    memberships.map(async (membership) => ({
      id: membership.id,
      name: (await ctx.repos.users.get(membership.userId))?.username ?? "",
      archived: membership.archivedAt !== undefined,
    })),
  );
  const flockRefs: FlockRef[] = flocks.map((flock) => ({
    id: flock.id,
    name: flock.name,
    archived: flock.archivedAt !== null,
  }));
  const locationRefs: LocationRef[] = locations.map((location) => ({
    id: location.id,
    name: location.name,
    archived: location.archivedAt !== null,
  }));
  const locationOfFlock = new Map<FlockId, LocationId | null>(
    flocks.map((flock) => [flock.id, flock.locationId]),
  );

  return {
    date: input.date,
    onFarm: onFarm.length,
    byStatus,
    byGroup,
    byOwner: countBy(onFarm, owners, (one) => one.ownerId),
    byFlock: countBy(onFarm, flockRefs, (one) => one.flockId),
    byLocation: countBy(onFarm, locationRefs, (one) =>
      one.flockId === null ? null : (locationOfFlock.get(one.flockId) ?? null),
    ),
  };
}

/**
 * The rows of one part of the head count: a row for each record that has Sheep or is not Archived,
 * by name, then a row for the Sheep that have none, if there are any.
 */
function countBy<Ref extends { id: string; name: string; archived: boolean }>(
  sheep: readonly Sheep[],
  refs: readonly Ref[],
  keyOf: (sheep: Sheep) => string | null,
): HeadCountRow<Ref>[] {
  const counts = new Map<string | null, number>();
  for (const one of sheep) {
    const key = keyOf(one);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rows: HeadCountRow<Ref>[] = refs
    .filter((ref) => !ref.archived || counts.has(ref.id))
    .toSorted((a, b) => collator.compare(a.name, b.name))
    .map((ref) => ({ ref, count: counts.get(ref.id) ?? 0 }));
  const known = new Set(refs.map((ref) => ref.id));
  // A key that no record has (a guard: a Sheep always has a Flock of the Farm) counts as none.
  const none = [...counts].reduce(
    (sum, [key, count]) => (key === null || !known.has(key) ? sum + count : sum),
    0,
  );
  if (none > 0) rows.push({ ref: null, count: none });
  return rows;
}

/** The money of one category in the period. */
export interface MoneyReportCategory {
  category: MoneyCategoryRef;
  /** The sum of the amounts, in hundredths of the currency unit of the Farm. */
  total: number;
  /** How many records. */
  count: number;
}

/** The Expenses or the Incomes of the period. */
export interface MoneyReportPart {
  /** The sum of the amounts, in hundredths of the currency unit of the Farm. */
  total: number;
  /** The categories that have records in the period, the largest total first. */
  categories: MoneyReportCategory[];
}

/** The money of a Farm in a period: the Incomes, the Expenses, and the difference. */
export interface MoneyReport {
  /** The currency of the Farm: the ISO 4217 code of all the amounts. */
  currency: string;
  period: Period;
  income: MoneyReportPart;
  expense: MoneyReportPart;
  /** The Incomes minus the Expenses: less than 0 if the Farm paid more than it got. */
  balance: number;
}

/**
 * The money report of the Farm for the period, both days included; a null limit is no limit. It
 * counts all money records, the ones that a Member made and the Automatic ones of a Sale, a Purchase
 * or a Restock. The period is checked as the one of the tables (`money.periodInvalid`).
 */
export async function getMoneyReport(ctx: FarmQueryContext, period: Period): Promise<MoneyReport> {
  authorize(ctx.member, "money.view", { farmId: ctx.farm.id });
  requirePeriod(period);
  const part = async (kind: MoneyKind): Promise<MoneyReportPart> => {
    const [records, categories] = await Promise.all([
      ctx.repos.moneyRecords.list(kind, { from: period.from, to: period.to }),
      ctx.repos.moneyCategories.list(kind),
    ]);
    const byId = new Map<MoneyCategoryId, MoneyReportCategory & { source: MoneyCategory | null }>();
    for (const record of records) {
      let row = byId.get(record.categoryId);
      if (row === undefined) {
        const category = categories.find((one) => one.id === record.categoryId) ?? null;
        row = {
          // A category in use is never Deleted, so the fallback is only a guard.
          category:
            category === null
              ? { id: record.categoryId, key: null, name: null, system: false, archived: false }
              : categoryRef(category),
          total: 0,
          count: 0,
          source: category,
        };
        byId.set(record.categoryId, row);
      }
      row.total += record.amount;
      row.count += 1;
    }
    const rows = [...byId.values()].sort(
      (a, b) =>
        b.total - a.total ||
        (a.source !== null && b.source !== null ? inListOrder(a.source, b.source) : 0),
    );
    return {
      total: rows.reduce((sum, row) => sum + row.total, 0),
      categories: rows.map(({ category, total, count }) => ({ category, total, count })),
    };
  };
  const [income, expense] = await Promise.all([part("income"), part("expense")]);
  return {
    currency: ctx.farm.currency,
    period: { from: period.from, to: period.to },
    income,
    expense,
    balance: income.total - expense.total,
  };
}

const collator = new Intl.Collator("ru", { numeric: true });

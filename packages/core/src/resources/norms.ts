import { type CalendarDate, daysBetween } from "../dates";
import { isLamb, type Sheep } from "../sheep/sheep";

/** The groups for which a Resource has a Norm. */
export type NormGroup = "ram" | "ewe" | "lamb";
export const normGroups = ["ram", "ewe", "lamb"] as const satisfies readonly NormGroup[];

/** Thousandths of the unit for one Sheep for one day. A zero means no Norm. */
export interface Norms {
  ram: number;
  ewe: number;
  lamb: number;
}

export const noNorms: Norms = { ram: 0, ewe: 0, lamb: 0 };

/** How many Sheep are in each group. */
export interface GroupCounts {
  ram: number;
  ewe: number;
  lamb: number;
}

/** A Lamb belongs to its age group, regardless of its sex. */
export function groupCounts(
  sheep: readonly Pick<Sheep, "birthDate" | "sex">[],
  lambAgeMonths: number,
  date: CalendarDate,
): GroupCounts {
  const counts: GroupCounts = { ram: 0, ewe: 0, lamb: 0 };
  for (const item of sheep) {
    counts[isLamb(item.birthDate, lambAgeMonths, date) ? "lamb" : item.sex] += 1;
  }
  return counts;
}

/** The quantity for all the Sheep for one day, in thousandths of the unit. */
export function dailyNeed(norms: Norms, counts: GroupCounts): number {
  return norms.ram * counts.ram + norms.ewe * counts.ewe + norms.lamb * counts.lamb;
}

/** Days since the last Usage on or before the date, or one day for the first Usage. */
export function usageDays(usageDates: readonly CalendarDate[], date: CalendarDate): number {
  const last = usageDates
    .filter((value) => value <= date)
    .sort()
    .at(-1);
  return last === undefined ? 1 : daysBetween(last, date);
}

/** The suggested quantity for the Sheep and the number of days. */
export function usageSuggestion(input: { norms: Norms; counts: GroupCounts; days: number }): {
  perDay: number;
  days: number;
  quantity: number;
} {
  const perDay = dailyNeed(input.norms, input.counts);
  return { perDay, days: input.days, quantity: perDay * input.days };
}

/** Whole days of Stock, or null when the Sheep need none of this Resource. */
export function daysOfStock(stock: number, need: number): number | null {
  if (need === 0) return null;
  return stock <= 0 ? 0 : Math.floor(stock / need);
}

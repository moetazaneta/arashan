/**
 * A calendar date without a time, "YYYY-MM-DD", such as a birth date. The date of an event on a Farm
 * is the date in the time zone of the Farm. Two dates compare as strings.
 */
export type CalendarDate = string;

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * True if the text is a real calendar date in the form "YYYY-MM-DD", such as "2026-02-28", from the
 * year 1900.
 */
export function isCalendarDate(text: string): text is CalendarDate {
  const match = datePattern.exec(text);
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/** The date in the time zone at the time, in milliseconds since the Unix epoch. */
export function dateAt(time: number, timeZone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(time);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * The date some months after the date. If that month is shorter, the date is its last day: one month
 * after January 31 is February 28 (or 29).
 */
export function addMonths(date: CalendarDate, months: number): CalendarDate {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const index = year * 12 + (month - 1) + months;
  const newYear = Math.floor(index / 12);
  const newMonth = (index % 12) + 1;
  const newDay = Math.min(day, daysInMonth(newYear, newMonth));
  return `${newYear}-${pad(newMonth)}-${pad(newDay)}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Whole days between two calendar dates, without a time zone or a daylight saving change. */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

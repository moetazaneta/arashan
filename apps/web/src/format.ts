// The names of currencies and time zones, in the language of the UI. The browser knows them all, so
// the app keeps no lists of its own.

export interface Option {
  value: string;
  label: string;
}

const currencyLists = new Map<string, Option[]>();

/** The currencies that the browser knows, as "KGS — киргизский сом", by code. */
export function currencyOptions(locale: string): Option[] {
  let options = currencyLists.get(locale);
  if (options === undefined) {
    const names = new Intl.DisplayNames([locale], { type: "currency", fallback: "code" });
    options = Intl.supportedValuesOf("currency").map((code) => ({
      value: code,
      label: `${code} — ${names.of(code) ?? code}`,
    }));
    currencyLists.set(locale, options);
  }
  return options;
}

/** "KGS — киргизский сом" for "KGS". */
export function currencyLabel(code: string, locale: string): string {
  return currencyOptions(locale).find((option) => option.value === code)?.label ?? code;
}

/**
 * The IANA time zones that the browser knows, by name. V8 leaves "UTC" out of the list, but the core
 * accepts it; `current` is in the list even if the browser names it another way.
 */
export function timeZones(current: string | null): string[] {
  const zones = new Set(Intl.supportedValuesOf("timeZone"));
  zones.add("UTC");
  if (current !== null) zones.add(current);
  return [...zones].sort();
}

/** The time zone of this browser, for example "Asia/Bishkek". */
export function browserTimeZone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const offsetFormats = new Map<string, Intl.DateTimeFormat>();

/** The offset of a time zone from UTC now, for example "GMT+6", or "" if the zone is not known. */
export function timeZoneOffset(timeZone: string, locale: string): string {
  const key = `${locale} ${timeZone}`;
  let format = offsetFormats.get(key);
  if (format === undefined) {
    try {
      format = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "shortOffset" });
    } catch {
      return "";
    }
    offsetFormats.set(key, format);
  }
  return format.formatToParts(new Date()).find((part) => part.type === "timeZoneName")?.value ?? "";
}

// Dates and numbers of the records. A table can show hundreds of them, so each formatter is made one
// time for each language and time zone.

const calendarDateFormats = new Map<string, Intl.DateTimeFormat>();

/**
 * A calendar date "YYYY-MM-DD", such as a birth date, as the language shows it: «01.06.2026». The
 * date has no time zone, so it is read and shown at UTC: it is the same date everywhere.
 */
export function formatCalendarDate(date: string, locale: string): string {
  let format = calendarDateFormats.get(locale);
  if (format === undefined) {
    format = new Intl.DateTimeFormat(locale, {
      timeZone: "UTC",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    calendarDateFormats.set(locale, format);
  }
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return format.format(Date.UTC(year, month - 1, day));
}

const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();

/** A time, in milliseconds since the Unix epoch, as the date and time in the time zone of the Farm. */
export function formatDateTime(time: number, timeZone: string, locale: string): string {
  const key = `${locale} ${timeZone}`;
  let format = dateTimeFormats.get(key);
  if (format === undefined) {
    format = new Intl.DateTimeFormat(locale, {
      timeZone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    dateTimeFormats.set(key, format);
  }
  return format.format(time);
}

const dateAtFormats = new Map<string, Intl.DateTimeFormat>();

/** A time, in milliseconds since the Unix epoch, as the date in the time zone of the Farm. */
export function formatDateAt(time: number, timeZone: string, locale: string): string {
  const key = `${locale} ${timeZone}`;
  let format = dateAtFormats.get(key);
  if (format === undefined) {
    format = new Intl.DateTimeFormat(locale, {
      timeZone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    dateAtFormats.set(key, format);
  }
  return format.format(time);
}

const weightFormats = new Map<string, Intl.NumberFormat>();

/** A weight in kilograms, with at most one decimal: «42,5». */
export function formatKg(kg: number, locale: string): string {
  let format = weightFormats.get(locale);
  if (format === undefined) {
    format = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    weightFormats.set(locale, format);
  }
  return format.format(kg);
}

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

// Amounts of money. An amount is an integer of hundredths of the currency unit of the Farm: 150050
// is 1 500,50. The tables show the currency once, in the header, and the amounts as numbers.

const amountFormats = new Map<string, Intl.NumberFormat>();

function amountFormat(locale: string, hundredths: boolean, grouping: boolean): Intl.NumberFormat {
  const key = `${locale} ${hundredths} ${grouping}`;
  let format = amountFormats.get(key);
  if (format === undefined) {
    const digits = hundredths ? 2 : 0;
    format = new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      useGrouping: grouping,
    });
    amountFormats.set(key, format);
  }
  return format;
}

/**
 * An amount as a number: «1 500» or «1 500,50». The figures of a column line up when all its amounts
 * show the hundredths or none does, so a table gives `hundredths` for all its rows.
 */
export function formatAmount(
  amount: number,
  locale: string,
  hundredths = amount % 100 !== 0,
): string {
  return amountFormat(locale, hundredths, true).format(amount / 100);
}

/** An amount as the text of an amount field, which `parseAmount` reads back: «1500» or «1500,50». */
export function amountText(amount: number, locale: string): string {
  return amountFormat(locale, amount % 100 !== 0, false).format(amount / 100);
}

/**
 * The amount in a text that a Member typed, in hundredths, or null if it is not an amount: digits,
 * groups of three digits split by spaces, and at most two digits after "," or ".". The text is read
 * digit by digit, so no rounding of a floating-point number changes it.
 */
export function parseAmount(text: string): number | null {
  const normalized = text.trim().replace(/[\u00a0\u202f]/g, " ");
  if (!/^(?:\d+|\d{1,3}(?: \d{3})+)(?:[.,]\d{1,2})?$/.test(normalized)) return null;
  const [whole = "", fraction = ""] = normalized.replaceAll(" ", "").split(/[.,]/);
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
}

const currencySymbols = new Map<string, string>();

/** The symbol of a currency, such as «$», or its code if it has no common symbol: «KGS». */
export function currencySymbol(currency: string, locale: string): string {
  const key = `${locale} ${currency}`;
  let symbol = currencySymbols.get(key);
  if (symbol === undefined) {
    const parts = new Intl.NumberFormat(locale, { style: "currency", currency }).formatToParts(0);
    symbol = parts.find((part) => part.type === "currency")?.value ?? currency;
    currencySymbols.set(key, symbol);
  }
  return symbol;
}

// The parts of a Breed composition, in millionths of the whole (`wholeShare` of the core): 125 000
// is 12.5 percent.

const shareFormats = new Map<string, Intl.NumberFormat>();

/** A part of a Breed composition as a percent, with at most 2 decimals: «12,5 %». */
export function formatShare(share: number, locale: string): string {
  let format = shareFormats.get(locale);
  if (format === undefined) {
    format = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 });
    shareFormats.set(locale, format);
  }
  return format.format(share / 1_000_000);
}

const shareNumberFormats = new Map<string, Intl.NumberFormat>();

/** A part of a Breed composition as the number of percent, for a column «, %»: «12,5». */
export function formatShareNumber(share: number, locale: string): string {
  let format = shareNumberFormats.get(locale);
  if (format === undefined) {
    format = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
    shareNumberFormats.set(locale, format);
  }
  return format.format(share / 10_000);
}

/**
 * A part of a Breed composition as the text of a percent field, exact to one millionth and without
 * the grouping of thousands: «12,5». `parseShare` reads it back.
 */
export function formatShareInput(share: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 4, useGrouping: false }).format(
    share / 10_000,
  );
}

/**
 * The text of a percent field as a part in millionths: «12,5» and "12.5" give 125 000. A text that
 * is not a number gives NaN, and the core refuses it (`sheep.breedsInvalid`).
 */
export function parseShare(text: string): number {
  return Math.round(Number(text.trim().replace(",", ".")) * 10_000);
}

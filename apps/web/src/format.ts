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

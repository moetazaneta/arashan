import { DomainError } from "../errors";
import type { FarmId } from "../ids";

/** The settings of a Farm that an Admin can change. */
export interface FarmSettings {
  /** The ISO 4217 code of the currency of the Farm's money, for example "KGS". */
  currency: string;
  /** The IANA time zone of the Farm, for example "Asia/Bishkek". It says when a day starts. */
  timeZone: string;
  /** A Sheep younger than this many months is a Lamb. */
  lambAgeMonths: number;
}

export interface Farm extends FarmSettings {
  id: FarmId;
  name: string;
  /** When the Operator made the Farm, in milliseconds since the Unix epoch. */
  createdAt: number;
}

export const defaultLambAgeMonths = 4;
export const minLambAgeMonths = 1;
export const maxLambAgeMonths = 12;

/** Reads Farms. Each method hides Deleted Farms (ADR 0005). */
export interface FarmReader {
  /** The Farm, or null if there is none or it is Deleted. */
  get(id: FarmId): Promise<Farm | null>;
  /** All Farms, the newest first. */
  list(): Promise<Farm[]>;
}

/**
 * Reads and makes Farms. Nothing erases a Farm. A command of one Farm changes its settings through
 * the repository bound to it (`FarmRepositories` in context.ts).
 */
export interface FarmRepository extends FarmReader {
  insert(farm: Omit<Farm, "id">): Promise<FarmId>;
}

/** The trimmed name of a Farm. It must not be empty. */
export function validFarmName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") throw new DomainError("farm.nameRequired");
  return trimmed;
}

/** The settings with a canonical currency code and time zone, or a domain error. */
export function validFarmSettings(settings: FarmSettings): FarmSettings {
  return {
    currency: validCurrency(settings.currency),
    timeZone: validTimeZone(settings.timeZone),
    lambAgeMonths: validLambAge(settings.lambAgeMonths),
  };
}

function validCurrency(currency: string): string {
  const code = currency.trim().toUpperCase();
  if (!Intl.supportedValuesOf("currency").includes(code)) {
    throw new DomainError("farm.currencyInvalid");
  }
  return code;
}

/**
 * The canonical name of an IANA time zone, for example "Asia/Bishkek" for "asia/bishkek". A fixed
 * offset such as "+06:00" is not a time zone of a place, so it is invalid.
 */
function validTimeZone(timeZone: string): string {
  let canonical: string;
  try {
    canonical = new Intl.DateTimeFormat("en-US", { timeZone: timeZone.trim() }).resolvedOptions()
      .timeZone;
  } catch {
    throw new DomainError("farm.timeZoneInvalid");
  }
  if (/^[+-]/.test(canonical)) throw new DomainError("farm.timeZoneInvalid");
  return canonical;
}

function validLambAge(months: number): number {
  if (!Number.isInteger(months) || months < minLambAgeMonths || months > maxLambAgeMonths) {
    throw new DomainError("farm.lambAgeInvalid");
  }
  return months;
}

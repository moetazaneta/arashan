import { describe, expect, test } from "vite-plus/test";

import { addMonths, dateAt, isCalendarDate } from "./dates";

describe("isCalendarDate", () => {
  test.each(["2026-10-18", "2024-02-29", "1900-01-01"])("%s is a date", (text) => {
    expect(isCalendarDate(text)).toBe(true);
  });

  test.each([
    "2026-02-29",
    "2026-13-01",
    "2026-00-10",
    "2026-10-32",
    "26-10-18",
    "2026-1-5",
    "",
    "1899-12-31",
  ])("%s is not a date", (text) => {
    expect(isCalendarDate(text)).toBe(false);
  });
});

describe("dateAt", () => {
  test("gives the date in the time zone", () => {
    // 20:00 UTC is already the next day in Bishkek (UTC+6).
    const time = Date.UTC(2026, 9, 18, 20);
    expect(dateAt(time, "Asia/Bishkek")).toBe("2026-10-19");
    expect(dateAt(time, "UTC")).toBe("2026-10-18");
  });
});

describe("addMonths", () => {
  test.each([
    ["2026-01-15", 4, "2026-05-15"],
    ["2026-10-15", 4, "2027-02-15"],
    ["2026-01-31", 1, "2026-02-28"],
    ["2024-01-31", 1, "2024-02-29"],
    ["2026-08-31", 12, "2027-08-31"],
  ])("%s + %i months is %s", (date, months, expected) => {
    expect(addMonths(date, months)).toBe(expected);
  });
});

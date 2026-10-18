import { describe, expect, test } from "vite-plus/test";

import { dateAt } from "../dates";
import { isLamb, tagKey, withLamb } from "./sheep";

describe("tagKey", () => {
  test.each([
    ["A-12", "a-12 "],
    ["  KG 0012", "kg   0012"],
    // Cyrillic letters that look like Latin ones, as a Russian keyboard types them.
    ["А-12", "A-12"],
    ["КР 7", "KP 7"],
    ["Х-ОН", "x-oh"],
  ])("%s and %s are the same Tag", (a, b) => {
    expect(tagKey(a)).toBe(tagKey(b));
  });

  test.each([
    ["12", "012"],
    ["A-12", "A12"],
    ["Б-1", "B-1"],
  ])("%s and %s are different Tags", (a, b) => {
    expect(tagKey(a)).not.toBe(tagKey(b));
  });
});

describe("isLamb", () => {
  test("a Sheep is a Lamb until it is as old as the lamb age of the Farm", () => {
    expect(isLamb("2026-06-18", 4, "2026-06-18")).toBe(true);
    expect(isLamb("2026-06-18", 4, "2026-10-17")).toBe(true);
    expect(isLamb("2026-06-18", 4, "2026-10-18")).toBe(false);
    expect(isLamb("2026-06-18", 6, "2026-10-18")).toBe(true);
  });

  test("a Sheep born on the last day of a month is a Lamb until the last day of the month later", () => {
    // Four months after October 31 is February 28.
    expect(isLamb("2026-10-31", 4, "2027-02-27")).toBe(true);
    expect(isLamb("2026-10-31", 4, "2027-02-28")).toBe(false);
  });

  test("a Sheep without a birth date is an adult", () => {
    expect(isLamb(null, 12, "2026-10-18")).toBe(false);
  });
});

describe("withLamb", () => {
  test("flags the Lambs on today's date in the time zone of the Farm", () => {
    // 20:00 UTC on October 17 is already October 18 in Bishkek.
    const now = Date.UTC(2026, 9, 17, 20);
    const sheep = [{ birthDate: "2026-06-18" }, { birthDate: null }];

    expect(withLamb(sheep, { lambAgeMonths: 4 }, dateAt(now, "UTC"))).toEqual([
      { birthDate: "2026-06-18", lamb: true },
      { birthDate: null, lamb: false },
    ]);
    expect(withLamb(sheep, { lambAgeMonths: 4 }, dateAt(now, "Asia/Bishkek"))).toEqual([
      { birthDate: "2026-06-18", lamb: false },
      { birthDate: null, lamb: false },
    ]);
  });
});

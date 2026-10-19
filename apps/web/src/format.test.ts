import { describe, expect, it } from "vite-plus/test";

import { amountText, formatAmount, parseAmount } from "./format";

describe("parseAmount", () => {
  it.each([
    ["1500", 150000],
    ["1 500,50", 150050],
    ["1500.5", 150050],
    [" 1 500,05 ", 150005],
    ["1 500.01", 150001],
    ["0,29", 29],
    ["0", 0],
    ["1 000 000 000,00", 100000000000],
  ])("reads «%s» as %i hundredths", (text, expected) => {
    expect(parseAmount(text)).toBe(expected);
  });

  it.each(["", "-1", "1.234", "1,234", "1,2.3", "1.", ".50", "1e3", "15 00", "1500 сом"])(
    "rejects «%s»",
    (text) => {
      expect(parseAmount(text)).toBeNull();
    },
  );

  it("rejects an amount that is not a safe integer of hundredths", () => {
    expect(parseAmount("9007199254740991")).toBeNull();
  });
});

describe("formatAmount", () => {
  it("shows the hundredths only if the amount has them, unless a column asks for them", () => {
    expect(formatAmount(150000, "en")).toBe("1,500");
    expect(formatAmount(150050, "en")).toBe("1,500.50");
    expect(formatAmount(150000, "en", true)).toBe("1,500.00");
  });
});

describe("amountText", () => {
  it.each([150000, 150050, 150001, 100000000000])(
    "gives a text that parses back to %i",
    (amount) => {
      for (const locale of ["ru", "en"])
        expect(parseAmount(amountText(amount, locale))).toBe(amount);
    },
  );
});

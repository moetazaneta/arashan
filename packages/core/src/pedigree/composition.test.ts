import { describe, expect, test } from "vite-plus/test";

import { arashanBreedId } from "../breeds/breed";
import type { BreedId } from "../ids";
import {
  arashanShare,
  type BreedComposition,
  compositionOf,
  isPureArashan,
  manualLimit,
  validManualBreeds,
  wholeShare,
} from "./composition";

const arashan = arashanBreedId;
const edilbay = "breed-edilbay" as BreedId;
const hissar = "breed-hissar" as BreedId;

/** A part in percent, as a test reads it. */
const part = (breedId: BreedId, percent: number) => ({
  breedId,
  share: Math.round(percent * 10_000),
});
const percent = (value: number) => Math.round(value * 10_000);

const pureArashan: BreedComposition = { breeds: [part(arashan, 100)], unknown: 0 };
const pureEdilbay: BreedComposition = { breeds: [part(edilbay, 100)], unknown: 0 };

describe("compositionOf", () => {
  test("a Sheep without known parents is 100 percent Unknown by default", () => {
    expect(compositionOf(null, null, [])).toEqual({ breeds: [], unknown: wholeShare });
  });

  test("without known parents, the parts by hand and the rest Unknown", () => {
    expect(compositionOf(null, null, [part(arashan, 75)])).toEqual({
      breeds: [part(arashan, 75)],
      unknown: percent(25),
    });
  });

  test("the composition of a child is the average of its parents", () => {
    expect(compositionOf(pureArashan, pureEdilbay, [])).toEqual({
      breeds: [part(arashan, 50), part(edilbay, 50)],
      unknown: 0,
    });
  });

  test("a parent that is not known gives 50 percent Unknown", () => {
    expect(compositionOf(pureArashan, null, [])).toEqual({
      breeds: [part(arashan, 50)],
      unknown: percent(50),
    });
    expect(compositionOf(null, pureEdilbay, [])).toEqual({
      breeds: [part(edilbay, 50)],
      unknown: percent(50),
    });
  });

  test("with one parent, a Member gives by hand only the half of the unknown parent", () => {
    expect(compositionOf(pureArashan, null, [part(arashan, 50)])).toEqual(pureArashan);
    expect(compositionOf(pureArashan, null, [part(edilbay, 25)])).toEqual({
      breeds: [part(arashan, 50), part(edilbay, 25)],
      unknown: percent(25),
    });
  });

  test("the Unknown parts of the parents average too", () => {
    const halfArashan = compositionOf(pureArashan, null, []);
    const grandchild = compositionOf(halfArashan, pureArashan, []);

    expect(grandchild).toEqual({ breeds: [part(arashan, 75)], unknown: percent(25) });
  });

  test("the largest part comes first, then by the id of the Breed", () => {
    const mixed = compositionOf(
      { breeds: [part(hissar, 50), part(edilbay, 50)], unknown: 0 },
      { breeds: [part(arashan, 100)], unknown: 0 },
      [],
    );

    expect(mixed.breeds).toEqual([part(arashan, 50), part(edilbay, 25), part(hissar, 25)]);
  });

  test("after many generations the parts stay integers that sum to the whole", () => {
    // Each generation halves the Edilbay part: after seven, it is 0.78125 percent, which is no
    // integer number of millionths.
    let line = pureEdilbay;
    for (let generation = 0; generation < 12; generation += 1) {
      line = compositionOf(line, pureArashan, []);
      const sum = line.breeds.reduce((total, p) => total + p.share, 0) + line.unknown;
      expect(sum).toBe(wholeShare);
      for (const p of line.breeds) expect(Number.isInteger(p.share)).toBe(true);
    }
    expect(arashanShare(line)).toBeGreaterThan(percent(99.9));
    expect(isPureArashan(line)).toBe(false);
  });

  test("the rounding does not depend on which parent is the Mother", () => {
    const a = { breeds: [part(arashan, 33.3333), part(edilbay, 66.6667)], unknown: 0 };
    const b = { breeds: [part(hissar, 33.3333)], unknown: percent(66.6667) };

    expect(compositionOf(a, b, [])).toEqual(compositionOf(b, a, []));
  });
});

describe("isPureArashan", () => {
  test("only 100 percent Arashan and 0 percent Unknown", () => {
    expect(isPureArashan(pureArashan)).toBe(true);
    expect(isPureArashan(compositionOf(pureArashan, null, []))).toBe(false);
    expect(isPureArashan(compositionOf(pureArashan, pureEdilbay, []))).toBe(false);
    expect(isPureArashan(compositionOf(pureArashan, pureArashan, []))).toBe(true);
  });
});

describe("validManualBreeds", () => {
  test("a Member can give 100 percent with no known parent, 50 with one, none with two", () => {
    expect(manualLimit(0)).toBe(wholeShare);
    expect(manualLimit(1)).toBe(wholeShare / 2);
    expect(manualLimit(2)).toBe(0);
    expect(validManualBreeds([part(arashan, 100)], 0)).toEqual([part(arashan, 100)]);
    expect(validManualBreeds([part(arashan, 50)], 1)).toEqual([part(arashan, 50)]);
    expect(() => validManualBreeds([part(arashan, 50.0001)], 1)).toThrow(
      expect.objectContaining({ code: "sheep.breedsTooLarge" }),
    );
    expect(() => validManualBreeds([part(arashan, 1)], 2)).toThrow(
      expect.objectContaining({ code: "sheep.breedsTooLarge" }),
    );
  });

  test.each([
    [[{ breedId: arashan, share: 0 }]],
    [[{ breedId: arashan, share: -1 }]],
    [[{ breedId: arashan, share: 0.5 }]],
    [[part(arashan, 10), part(arashan, 10)]],
  ])("a part that is not a positive integer, or a Breed twice, fails: %o", (parts) => {
    expect(() => validManualBreeds(parts, 0)).toThrow(
      expect.objectContaining({ code: "sheep.breedsInvalid" }),
    );
  });

  test("gives the parts sorted, the largest first", () => {
    expect(validManualBreeds([part(edilbay, 10), part(arashan, 40)], 0)).toEqual([
      part(arashan, 40),
      part(edilbay, 10),
    ]);
  });
});

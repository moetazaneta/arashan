import { describe, expect, test } from "vite-plus/test";

import type { FlockId, FlockMoveId, SheepId, ShepherdAssignmentId, ShepherdId } from "../ids";
import {
  assignedOn,
  type FlockMove,
  flockAt,
  flocksOn,
  flockStays,
  nameKey,
  periodsOverlap,
  type ShepherdAssignment,
} from "./flock";

const a = "flock-a" as FlockId;
const b = "flock-b" as FlockId;
const c = "flock-c" as FlockId;

let nextMove = 1;

/** A move of one Sheep into the Flock (or out of all Flocks) on the date, recorded at the time. */
function move(flockId: FlockId | null, date: string, at = 0): FlockMove {
  return {
    id: `move-${nextMove++}` as FlockMoveId,
    sheepId: "sheep-1" as SheepId,
    flockId,
    date,
    at,
  };
}

function assignment(from: string, to: string | null): ShepherdAssignment {
  return {
    id: "assignment-1" as ShepherdAssignmentId,
    flockId: a,
    shepherdId: "shepherd-1" as ShepherdId,
    from,
    to,
  };
}

describe("flockStays", () => {
  test("gives no stay for no move", () => {
    expect(flockStays([])).toEqual([]);
  });

  test("a stay goes from a move into a Flock to the next move, and the last one goes on now", () => {
    expect(flockStays([move(a, "2026-01-10"), move(b, "2026-03-01")])).toEqual([
      { flockId: a, from: "2026-01-10", to: "2026-03-01" },
      { flockId: b, from: "2026-03-01", to: null },
    ]);
  });

  test("takes the moves in date order, then in the order of their time, whatever the input order", () => {
    const moves = [
      move(c, "2026-05-01"),
      move(b, "2026-03-01", 20),
      move(a, "2026-01-10"),
      move(null, "2026-03-01", 10),
    ];

    expect(flockStays(moves)).toEqual([
      { flockId: a, from: "2026-01-10", to: "2026-03-01" },
      { flockId: b, from: "2026-03-01", to: "2026-05-01" },
      { flockId: c, from: "2026-05-01", to: null },
    ]);
  });

  test("two moves in a row into the same Flock are one stay", () => {
    expect(flockStays([move(a, "2026-01-10"), move(a, "2026-02-01")])).toEqual([
      { flockId: a, from: "2026-01-10", to: null },
    ]);
  });

  test("a move out of all Flocks ends the stay, and a later move starts a new one", () => {
    const moves = [
      move(a, "2026-01-10"),
      move(null, "2026-02-01"),
      move(null, "2026-02-15"),
      move(a, "2026-04-01"),
    ];

    expect(flockStays(moves)).toEqual([
      { flockId: a, from: "2026-01-10", to: "2026-02-01" },
      { flockId: a, from: "2026-04-01", to: null },
    ]);
  });

  test("a move out with no Flock before it gives no stay", () => {
    expect(flockStays([move(null, "2026-01-10")])).toEqual([]);
  });

  test("two moves on one day give a stay of that one day", () => {
    const moves = [move(a, "2026-01-10"), move(b, "2026-03-01", 1), move(c, "2026-03-01", 2)];

    expect(flockStays(moves)).toEqual([
      { flockId: a, from: "2026-01-10", to: "2026-03-01" },
      { flockId: b, from: "2026-03-01", to: "2026-03-01" },
      { flockId: c, from: "2026-03-01", to: null },
    ]);
  });
});

describe("flockAt", () => {
  const moves = [move(a, "2026-01-10"), move(b, "2026-03-01"), move(null, "2026-05-01")];

  test("gives no Flock before the first move", () => {
    expect(flockAt(moves, "2026-01-09")).toBeNull();
  });

  test("gives the Flock at the end of the day: after the move of that day", () => {
    expect(flockAt(moves, "2026-01-10")).toBe(a);
    expect(flockAt(moves, "2026-02-28")).toBe(a);
    expect(flockAt(moves, "2026-03-01")).toBe(b);
    expect(flockAt(moves, "2026-05-01")).toBeNull();
  });

  test("after two moves on one day, gives the Flock of the later one", () => {
    expect(flockAt([move(b, "2026-03-01", 2), move(a, "2026-03-01", 1)], "2026-03-01")).toBe(b);
  });
});

describe("flocksOn", () => {
  test("gives no Flock before the first move", () => {
    expect(flocksOn([move(a, "2026-01-10")], "2026-01-09")).toEqual([]);
  });

  test("gives the Flock on a date inside a stay, and on its first day", () => {
    const moves = [move(a, "2026-01-10")];

    expect(flocksOn(moves, "2026-01-10")).toEqual([a]);
    expect(flocksOn(moves, "2026-06-15")).toEqual([a]);
  });

  test("on the day of a transfer, gives the old Flock and the new one", () => {
    const moves = [move(a, "2026-01-10"), move(b, "2026-03-01")];

    expect(flocksOn(moves, "2026-02-28")).toEqual([a]);
    expect(flocksOn(moves, "2026-03-01")).toEqual([a, b]);
    expect(flocksOn(moves, "2026-03-02")).toEqual([b]);
  });

  test("on the day of a move out of all Flocks, still gives the old Flock", () => {
    const moves = [move(a, "2026-01-10"), move(null, "2026-03-01")];

    expect(flocksOn(moves, "2026-03-01")).toEqual([a]);
    expect(flocksOn(moves, "2026-03-02")).toEqual([]);
  });

  test("gives each Flock one time", () => {
    const moves = [move(a, "2026-01-10"), move(b, "2026-03-01", 1), move(a, "2026-03-01", 2)];

    expect(flocksOn(moves, "2026-03-01")).toEqual([a, b]);
  });
});

describe("assignedOn", () => {
  test("covers the first and the last day", () => {
    const closed = assignment("2026-03-01", "2026-03-31");

    expect(assignedOn(closed, "2026-02-28")).toBe(false);
    expect(assignedOn(closed, "2026-03-01")).toBe(true);
    expect(assignedOn(closed, "2026-03-31")).toBe(true);
    expect(assignedOn(closed, "2026-04-01")).toBe(false);
  });

  test("an open assignment covers each day from its start", () => {
    const open = assignment("2026-03-01", null);

    expect(assignedOn(open, "2026-02-28")).toBe(false);
    expect(assignedOn(open, "2030-01-01")).toBe(true);
  });
});

describe("periodsOverlap", () => {
  const march = { from: "2026-03-01", to: "2026-03-31" };

  test.each([
    [{ from: "2026-03-31", to: "2026-04-30" }, true],
    [{ from: "2026-02-01", to: "2026-03-01" }, true],
    [{ from: "2026-03-10", to: "2026-03-12" }, true],
    [{ from: "2026-04-01", to: "2026-04-30" }, false],
    [{ from: "2026-01-01", to: "2026-02-28" }, false],
    [{ from: "2026-03-31", to: null }, true],
    [{ from: "2026-04-01", to: null }, false],
    [{ from: "2026-01-01", to: null }, true],
  ])("March and %o: %s", (other, overlaps) => {
    expect(periodsOverlap(march, other)).toBe(overlaps);
    expect(periodsOverlap(other, march)).toBe(overlaps);
  });

  test("two open periods always overlap", () => {
    expect(periodsOverlap({ from: "2026-01-01", to: null }, { from: "2030-01-01", to: null })).toBe(
      true,
    );
  });
});

describe("nameKey", () => {
  test.each(["Летнее пастбище", "летнее пастбище", "  ЛЕТНЕЕ   пастбище ", "Лётнее пастбище"])(
    "%s has the key of «Летнее пастбище»",
    (name) => {
      expect(nameKey(name)).toBe(nameKey("Летнее пастбище"));
    },
  );

  test("«Ё» counts as «е»", () => {
    expect(nameKey("ЁЛКА")).toBe(nameKey("елка"));
  });

  test("other letters count", () => {
    expect(nameKey("Кошара 1")).not.toBe(nameKey("Кошара 2"));
    expect(nameKey("Кошара1")).not.toBe(nameKey("Кошара 1"));
  });
});

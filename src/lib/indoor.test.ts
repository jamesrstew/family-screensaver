import { describe, expect, it } from "vitest";
import { STALE_MS, freshIndoor, insideOf, insideText } from "./indoor";
import type { Indoor, Snapshot } from "./types";

const house = (...temps: number[]): Indoor => ({
  temp: Math.round(temps.reduce((s, t) => s + t, 0) / temps.length),
  rooms: temps.map((temp, i) => ({ name: `Room ${i}`, temp })),
});
const one = (temp: number) => ({ kind: "one", temp }) as const;
const range = (low: number, high: number) =>
  ({ kind: "range", low, high, temp: Math.round((low + high) / 2) }) as const;

describe("insideOf", () => {
  it("says nothing without thermostats", () => {
    expect(insideOf(null, null)).toBeNull();
    expect(insideOf(undefined, null)).toBeNull();
    expect(insideOf({ temp: 68, rooms: [] }, null)).toBeNull();
  });

  it("gives the house's one number while the rooms are close", () => {
    expect(insideOf(house(68), null)).toEqual(one(68));
    expect(insideOf(house(67, 70), null)).toEqual(one(69));
  });

  it("gives a range once the rooms are 4° apart", () => {
    expect(insideOf(house(66, 70), null)).toEqual(range(66, 70));
    expect(insideOf(house(64, 66, 71), one(67))).toEqual({ ...range(64, 71), temp: 67 });
  });

  it("holds its form through a wobble: a dead band between 2° and 4°", () => {
    // Shown as one number: 3° apart stays one number.
    expect(insideOf(house(67, 70), one(69))).toEqual(one(69));
    // Shown as a range: 3° apart stays a range; 2° goes back to one number.
    expect(insideOf(house(67, 70), range(66, 70))).toEqual({ ...range(67, 70), temp: 69 });
    expect(insideOf(house(68, 70), range(67, 70))).toEqual(one(69));
  });
});

describe("freshIndoor", () => {
  const issuedAt = "2026-11-17T18:00:00.000Z";
  const snapshot = { issuedAt, indoor: house(68) } as Snapshot;
  const at = (ms: number) => new Date(Date.parse(issuedAt) + ms);
  it("trusts a reading for half an hour, then lets it go", () => {
    expect(freshIndoor(snapshot, at(STALE_MS - 1))).toEqual(house(68));
    expect(freshIndoor(snapshot, at(STALE_MS))).toBeNull();
    expect(freshIndoor({ ...snapshot, indoor: undefined }, at(0))).toBeNull();
  });
});

describe("insideText", () => {
  it("writes the note", () => {
    expect(insideText(one(68))).toBe("68° inside");
    expect(insideText(range(66, 71))).toBe("66° to 71° inside");
  });
});

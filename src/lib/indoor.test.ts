import { describe, expect, it } from "vitest";
import { STALE_MS, freshIndoor } from "./indoor";
import type { Indoor, Snapshot } from "./types";

const AT = "2026-11-17T18:00:00.000Z";
const house = (temp: number): Indoor => ({ at: AT, temp, rooms: [{ name: "Den", temp }] });

describe("freshIndoor", () => {
  const at = (ms: number) => new Date(Date.parse(AT) + ms);
  // The snapshot is new; only the reading's own age counts.
  const snapshot = { issuedAt: at(STALE_MS * 2).toISOString(), indoor: house(68) } as Snapshot;
  it("trusts a reading for half an hour after it was taken, then lets it go", () => {
    expect(freshIndoor(snapshot, at(STALE_MS - 1))).toEqual(house(68));
    expect(freshIndoor(snapshot, at(STALE_MS))).toBeNull();
    expect(freshIndoor({ ...snapshot, indoor: undefined }, at(0))).toBeNull();
  });
});

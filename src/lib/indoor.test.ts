import { describe, expect, it } from "vitest";
import { STALE_MS, insideTemp } from "./indoor";
import type { Snapshot } from "./types";

const issuedAt = "2026-11-17T18:00:00.000Z";
const snapshot = (indoor: Snapshot["indoor"]): Snapshot => ({
  issuedAt,
  place: "Home",
  timeZone: "America/Los_Angeles",
  weather: null,
  happenings: null,
  indoor,
  notebook: [],
  voice: false,
});
const house = {
  temp: 69,
  rooms: [
    { name: "Den", temp: 66 },
    { name: "Loft", temp: 71 },
  ],
};
const at = (ms: number) => new Date(Date.parse(issuedAt) + ms);

describe("insideTemp", () => {
  it("is the house's one number, whatever the rooms say", () => {
    expect(insideTemp(snapshot(house), at(60_000))).toBe(69);
  });

  it("says nothing without thermostats", () => {
    expect(insideTemp(snapshot(null), at(0))).toBeNull();
    expect(insideTemp(snapshot(undefined), at(0))).toBeNull();
  });

  it("says nothing once the reading is too old to trust", () => {
    expect(insideTemp(snapshot(house), at(STALE_MS - 1))).toBe(69);
    expect(insideTemp(snapshot(house), at(STALE_MS))).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { civilTwilight, declination } from "./sun";

describe("declination", () => {
  it("follows the seasons", () => {
    expect(declination(new Date("2026-06-21T12:00:00Z"))).toBeCloseTo(23.4, 0);
    expect(declination(new Date("2026-12-21T12:00:00Z"))).toBeCloseTo(-23.4, 0);
    expect(Math.abs(declination(new Date("2026-03-20T12:00:00Z")))).toBeLessThan(1.5);
  });
});

describe("civilTwilight", () => {
  it("is short at the equator and longer toward the poles", () => {
    const equinox = new Date("2026-03-20T12:00:00Z");
    expect(civilTwilight(0, equinox)).toBeGreaterThanOrEqual(20);
    expect(civilTwilight(0, equinox)).toBeLessThanOrEqual(23);
    // The published figures: about 27 minutes at 35 degrees, 32 at 45.
    expect(civilTwilight(35, equinox)).toBeGreaterThanOrEqual(25);
    expect(civilTwilight(35, equinox)).toBeLessThanOrEqual(28);
    expect(civilTwilight(45, equinox)).toBeGreaterThanOrEqual(29);
    expect(civilTwilight(45, equinox)).toBeLessThanOrEqual(32);
  });

  it("lengthens in summer and winter at mid-latitudes", () => {
    const at = (iso: string) => civilTwilight(42, new Date(iso));
    expect(at("2026-06-21T12:00:00Z")).toBeGreaterThan(at("2026-03-20T12:00:00Z"));
    expect(at("2026-12-21T12:00:00Z")).toBeGreaterThan(at("2026-03-20T12:00:00Z"));
  });

  it("holds the white nights to an hour and a half", () => {
    expect(civilTwilight(65, new Date("2026-06-21T12:00:00Z"))).toBe(90);
    expect(civilTwilight(-65, new Date("2026-12-21T12:00:00Z"))).toBe(90);
  });
});

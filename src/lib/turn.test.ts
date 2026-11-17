import { describe, expect, it } from "vitest";
import { moodOf, twilightOf, DUSK_PEAK } from "./time";
import { PAPER_MS, swapDelay, turnTimes, turnsPaper, veilState } from "./turn";

const TZ = "America/Los_Angeles";
const at = (iso: string) => new Date(iso);
// A winter day whose sunset falls before 5 p.m., so 5 p.m. lands in the dusk.
const sun = {
  sunrise: "2026-11-17T06:52:00-08:00",
  sunset: "2026-11-17T16:48:00-08:00",
  twilight: 28,
};
const mood = (iso: string) => moodOf(at(iso), TZ, sun);

describe("turnsPaper", () => {
  it("turns only between day and night", () => {
    expect(turnsPaper("evening", "night", true)).toBe(true);
    expect(turnsPaper("night", "morning", true)).toBe(true);
    expect(turnsPaper("afternoon", "evening", true)).toBe(false);
    expect(turnsPaper("morning", "afternoon", true)).toBe(false);
  });

  it("doesn't turn at 11 a.m., nor at 5 p.m. inside the dusk", () => {
    expect(
      turnsPaper(mood("2026-11-17T10:59:00-08:00"), mood("2026-11-17T11:00:00-08:00"), true),
    ).toBe(false);
    expect(twilightOf(at("2026-11-17T17:00:00-08:00"), TZ, sun)?.side).toBe("dusk");
    expect(
      turnsPaper(mood("2026-11-17T16:59:00-08:00"), mood("2026-11-17T17:00:00-08:00"), true),
    ).toBe(false);
    // The real turn, halfway through the dusk.
    expect(
      turnsPaper(mood("2026-11-17T17:01:00-08:00"), mood("2026-11-17T17:02:00-08:00"), true),
    ).toBe(true);
  });

  it("doesn't turn while waking up: the paper takes its mood at once", () => {
    expect(turnsPaper("evening", "night", false)).toBe(false);
  });
});

describe("the turn's timing", () => {
  it("changes the paper after the page has sunk, and ends after the paper has turned", () => {
    expect(turnTimes(1500)).toEqual({ sunk: 1500, turned: 1500 + PAPER_MS });
  });

  it("holds the next page while the paper turns, then lets it in at once", () => {
    expect(swapDelay(true, true, false, 1500)).toBeNull();
    expect(swapDelay(true, false, true, 1500)).toBe(0);
    expect(swapDelay(true, false, false, 1500)).toBe(1500);
    expect(swapDelay(false, false, true, 1500)).toBeNull();
  });
});

describe("veilState", () => {
  const dusk = { side: "dusk" as const, depth: 0.3 };
  it("lies on home's day paper, gliding a minute at a time", () => {
    const v = veilState({ twilight: dusk, on: true, turning: false, paper: "evening" });
    expect(v.opacity).toBeGreaterThan(0);
    expect(v.shown).toBe(true);
    expect(v.quick).toBe(false);
  });

  it("holds its peak through the turn, and moves quickly then", () => {
    const v = veilState({
      twilight: { side: "dusk", depth: 0.5 },
      on: true,
      turning: true,
      paper: "evening",
    });
    expect(v).toEqual({ opacity: DUSK_PEAK.dusk, shown: true, quick: true });
  });

  it("lifts quickly off a page someone asked for, and isn't drawn when clear", () => {
    expect(veilState({ twilight: dusk, on: false, turning: false, paper: "evening" })).toEqual({
      opacity: 0,
      shown: false,
      quick: true,
    });
    expect(veilState({ twilight: null, on: true, turning: false, paper: "afternoon" }).shown).toBe(
      false,
    );
    // After the dusk turn, nothing over the night's paper.
    expect(
      veilState({
        twilight: { side: "dusk", depth: 0.7 },
        on: true,
        turning: false,
        paper: "night",
      }),
    ).toEqual({ opacity: 0, shown: false, quick: true });
  });
});

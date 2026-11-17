import { describe, expect, it } from "vitest";
import {
  PASSAGE_MS,
  WEATHER_MS,
  WEATHER_VIEWS,
  nextTurnIn,
  sinceAfter,
  slideFromKey,
  slideKey,
  slideOf,
  turns,
  type Slide,
} from "./carousel";
import { targetOf } from "./show";

const turn = WEATHER_MS + PASSAGE_MS;
const since = 1_000 * turn + 12_345; // home appeared at an odd moment
const at = (ms: number) => new Date(since + ms);

describe("home's carousel", () => {
  it("always opens on the weather, never a quote", () => {
    for (const s of [0, 7_777, 99_999_999]) {
      expect(slideOf(new Date(s), s, true).kind).toBe("weather");
    }
  });

  it("then a passage, then the next weather view", () => {
    expect(slideOf(at(WEATHER_MS - 1), since, true).kind).toBe("weather");
    expect(slideOf(at(WEATHER_MS), since, true).kind).toBe("passage");
    expect(slideOf(at(turn - 1), since, true).kind).toBe("passage");
    expect(slideOf(at(turn), since, true).kind).toBe("weather");
  });

  it("each passage is a new one", () => {
    const a = slideOf(at(WEATHER_MS), since, true);
    const b = slideOf(at(turn + WEATHER_MS), since, true);
    expect(slideKey(a)).not.toBe(slideKey(b));
  });

  it('opens on "now"', () => {
    expect(slideOf(at(0), since, true)).toEqual({ kind: "weather", view: "now" });
  });

  it("goes through every weather view in order, whenever home appeared", () => {
    for (let r = 0; r < 4; r++) {
      const s = r * turn + 4_321;
      const views = WEATHER_VIEWS.map((_, i) => slideOf(new Date(s + i * turn), s, true));
      expect(views.map((v) => (v.kind === "weather" ? v.view : null))).toEqual([...WEATHER_VIEWS]);
    }
  });

  it("without a weather report, stays on passages", () => {
    expect(slideOf(at(0), since, false).kind).toBe("passage");
  });
});

describe("slide keys", () => {
  it("round-trip", () => {
    for (const s of [
      { kind: "passage", n: 42 } as const,
      { kind: "weather", view: "hours" } as const,
    ])
      expect(slideFromKey(slideKey(s))).toEqual(s);
    expect(slideFromKey("weather-tornado")).toBeUndefined();
  });
});

describe("night turns as day does", () => {
  const now = Date.parse("2026-11-18T17:00:00-08:00");
  it("carries on across sunset and sunrise: day and night are one carousel", () => {
    const since = now - 95_000;
    expect(sinceAfter("home", "night", now, since)).toBe(since);
    expect(sinceAfter("night", "home", now, since)).toBe(since);
  });
  it("starts over, on the weather, coming back from another page", () => {
    expect(sinceAfter("week", "night", now, 0)).toBe(now);
    expect(sinceAfter("notebook", "home", now, 0)).toBe(now);
  });
  it("opens on a passage after the Weather page (the weather's just been seen)", () => {
    const since = sinceAfter("weather", "night", now, 0);
    expect(slideOf(new Date(now), since, true).kind).toBe("passage");
  });
  it("leaves other pages alone", () => {
    expect(sinceAfter("home", "week", now, 123)).toBe(123);
    expect(turns("night")).toBe(true);
    expect(turns("weather")).toBe(false);
  });
  it("keeps a weather slide's name across sunset; a passage turns with the mood", () => {
    const at = (base: "home" | "night", sl: Slide) =>
      targetOf({ base, slide: slideKey(sl), asked: null, fromUrl: "now" });
    const now: Slide = { kind: "weather", view: "now" };
    // The weather slide that's up when the sun sets keeps its place (and its lens).
    expect(at("home", now)).toBe(at("night", now));
    expect(at("night", { kind: "passage", n: 7 })).toBe("night:passage-7");
    expect(at("home", { kind: "passage", n: 7 })).toBe("home:passage-7");
  });
});

describe("the cadence, pinned", () => {
  it("turns every half minute, a weather view and then a passage", () => {
    expect(WEATHER_MS).toBe(30_000);
    expect(PASSAGE_MS).toBe(30_000);
  });
  it("lands each turn on its moment, not on the next tick", () => {
    const since = 1_000_000;
    expect(nextTurnIn(since, since)).toBe(WEATHER_MS);
    expect(nextTurnIn(since + 12_000, since)).toBe(WEATHER_MS - 12_000);
    expect(nextTurnIn(since + WEATHER_MS + 1_000, since)).toBe(PASSAGE_MS - 1_000);
    expect(nextTurnIn(since - 5_000, since)).toBe(WEATHER_MS);
  });
});

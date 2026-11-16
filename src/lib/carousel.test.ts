import { describe, expect, it } from "vitest";
import { PASSAGE_MS, WEATHER_MS, WEATHER_VIEWS, slideFromKey, slideKey, slideOf } from "./carousel";

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

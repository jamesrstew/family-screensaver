import { describe, expect, it } from "vitest";
import { PASSAGE_MS, WEATHER_MS, WEATHER_VIEWS, slideFromKey, slideKey, slideOf } from "./carousel";

const turn = PASSAGE_MS + WEATHER_MS;
const at = (ms: number) => new Date(ms);

describe("home's carousel", () => {
  it("shows a passage, then the weather, then the next passage", () => {
    const start = 1_000 * turn;
    expect(slideOf(at(start), true)).toEqual({ kind: "passage", n: 1000 });
    expect(slideOf(at(start + PASSAGE_MS - 1), true).kind).toBe("passage");
    expect(slideOf(at(start + PASSAGE_MS), true).kind).toBe("weather");
    expect(slideOf(at(start + turn), true)).toEqual({ kind: "passage", n: 1001 });
  });

  it("cycles through every weather view", () => {
    const seen = new Set(
      WEATHER_VIEWS.map((_, i) => slideKey(slideOf(at(i * turn + PASSAGE_MS), true))),
    );
    expect(seen.size).toBe(WEATHER_VIEWS.length);
  });

  it("without a weather report, stays on passages", () => {
    expect(slideOf(at(7 * turn + PASSAGE_MS), false)).toEqual({ kind: "passage", n: 7 });
  });
});

describe("slide keys", () => {
  it("round-trip", () => {
    for (const s of [
      { kind: "passage", n: 42 } as const,
      { kind: "weather", view: "days" } as const,
    ])
      expect(slideFromKey(slideKey(s))).toEqual(s);
    expect(slideFromKey("weather-tornado")).toBeUndefined();
  });
});

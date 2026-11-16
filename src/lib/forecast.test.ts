import { describe, expect, it } from "vitest";
import { describe as label, forecastLine } from "./forecast";
import type { Weather } from "./types";

function weather(days: Array<[code: number, chance: number]>, high = 38): Weather {
  return {
    now: { temp: 30, label: "Fair", code: 0, isDay: true },
    today: {
      high,
      low: 20,
      precipChance: days[0][1],
      label: label(days[0][0]),
      sunrise: "",
      sunset: "",
    },
    days: days.map(([code, chance], i) => ({
      date: `2026-11-${16 + i}`,
      high,
      low: 20,
      precipChance: chance,
      code,
      label: label(code),
    })),
    hours: [],
  };
}

describe("forecastLine", () => {
  it("names the next wet day", () => {
    const w = weather([
      [2, 0],
      [0, 0],
      [0, 10],
      [73, 70],
    ]);
    expect(forecastLine(w)).toBe(
      "Partly cloudy and cold, with a high of 38°. Snow likely Thursday.",
    );
  });
  it("leads with today when today is wet", () => {
    expect(forecastLine(weather([[63, 80]], 60))).toBe(
      "Rain and mild, with a high of 60°. Rain likely today.",
    );
  });
  it("says so when it's dry", () => {
    expect(
      forecastLine(
        weather(
          [
            [0, 0],
            [1, 5],
          ],
          88,
        ),
      ),
    ).toMatch(/^Fair and hot.*Dry days ahead\.$/);
  });
});

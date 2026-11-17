import { describe, expect, it } from "vitest";
import { conditionOf, waysOf, wearLine, type Condition, type Facts } from "./wear";

/** A plain, cool, dry November day; each test changes what it needs. */
const base: Facts = {
  when: "today",
  date: "2026-11-18",
  cold: 34,
  warm: 44,
  coldFeel: 30,
  hotFeel: 44,
  wind: 6,
  dew: 25,
  fall: null,
  wetHours: 0,
  wakingHours: 10,
  wetNow: false,
  freshSnow: 0,
  clear: false,
  frost: false,
  afternoon: true,
  airOk: true,
  warmest: false,
};
const day = (f: Partial<Facts>): Facts => ({ ...base, ...f });

describe("conditionOf: each line has a real trigger", () => {
  const cases: Array<[Partial<Facts>, Condition]> = [
    [{ freshSnow: 3, clear: true, cold: 22 }, "powder"],
    [{ freshSnow: 3, clear: false, cold: 22 }, "fresh-snow"],
    [{ freshSnow: 3, clear: true, fall: "snow", wetHours: 4 }, "snowing"],
    [{ fall: "rain", wetHours: 8 }, "rain-all-day"],
    [{ fall: "rain", wetHours: 1 }, "shower"],
    [{ fall: "rain", wetHours: 2, wetNow: true }, "rain"],
    [{ fall: "rain", wetHours: 8, wakingHours: 13 }, "rain"],
    [{ fall: "storms", wetHours: 4 }, "rain"],
    [{ cold: 30, coldFeel: 19 }, "wind-chill"],
    [{ cold: 36, coldFeel: 30, frost: true }, "frost"],
    [{ cold: 75, warm: 92, coldFeel: 75, hotFeel: 92 }, "heat"],
    [{ cold: 72, warm: 86, coldFeel: 72, hotFeel: 96 }, "heat"],
    [{ cold: 70, warm: 84, coldFeel: 70, hotFeel: 86, dew: 67 }, "muggy"],
    [{ cold: 52, warm: 68, coldFeel: 52, hotFeel: 68 }, "walk"],
    [{ cold: 45, warm: 56, coldFeel: 44, warmest: true }, "warmest"],
    [{ cold: 12, coldFeel: 8 }, "bitter"],
    [{ cold: 34, coldFeel: 30 }, "cold"],
    [{ cold: 48, coldFeel: 46, warm: 54 }, "cool"],
    [{ cold: 60, coldFeel: 60, warm: 64, afternoon: false }, "sweater"],
    [{ cold: 68, coldFeel: 68, warm: 82, hotFeel: 82, afternoon: false }, "warm"],
  ];
  it.each(cases)("%o is %s", (f, c) => expect(conditionOf(day(f))).toBe(c));

  it("never invites anyone out when the air isn't fine", () => {
    expect(conditionOf(day({ cold: 52, warm: 68, coldFeel: 52, airOk: false }))).not.toBe("walk");
  });
  it("doesn't call a windy day mild for a walk", () => {
    expect(conditionOf(day({ cold: 52, warm: 68, coldFeel: 52, wind: 15 }))).not.toBe("walk");
  });
  it("needs a clear sky before suggesting the hill", () => {
    expect(wearLine(day({ freshSnow: 2, clear: false, cold: 22 }))).not.toMatch(/hill|sled|powder/);
  });
});

describe("wearLine", () => {
  const allDays = (f: Partial<Facts>, n = 10) =>
    Array.from({ length: n }, (_, i) =>
      wearLine(
        day({ ...f, date: new Date(Date.UTC(2026, 10, 18 + i)).toISOString().slice(0, 10) }),
      ),
    );

  it("holds all day: the same facts give the same line", () => {
    expect(wearLine(day({}))).toBe(wearLine(day({})));
  });
  it("never says the same thing two days running when it has another way", () => {
    for (const f of [{}, { cold: 12, coldFeel: 10 }, { fall: "snow" as const, wetHours: 5 }]) {
      const lines = allDays(f);
      lines.slice(1).forEach((line, i) => expect(line).not.toBe(lines[i]));
      expect(new Set(lines).size).toBe(waysOf(conditionOf(day(f))));
    }
  });
  it("keeps the practical part in every line", () => {
    for (const line of allDays({ fall: "snow", wetHours: 5 })) expect(line).toMatch(/boots/i);
    for (const line of allDays({ cold: 12, coldFeel: 10 })) expect(line).toMatch(/heavy coat/);
    for (const line of allDays({ freshSnow: 3, clear: true, cold: 12, coldFeel: 12 }))
      expect(line).toMatch(/boots and heavy layers/i);
    for (const line of allDays({ fall: "rain", wetHours: 8 })) expect(line).toMatch(/umbrella/);
    for (const line of allDays({ freshSnow: 3, clear: true, cold: 22 }))
      expect(line).toMatch(/warm coat/);
    for (const line of allDays({ cold: 36, frost: true })) expect(line).toMatch(/scraper/);
    for (const line of allDays({ cold: 30, coldFeel: 19 })) expect(line).toMatch(/19°/);
  });
  it("speaks of tomorrow as tomorrow", () => {
    for (const line of allDays({ when: "tomorrow" })) expect(line).toMatch(/^Tomorrow[,:]/);
  });
  it("fits where the coat line always has: one line under the sentence", () => {
    const conditions: Array<Partial<Facts>> = [
      { freshSnow: 3, clear: true, cold: 12, coldFeel: 5, when: "tomorrow" },
      { fall: "rain", wetHours: 8, cold: 12, when: "tomorrow" },
      { cold: 12, coldFeel: 2, when: "tomorrow" },
      { cold: 60, warm: 70, coldFeel: 60, when: "tomorrow" },
      { cold: 75, warm: 96, coldFeel: 75, hotFeel: 108, when: "tomorrow" },
    ];
    for (const f of conditions)
      for (const line of allDays(f, 3)) expect(line.length).toBeLessThanOrEqual(80);
  });
});

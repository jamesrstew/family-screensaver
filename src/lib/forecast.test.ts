import { describe, expect, it } from "vitest";
import {
  NOW_STALE_MS,
  describe as label,
  forecastLine,
  hoursLine,
  nowIsFresh,
  outlook,
  weekLine,
} from "./forecast";
import type { Weather } from "./types";
import { fakeWeather, SKIES } from "./weather-fixtures";

const tz = "America/Denver";
const at = (t: string, day = 16) => new Date(`2026-11-${day}T${t}:00-07:00`);

/*
 * The morning that found the bug: overcast and 45° at 1 p.m., the model
 * showing light snow this evening at under a 20% chance, and a daily label of
 * "Snow" with a high of 46° (reached before the page's hours began). The old
 * line said "Snow and cool, with a high of 46°." None of that was true.
 */
function bugMorning(): Weather {
  const hourly: Array<[temp: number, code: number, chance: number]> = [
    [45, 3, 1],
    [45, 3, 4],
    [44, 3, 10],
    [37, 71, 14],
    [36, 71, 18],
    [35, 73, 17],
    [36, 71, 15],
    [35, 2, 12],
    [34, 1, 20],
    [33, 3, 21],
    [34, 3, 11],
    [33, 2, 4],
    [33, 3, 2],
    [32, 2, 1],
    [32, 0, 1],
    [32, 0, 1],
    [32, 0, 1],
    [32, 0, 1],
    [32, 0, 0],
    [32, 0, 0],
    [32, 0, 0],
    [37, 0, 0],
    [39, 0, 0],
    [41, 0, 0],
  ];
  const daily: Array<[code: number, high: number, low: number, chance: number]> = [
    [73, 46, 30, 21],
    [3, 44, 31, 40],
    [73, 43, 29, 64],
    [3, 33, 26, 9],
    [3, 41, 25, 8],
    [51, 39, 27, 33],
    [3, 42, 27, 17],
  ];
  return {
    now: { temp: 45, label: "Overcast", code: 3, isDay: true },
    today: {
      high: 46,
      low: 30,
      precipChance: 21,
      label: "Snow",
      sunrise: "2026-11-16T15:01:00.000Z",
      sunset: "2026-11-17T00:37:00.000Z",
    },
    days: daily.map(([code, high, low, chance], i) => ({
      date: `2026-11-${16 + i}`,
      high,
      low,
      precipChance: chance,
      code,
      label: label(code),
    })),
    hours: hourly.map(([temp, code, chance], i) => ({
      time: new Date(Date.parse("2026-11-16T20:00:00Z") + i * 3_600_000).toISOString(),
      temp,
      precipChance: chance,
      code,
      isDay: i < 4 || i >= 18,
    })),
  };
}

describe("outlook", () => {
  it("never mixes the day's worst hour with the sky right now", () => {
    const o = outlook(bugMorning(), at("13:10"), tz);
    expect(o.line).toBe("Cloudy and 45° now, down to 32° tonight.");
    expect(o.line).not.toMatch(/snow|46/i);
    // A sub-20% chance of snow is a few flakes, not "snow".
    expect(o.timing).toBe("A few flakes possible this evening.");
    expect(o.parts.map((p) => `${p.label} ${p.temp}° ${p.words}`)).toEqual([
      "This afternoon 45° Cloudy",
      "Tonight 32° Cloudy",
      "Tomorrow 44° Cloudy",
    ]);
    expect(o.wear).toMatch(/warm coat/i);
    expect(o.ahead).toBe("Snow likely Wednesday.");
    expect(forecastLine(bugMorning(), at("13:10"), tz)).toBe(
      "Cloudy and 45° now, down to 32° tonight. A few flakes possible this evening.",
    );
  });

  it("times the snow, and asks for boots", () => {
    const now = at("07:30");
    const o = outlook(fakeWeather("snow", now, tz), now, tz);
    expect(o.line).toBe("Cloudy and 26° now, up to 33° this afternoon.");
    expect(o.timing).toBe("Snow likely from 2 p.m. until about 10 p.m.");
    expect(o.wear).toMatch(/boots/i);
    expect(o.wear).toMatch(/warm coat/);
    expect(o.ahead).toBe("A chance of snow tomorrow.");
    expect(o.tone).toBe("snow");
  });

  it("says when it stops, while it's falling", () => {
    const now = at("16:30");
    expect(outlook(fakeWeather("snow", now, tz), now, tz).timing).toBe("Snow until about 10 p.m.");
    const rain = at("07:30");
    expect(outlook(fakeWeather("rain", rain, tz), rain, tz).timing).toBe(
      "Rain until about 11 a.m.",
    );
  });

  it("times the storms, not the rain around them", () => {
    const morning = at("07:30");
    expect(outlook(fakeWeather("storm", morning, tz), morning, tz).timing).toBe(
      "Storms likely from 3 p.m. until about 7 p.m.",
    );
    const lunch = at("13:10");
    expect(outlook(fakeWeather("storm", lunch, tz), lunch, tz).timing).toBe(
      "Rain now; storms likely from 3 p.m. until about 7 p.m.",
    );
  });

  it("turns to tonight and tomorrow once the day is done", () => {
    const now = at("19:00");
    const o = outlook(fakeWeather("fair", now, tz), now, tz);
    expect(o.focus).toBe("tomorrow");
    expect(o.line).toBe("Clear and 53° now, down to 37° overnight. Tomorrow, sunny and 61°.");
    expect(o.parts.map((p) => p.label)).toEqual(["Tonight", "Tomorrow", "Wednesday"]);
    expect(o.wear).toMatch(/^Tomorrow/);
    expect(o.wear).toMatch(/jacket/i);
  });

  it("past midnight, today is the new day", () => {
    const now = at("02:00", 17);
    const o = outlook(fakeWeather("fair", now, tz), now, tz);
    expect(o.parts.map((p) => p.label)).toEqual(["Tonight", "Today", "Tomorrow"]);
  });

  it("draws a day with only a slight chance as a gray one", () => {
    const o = outlook(bugMorning(), at("19:00"), tz);
    const wed = o.parts.find((p) => p.label === "Wednesday")!;
    expect(wed.words).toBe("Snow likely");
    const now = at("13:10");
    const w = bugMorning();
    w.days[1] = { ...w.days[1], code: 71, precipChance: 20 };
    const tue = outlook(w, now, tz).parts.find((p) => p.label === "Tomorrow")!;
    expect(tue.code).toBe(3);
    expect(tue.words).toBe("Cloudy, a slight chance of snow");
  });

  it("says how long it stays dry", () => {
    const w = fakeWeather("fair", at("07:30"), tz);
    w.days = w.days.map((d) => ({ ...d, code: 1, precipChance: 0 }));
    expect(outlook(w, at("07:30"), tz).ahead).toBe("Dry through Sunday.");
  });

  it("only ever names temperatures the forecast holds", () => {
    for (const sky of SKIES) {
      for (const t of ["06:10", "09:00", "12:30", "16:45", "18:00", "22:30"]) {
        const now = at(t);
        const w = fakeWeather(sky, now, tz);
        const o = outlook(w, now, tz);
        const known = new Set([
          w.now.temp,
          ...w.hours.map((h) => h.temp),
          ...w.days.map((d) => d.high),
        ]);
        for (const n of o.line.match(/\d+(?=°)/g) ?? []) expect(known).toContain(Number(n));
        for (const p of o.parts) expect(known).toContain(p.temp);
        expect(`${o.line} ${o.timing ?? ""} ${o.wear}`).not.toMatch(/\.\./);
      }
    }
  });
});

describe("weekLine", () => {
  it("names the wet days and the range of highs", () => {
    expect(weekLine(bugMorning(), at("13:10"), tz)).toBe(
      "Snow likely Wednesday. Highs from 33° to 46°.",
    );
    const now = at("07:30");
    expect(weekLine(fakeWeather("storm", now, tz), now, tz)).toBe(
      "Storms likely today. Rain likely Sunday. Highs from 68° to 77°.",
    );
  });
  it("says so when it's dry", () => {
    const now = at("07:30");
    const w = fakeWeather("fair", now, tz);
    w.days = w.days.map((d) => ({ ...d, code: 0, precipChance: 0, high: 60 }));
    expect(weekLine(w, now, tz)).toBe("Dry all week. Highs near 60°.");
  });
  it("never calls a week dry when a day shows a chance", () => {
    const now = at("13:10");
    expect(weekLine(fakeWeather("fair", now, tz), now, tz)).toBe(
      "Mostly dry; a chance of rain Friday. Highs from 52° to 61°.",
    );
  });
  it("hours: says when, then where the temperature turns", () => {
    expect(hoursLine(bugMorning(), at("13:10"), tz)).toBe(
      "A few flakes possible this evening. Down to 32° by 2 a.m.",
    );
    const am = at("07:30");
    expect(hoursLine(fakeWeather("snow", am, tz), am, tz)).toMatch(
      /^Snow likely from 2 p\.m\. until about 10 p\.m\. Up to 33° by \d+ (a|p)\.m\.$/,
    );
    const ev = at("19:00");
    expect(hoursLine(fakeWeather("fair", ev, tz), ev, tz)).toMatch(
      /^Dry through tomorrow (morning|afternoon)\. Down to 3\d° by \d a\.m\.$/,
    );
  });
  it("starts the week tomorrow, once the evening comes", () => {
    const now = at("19:00");
    expect(weekLine(fakeWeather("storm", now, tz), now, tz)).toBe(
      "Rain likely Sunday. Highs from 68° to 77°.",
    );
  });
});

describe("smoke in the sky's words", () => {
  const tz = "America/Los_Angeles";
  const now = new Date("2026-08-18T13:00:00-07:00");
  it("calls a smoky day smoky, and puts the air where the coat would go", () => {
    const w = fakeWeather("smoke", now, tz);
    const o = outlook(w, now, tz);
    expect(o.line).toMatch(/^Smoky and \d+° now/);
    expect(o.air).toMatch(/^Unhealthy air, AQI \d+: keep time outside short and easy\.$/);
    // The voice says it too.
    expect(forecastLine(w, now, tz)).toContain(o.air!);
  });
  it("calls the smoky parts of the day smoky, not mostly sunny", () => {
    const o = outlook(fakeWeather("smoke", now, tz), now, tz);
    expect(o.parts.map((p) => p.words)).not.toContain("Mostly sunny");
    expect(o.parts[0].words).toBe("Smoky");
  });
  it("says nothing of the air on a clear day", () => {
    const w = fakeWeather("fair", now, tz);
    expect(outlook(w, now, tz).air).toBeNull();
    expect(outlook(w, now, tz).line).not.toMatch(/Smoky|Hazy/);
  });
});

describe("tomorrow's air, in the evening", () => {
  it("takes the coat line's place when tomorrow won't be fine for everyone", () => {
    const tz = "America/Los_Angeles";
    const now = new Date("2026-11-18T21:00:00-08:00");
    const w = fakeWeather("fair", now, tz);
    w.days[1] = { ...w.days[1], aqi: 182 };
    expect(outlook(w, now, tz).air).toBe(
      "Tomorrow, unhealthy air, AQI up to 182: keep time outside short and easy.",
    );
  });
});

describe("an ozone day", () => {
  it("stays clear in the sky's words, and the air line says ozone", () => {
    const tz = "America/Los_Angeles";
    const now = new Date("2026-08-18T13:00:00-07:00");
    const w = fakeWeather("fair", now, tz);
    w.now = { ...w.now, aqi: 118, ozone: 118, pm: 6, pm10: 30 };
    const o = outlook(w, now, tz);
    expect(o.line).not.toMatch(/Smoky|Hazy/);
    expect(o.parts.map((p) => p.words).join(" ")).not.toMatch(/smoky|hazy/i);
    expect(o.air).toBe(
      "Ozone unhealthy for sensitive groups, AQI 118: take it easy outside if you’re sensitive.",
    );
  });
});

describe("nowIsFresh", () => {
  const at = "2026-11-17T18:00:00.000Z";
  const w = { at } as Weather;
  const after = (ms: number) => new Date(Date.parse(at) + ms);
  it("trusts the report's now for an hour after it was fetched", () => {
    expect(nowIsFresh(w, after(59 * 60_000))).toBe(true);
    expect(nowIsFresh(w, after(NOW_STALE_MS))).toBe(false);
  });
  it("doesn't trust a report with no stamp", () => {
    expect(nowIsFresh({} as Weather, after(0))).toBe(false);
  });
});

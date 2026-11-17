import { describe, expect, it } from "vitest";
import {
  LENS_MS,
  aqiShort,
  aqiWord,
  airFigure,
  daysAirLine,
  daysFeelsLine,
  daysHumidityLine,
  hoursAirLine,
  hoursFeelsLine,
  hoursHumidityLine,
  humidityDayFigure,
  lensOrder,
  amountOf,
  compass,
  daysPrecipLine,
  daysUvLine,
  daysWindLine,
  hourKind,
  hoursPrecipLine,
  hoursUvLine,
  hoursWindLine,
  inches,
  kindOf,
  kindsIn,
  lensAt,
  lensesFor,
  meanDir,
  precipFigure,
  uvFigure,
  uvWord,
  windFigure,
} from "./lenses";
import { fakeWeather } from "./weather-fixtures";

const tz = "America/Los_Angeles";
const at = (t: string) => new Date(`2026-11-18T${t}:00-08:00`);

describe("lensAt", () => {
  const all = ["sky", "precip", "wind", "uv"] as const;
  it("opens on the sky and turns every half minute, round and round", () => {
    expect(lensAt(0, all)).toBe("sky");
    expect(lensAt(LENS_MS - 1, all)).toBe("sky");
    expect(lensAt(LENS_MS, all)).toBe("precip");
    expect(lensAt(3 * LENS_MS, all)).toBe("uv");
    expect(lensAt(4 * LENS_MS, all)).toBe("sky");
  });
  it("skips the lenses that aren't there", () => {
    expect(lensAt(LENS_MS, ["sky", "wind"])).toBe("wind");
    expect(lensAt(2 * LENS_MS, ["sky", "wind"])).toBe("sky");
    expect(lensAt(LENS_MS, [])).toBe("sky");
  });
});

describe("lensesFor", () => {
  const calm = { precip: 0, snow: 0, chance: 0, wind: 5, gust: 9, uv: 0 };
  it("skips rain and snow when none is forecast, and UV in the dark", () => {
    expect(lensesFor([calm, calm])).toEqual(["sky", "wind"]);
  });
  it("shows rain and snow for an amount or a fair chance", () => {
    expect(lensesFor([calm, { ...calm, precip: 0.02 }])).toContain("precip");
    expect(lensesFor([calm, { ...calm, chance: 40 }])).toContain("precip");
    expect(lensesFor([calm, { ...calm, chance: 20 }])).not.toContain("precip");
  });
  it("shows UV once the sun registers", () => {
    expect(lensesFor([calm, { ...calm, uv: 0.4 }])).not.toContain("uv");
    expect(lensesFor([calm, { ...calm, uv: 0.6 }])).toEqual(["sky", "wind", "uv"]);
  });
  it("is the sky alone for an older report with none of it", () => {
    expect(lensesFor([{ chance: 80 }, {}])).toEqual(["sky"]);
    expect(lensesFor([])).toEqual(["sky"]);
  });
});

describe("rain and snow", () => {
  it("tells rain from snow from a mix by the water each brings", () => {
    expect(kindOf(0.1, 0)).toBe("rain");
    expect(kindOf(0.1, 0.7)).toBe("snow"); // all of it fell as snow
    expect(kindOf(0.15, 0.39)).toBe("mix"); // a third as snow
    expect(kindOf(0, 0)).toBeNull();
    expect(kindOf(0.004, 0.02)).toBeNull();
    expect(hourKind(0.15, 0.39)).toBe("rain");
    expect(hourKind(0.1, 0.5)).toBe("snow");
  });
  it("writes inches the way a forecaster does", () => {
    expect(inches(0.04, "rain")).toBe("0.04″");
    expect(inches(0.004, "rain")).toBe("0.01″");
    expect(inches(0.42, "rain")).toBe("0.4″");
    expect(inches(1, "rain")).toBe("1″");
    expect(inches(1.24, "rain")).toBe("1.2″");
    expect(inches(0.36, "snow")).toBe("0.4″");
    expect(inches(3.4, "snow")).toBe("3.5″");
    expect(inches(1.46, "snow")).toBe("1.5″");
    expect(inches(3.1, "snow")).toBe("3″");
    expect(inches(13.6, "snow")).toBe("14″");
    expect(inches(0.04, "snow")).toBe("0.1″");
  });
  it("counts snow as it lies, rain as water", () => {
    expect(amountOf(0.3, 2.1)).toBe("2″");
    expect(amountOf(0.1, 0.66)).toBe("0.7″");
    expect(amountOf(0.3, 0)).toBe("0.3″");
    expect(amountOf(0, 0)).toBeNull();
  });
  it("sets a column's figures, and leaves a dry one blank", () => {
    expect(precipFigure(0.3, 0, 80, "rain")).toEqual({ big: "0.3″", sub: "80%", kind: "rain" });
    expect(precipFigure(0, 0, 40, "snow")).toEqual({ big: "", sub: "40%", kind: "snow" });
    expect(precipFigure(0, 0, 40, "storms").kind).toBe("rain");
    expect(precipFigure(0, 0, 10, null)).toMatchObject({ big: "", sub: "", quiet: true });
  });
  it("knows which kinds a stretch holds", () => {
    expect(
      kindsIn([
        { precip: 0.1, snow: 0 },
        { precip: 0.1, snow: 0.7 },
      ]),
    ).toEqual({
      rain: true,
      snow: true,
    });
    // Rounding leaves a hair of "rain" under pure snow; it isn't rain.
    expect(kindsIn([{ precip: 0.06, snow: 0.4 }])).toEqual({ rain: false, snow: true });
  });
  it("says when and how much over the next day", () => {
    expect(
      hoursPrecipLine("Snow likely from 2 p.m. until about 10 p.m.", [
        { precip: 0.2, snow: 1.4 },
        { precip: 0.3, snow: 2.1 },
      ]),
    ).toBe("Snow likely from 2 p.m. until about 10 p.m. About 3.5″ of snow.");
    expect(hoursPrecipLine(null, [{ precip: 0.004, snow: 0 }])).toBe("Only a trace.");
    expect(hoursPrecipLine("Rain until about 11 a.m.", [{ precip: 0.42, snow: 0 }])).toBe(
      "Rain until about 11 a.m. About 0.4″ of rain.",
    );
  });
  it("says which days and how much over the week", () => {
    const day = (name: string, precip: number, snow: number, chance = 80) => ({
      name,
      precip,
      snow,
      chance,
    });
    expect(
      daysPrecipLine([
        day("today", 0.6, 4),
        day("tomorrow", 0, 0, 0),
        day("Saturday", 0.5, 3.5),
        day("Tuesday", 0.6, 0),
      ]),
    ).toBe("Snow today and Saturday, about 7.5″ in all. Rain Tuesday, about 0.6″.");
    expect(daysPrecipLine([{ ...day("Friday", 0, 0, 40), guess: "snow" }])).toBe(
      "Mostly dry; a chance of snow Friday, little if any.",
    );
  });
  it("finds the same totals in a made-up snowy day", () => {
    const now = at("10:00");
    const w = fakeWeather("snow", now, tz);
    expect(hoursPrecipLine(null, w.hours)).toMatch(/^About \d(\.5)?″ of snow\.$/);
    expect(w.days[0].hourly?.snow).toHaveLength(24);
  });
});

describe("wind", () => {
  it("names the eight points", () => {
    expect(compass(0)).toBe("N");
    expect(compass(292)).toBe("W");
    expect(compass(300)).toBe("NW");
    expect(compass(359)).toBe("N");
    expect(compass(-45)).toBe("NW");
  });
  it("averages bearings across north, weighted by speed", () => {
    expect(meanDir([350, 10], [10, 10])).toBe(0);
    expect(meanDir([270, 90], [10, 10])).toBeUndefined(); // no one direction
    expect(meanDir([270, 280], [0, 0])).toBeUndefined(); // calm
  });
  it("sets a slot's or a day's figures", () => {
    expect(windFigure(12, 12, 20, 300)).toMatchObject({ big: "12", sub: "gusts 20", dir: 300 });
    expect(windFigure(3, 9, 15)).toMatchObject({ big: "3–9", sub: "gusts 15" });
    expect(windFigure(2, 2, 3)).toMatchObject({ big: "2", sub: "", quiet: true });
    expect(windFigure(20, 25, 45)).toMatchObject({ act: true, score: 45 });
  });
  it("says the next day's wind", () => {
    const hour = (t: string, wind: number, gust: number, dir = 270) => ({
      time: at(t).toISOString(),
      wind,
      gust,
      dir,
    });
    expect(
      hoursWindLine(
        [hour("10:00", 8, 14), hour("14:00", 17, 28), hour("20:00", 9, 15)],
        at("10:00"),
        tz,
      ),
    ).toBe("Breezy, 8 to 17 mph from the west. Gusts to 28 mph this afternoon.");
    expect(hoursWindLine([hour("10:00", 1, 3), hour("11:00", 2, 4)], at("10:00"), tz)).toBe(
      "Nearly calm, under 4 mph.",
    );
  });
  it("says the week's windiest and calmest days", () => {
    expect(
      daysWindLine([
        { name: "today", lo: 1, hi: 7, gust: 19 },
        { name: "Saturday", lo: 5, hi: 17, gust: 30 },
        { name: "Sunday", lo: 1, hi: 6, gust: 12 },
      ]),
    ).toBe("Windiest Saturday, 5 to 17 mph, gusts to 30. Calmest Sunday.");
    expect(daysWindLine([{ name: "today", lo: 1, hi: 7, gust: 12 }])).toBe(
      "Light winds all week, never above 7 mph.",
    );
  });
});

describe("UV", () => {
  it("uses the EPA's words", () => {
    expect([1, 3, 6, 8, 11].map(uvWord)).toEqual([
      "low",
      "moderate",
      "high",
      "very high",
      "extreme",
    ]);
    expect(uvWord(2.6)).toBe("moderate"); // the index is a whole number
  });
  it("leaves the dark hours blank and marks the strong sun", () => {
    expect(uvFigure(0.2)).toMatchObject({ big: "", quiet: true });
    expect(uvFigure(4.4)).toEqual({ big: "4", sub: "moderate", act: false, score: 4 });
    expect(uvFigure(7)).toMatchObject({ big: "7", sub: "high", act: true });
  });
  it("says when it peaks, and what to do about it", () => {
    const hour = (t: string, uv: number) => ({ time: at(t).toISOString(), uv });
    expect(hoursUvLine([hour("11:00", 3.1), hour("13:00", 4.4)], at("10:00"), tz)).toBe(
      "Moderate UV, peaking at 4 around 1 p.m. Sunscreen for long hours outside.",
    );
    expect(hoursUvLine([hour("12:00", 1.6)], at("10:00"), tz)).toBe(
      "Low UV, peaking at 2 around noon.",
    );
    expect(hoursUvLine([{ time: "2026-11-19T20:00:00Z", uv: 8 }], at("21:00"), tz)).toBe(
      "Very high UV, peaking at 8 around noon tomorrow. Sunscreen, a hat, and shade at midday.",
    );
  });
  it("says the week's strongest sun", () => {
    expect(
      daysUvLine([
        { name: "today", uv: 2.1 },
        { name: "Friday", uv: 1.6 },
      ]),
    ).toBe("Low UV all week, 2 at most.");
    expect(
      daysUvLine([
        { name: "today", uv: 2 },
        { name: "Saturday", uv: 7.2 },
      ]),
    ).toBe("UV highest Saturday: 7, high. Sunscreen, a hat, and shade at midday.");
  });
});

describe("lensOrder", () => {
  const all = ["sky", "precip", "air", "feels", "wind", "humidity", "uv"] as const;
  it("opens on the sky and carries on after the lens last seen", () => {
    expect(lensOrder(all)).toEqual(all);
    expect(lensOrder(all, "feels")).toEqual([
      "sky",
      "wind",
      "humidity",
      "uv",
      "precip",
      "air",
      "feels",
    ]);
    expect(lensOrder(all, "uv")).toEqual(all);
  });
  it("finds its place when the lens last seen has nothing to say today", () => {
    expect(lensOrder(["sky", "wind", "uv"], "feels")).toEqual(["sky", "wind", "uv"]);
    expect(lensOrder(["sky", "precip", "wind"], "humidity")).toEqual(["sky", "precip", "wind"]);
    expect(lensOrder(["sky", "precip", "wind", "uv"], "air")).toEqual([
      "sky",
      "wind",
      "uv",
      "precip",
    ]);
  });
});

describe("the newer lenses", () => {
  const calm = { temp: 50, feels: 49, rh: 50, dew: 40, aqi: 30, wind: 3, gust: 5 };
  it("shows how it feels only when the feel strays 5° from the thermometer", () => {
    expect(lensesFor([calm])).not.toContain("feels");
    expect(lensesFor([calm, { ...calm, feels: 44 }])).toContain("feels");
    expect(lensesFor([{ ...calm, tempLow: 20, feelsLow: 12 }])).toContain("feels");
  });
  it("shows humidity only when it's sticky or very dry", () => {
    expect(lensesFor([calm])).not.toContain("humidity");
    expect(lensesFor([{ ...calm, dew: 62 }])).toContain("humidity");
    expect(lensesFor([{ ...calm, rh: 12 }])).toContain("humidity");
    expect(
      lensesFor([
        { ...calm, rh: undefined },
        { ...calm, rh: 10 },
      ]),
    ).not.toContain("humidity");
  });
  it("shows the air only when some hour isn't good, even partly known", () => {
    expect(lensesFor([calm])).not.toContain("air");
    expect(lensesFor([calm, { ...calm, aqi: 51 }, { ...calm, aqi: undefined }])).toContain("air");
  });
  it("orders them by what matters", () => {
    expect(
      lensesFor([{ ...calm, precip: 0.2, snow: 0, aqi: 120, feels: 40, dew: 65, uv: 3 }]),
    ).toEqual(["sky", "precip", "air", "feels", "wind", "humidity", "uv"]);
  });
});

describe("how it feels, in words", () => {
  const hour = (t: string, temp: number, feels: number) => ({
    time: at(t).toISOString(),
    temp,
    feels,
  });
  it("says the coldest feel and how far the wind takes it", () => {
    expect(hoursFeelsLine([hour("10:00", 30, 24), hour("22:00", 25, 16)], at("10:00"), tz)).toBe(
      "Feels as cold as 16° tonight, up to 9° below the air.",
    );
    expect(hoursFeelsLine([hour("14:00", 96, 104)], at("10:00"), tz)).toBe(
      "Feels as hot as 104° this afternoon, up to 8° above the air.",
    );
    expect(hoursFeelsLine([hour("14:00", 60, 58)], at("10:00"), tz)).toBe(
      "Feels about like the thermometer says.",
    );
  });
  it("finds a chill at either end of the day", () => {
    const day = (name: string, high: number, feelsHigh: number, low: number, feelsLow: number) => ({
      name,
      high,
      feelsHigh,
      low,
      feelsLow,
    });
    expect(daysFeelsLine([day("today", 33, 24, 24, 21), day("Friday", 30, 26, 15, 8)])).toBe(
      "Feels up to 9° colder than the air; coldest Friday, 8°.",
    );
    expect(daysFeelsLine([day("Saturday", 95, 103, 60, 60)])).toBe(
      "Feels up to 8° warmer than the air; hottest Saturday, 103°.",
    );
  });
});

describe("humidity, in words", () => {
  const hour = (t: string, rh: number, dew: number) => ({ time: at(t).toISOString(), rh, dew });
  it("follows the dew point when it's muggy, the humidity when it's parched", () => {
    expect(hoursHumidityLine([hour("15:00", 60, 66)], at("10:00"), tz)).toBe(
      "Muggy this afternoon, dew point up to 66°.",
    );
    expect(hoursHumidityLine([hour("15:00", 9, 24), hour("04:00", 40, 30)], at("10:00"), tz)).toBe(
      "Very dry air, humidity down to 9% this afternoon.",
    );
    expect(daysHumidityLine([{ name: "Friday", rhLow: 8, dew: 30 }])).toBe(
      "Driest Friday, humidity down to 8%.",
    );
    expect(daysHumidityLine([{ name: "Saturday", rhLow: 50, dew: 71 }])).toBe(
      "Muggiest Saturday, dew point up to 71°.",
    );
  });
  it("sets a day's range", () => {
    expect(humidityDayFigure(9, 38, 36)).toMatchObject({ big: "9\u201338%", sub: "dew 36°" });
  });
});

describe("the air, in words", () => {
  it("uses the EPA's words, shortened only to fit a column", () => {
    expect([50, 51, 101, 151, 201, 301].map(aqiWord)).toEqual([
      "good",
      "moderate",
      "unhealthy for sensitive groups",
      "unhealthy",
      "very unhealthy",
      "hazardous",
    ]);
    expect(aqiShort(120)).toBe("sensitive");
    expect(aqiShort(160)).toBe("unhealthy");
  });
  it("sets a column, with the fine particles when they matter", () => {
    expect(airFigure(undefined)).toMatchObject({ big: "", sub: "" });
    expect(airFigure(30, 7)).toMatchObject({
      big: "30",
      sub: "good",
      quiet: true,
      note: undefined,
    });
    expect(airFigure(168, 76)).toMatchObject({ sub: "unhealthy", note: "PM2.5 76", act: true });
  });
  it("says when it's worst, and what to do", () => {
    const hour = (t: string, aqi?: number) => ({ time: at(t).toISOString(), aqi });
    expect(hoursAirLine([hour("10:00", 120), hour("15:00", 168)], at("10:00"), tz)).toBe(
      "The air is unhealthy this afternoon, AQI up to 168. Best to stay inside.",
    );
    expect(hoursAirLine([hour("15:00", 62), hour("16:00")], at("10:00"), tz)).toBe(
      "The air is moderate this afternoon, AQI up to 62.",
    );
  });
  it("says how far the air forecast reaches", () => {
    expect(
      daysAirLine([
        { name: "today", aqi: 168 },
        { name: "tomorrow", aqi: 182 },
        { name: "Sunday", aqi: 72 },
        { name: "Monday" },
      ]),
    ).toBe("Worst air tomorrow: AQI 182, unhealthy. Forecast through Sunday.");
  });
});

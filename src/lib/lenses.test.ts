import { describe, expect, it } from "vitest";
import {
  amountOf,
  aqiShort,
  aqiWord,
  airFigure,
  compass,
  daysAirLine,
  daysFeelsLine,
  daysHumidityLine,
  daysPrecipLine,
  daysUvLine,
  daysWindLine,
  hourKind,
  hoursAirLine,
  hoursFeelsLine,
  hoursHumidityLine,
  hoursPrecipLine,
  hoursUvLine,
  hoursWindLine,
  humidityDayFigure,
  inchWords,
  inches,
  kindOf,
  kindsIn,
  lensOrder,
  lensesFor,
  meanDir,
  nextLens,
  precipFigure,
  restOfDay,
  uvFigure,
  uvWord,
  windFigure,
} from "./lenses";
import { fakeWeather } from "./weather-fixtures";

const tz = "America/Los_Angeles";
const at = (t: string) => new Date(`2026-11-18T${t}:00-08:00`);

describe("the turn", () => {
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
    expect(lensOrder(["sky", "precip", "wind", "uv"], "air")).toEqual([
      "sky",
      "wind",
      "uv",
      "precip",
    ]);
  });
  it("steps to the next lens, and past one that has just gone quiet", () => {
    const order = ["sky", "precip", "wind"] as const;
    expect(nextLens(order, "sky")).toBe("precip");
    expect(nextLens(order, "wind")).toBe("sky");
    // UV went quiet at dusk while it was showing: on to what follows it.
    expect(nextLens(["sky", "precip", "wind"], "air")).toBe("wind");
    expect(nextLens(["sky", "precip"], "uv")).toBe("sky");
    expect(nextLens(["sky"], "sky")).toBe("sky");
  });
});

describe("lensesFor: only what has something to say", () => {
  const calm = { precip: 0, snow: 0, chance: 0, wind: 6, gust: 12, uv: 2 };
  it("leaves a calm, dry, low-sun day on the sky alone", () => {
    expect(lensesFor([calm, calm])).toEqual(["sky"]);
  });
  it("shows rain and snow for a fair chance of a measurable amount", () => {
    expect(lensesFor([{ ...calm, precip: 0.02, chance: 40 }])).toContain("precip");
    expect(lensesFor([{ ...calm, snow: 0.4, precip: 0.06, chance: 60 }])).toContain("precip");
    // An amount on a slim chance, or a chance of nothing measurable: not news.
    expect(lensesFor([{ ...calm, precip: 0.2, chance: 7 }])).not.toContain("precip");
    expect(lensesFor([{ ...calm, precip: 0.004, chance: 60 }])).not.toContain("precip");
  });
  it("shows wind when it's breezy or gusty", () => {
    expect(lensesFor([{ ...calm, wind: 15 }])).toContain("wind");
    expect(lensesFor([{ ...calm, gust: 25 }])).toContain("wind");
    expect(lensesFor([{ ...calm, wind: 14, gust: 24 }])).not.toContain("wind");
  });
  it("shows UV from the EPA's moderate", () => {
    expect(lensesFor([{ ...calm, uv: 2.4 }])).not.toContain("uv");
    expect(lensesFor([{ ...calm, uv: 2.6 }])).toContain("uv");
  });
  it("shows how it feels when the feel strays 8°, or 5° when bitter or scorching", () => {
    expect(lensesFor([{ ...calm, temp: 40, feels: 33 }])).not.toContain("feels");
    expect(lensesFor([{ ...calm, temp: 40, feels: 32 }])).toContain("feels");
    expect(lensesFor([{ ...calm, temp: 15, feels: 10 }])).toContain("feels");
    expect(lensesFor([{ ...calm, temp: 91, feels: 96 }])).toContain("feels");
    expect(lensesFor([{ ...calm, tempLow: 20, feelsLow: 12 }])).toContain("feels");
  });
  it("shows humidity when muggy, or when dry air meets strong gusts", () => {
    const air = { ...calm, rh: 40, dew: 50 };
    expect(lensesFor([air])).not.toContain("humidity");
    expect(lensesFor([{ ...air, dew: 65 }])).toContain("humidity");
    expect(lensesFor([{ ...air, rh: 9 }])).not.toContain("humidity");
    expect(lensesFor([{ ...air, rh: 9, gust: 28 }])).toContain("humidity");
    expect(
      lensesFor([
        { ...air, rh: undefined },
        { ...air, dew: 70 },
      ]),
    ).not.toContain("humidity");
  });
  it("shows the air from unhealthy for sensitive groups, even partly known", () => {
    expect(lensesFor([{ ...calm, aqi: 80 }])).not.toContain("air");
    expect(
      lensesFor([
        { ...calm, aqi: 101 },
        { ...calm, aqi: undefined },
      ]),
    ).toContain("air");
  });
  it("orders them by what matters", () => {
    expect(
      lensesFor([
        {
          ...calm,
          precip: 0.2,
          chance: 80,
          aqi: 120,
          temp: 40,
          feels: 30,
          wind: 20,
          rh: 60,
          dew: 66,
          uv: 3,
        },
      ]),
    ).toEqual(["sky", "precip", "air", "feels", "wind", "humidity", "uv"]);
  });
  it("is the sky alone for an older report with none of it", () => {
    expect(lensesFor([{ chance: 80 }, {}])).toEqual(["sky"]);
    expect(lensesFor([])).toEqual(["sky"]);
  });
});

describe("restOfDay", () => {
  it("counts only today's hours still to come", () => {
    const w = fakeWeather("rain", at("05:00"), tz);
    const today = w.days[0];
    // Rain from 4 to 11 a.m.; by 2 p.m. it's done.
    const after = restOfDay(today, 14, 10);
    expect(today.precip).toBeGreaterThan(0.3);
    expect(after.precip).toBe(0);
    expect(after.precipChance).toBe(10);
    expect(after.from).toBe(14);
    expect(after.uv).toBeLessThanOrEqual(today.uv!);
    expect(restOfDay(today, 0).precip).toBe(today.precip);
  });
});

describe("rain and snow", () => {
  it("tells rain from snow from a mix by the water each brings", () => {
    expect(kindOf(0.1, 0)).toBe("rain");
    expect(kindOf(0.1, 0.7)).toBe("snow");
    expect(kindOf(0.15, 0.39)).toBe("mix");
    expect(kindOf(0, 0)).toBeNull();
    expect(kindOf(0.004, 0.02)).toBeNull();
    expect(hourKind(0.15, 0.39)).toBe("rain");
    expect(hourKind(0.1, 0.5)).toBe("snow");
  });
  it("writes inches for a column without false precision", () => {
    expect(inches(0.04, "rain")).toBe("<0.1″");
    expect(inches(0.42, "rain")).toBe("0.4″");
    expect(inches(1, "rain")).toBe("1″");
    expect(inches(1.24, "rain")).toBe("1.2″");
    expect(inches(0.36, "snow")).toBe("0.4″");
    expect(inches(3.4, "snow")).toBe("3.5″");
    expect(inches(1.46, "snow")).toBe("1.5″");
    expect(inches(13.6, "snow")).toBe("14″");
    // Sums of hundredths that land a hair under the half.
    expect(inches(0.15 + 0.15 + 0.15, "snow")).toBe("0.5″");
  });
  it("writes inches for a sentence in AP's words", () => {
    expect(inchWords(0.06, "rain")).toBe("under a tenth of an inch");
    expect(inchWords(0.1, "rain")).toBe("about a tenth of an inch");
    expect(inchWords(0.32, "rain")).toBe("about three-tenths of an inch");
    expect(inchWords(0.5, "rain")).toBe("about half an inch");
    expect(inchWords(1.02, "rain")).toBe("about an inch");
    expect(inchWords(1.4, "rain")).toBe("about 1.4 inches");
    expect(inchWords(0.6, "snow")).toBe("under an inch");
    expect(inchWords(1, "snow")).toBe("about an inch");
    expect(inchWords(4.4, "snow")).toBe("about 4½ inches");
    expect(inchWords(3.1, "snow")).toBe("about 3 inches");
    expect(inchWords(13.6, "snow")).toBe("about 14 inches");
  });
  it("counts snow as it lies, rain as water", () => {
    expect(amountOf(0.3, 2.1)).toBe("2″");
    expect(amountOf(0.3, 0)).toBe("0.3″");
    expect(amountOf(0, 0)).toBeNull();
  });
  it("names what falls in the figure, and writes no amount on a slim chance", () => {
    expect(precipFigure(0.3, 0, 80, "rain")).toMatchObject({ big: "0.3″", sub: "rain 80%" });
    expect(precipFigure(0.1, 0.7, 90, null)).toMatchObject({ big: "0.7″", sub: "snow 90%" });
    expect(precipFigure(0, 0, 40, "storms")).toMatchObject({ big: "", sub: "rain 40%" });
    expect(precipFigure(0.1, 0.7, 7, "snow")).toEqual({
      big: "",
      sub: "snow 7%",
      quiet: true,
      small: true,
    });
    expect(precipFigure(0, 0, 10, null)).toEqual({ big: "", sub: "", quiet: true });
  });
  it("marks a heavy fall to act on", () => {
    expect(precipFigure(0.4, 2.5, 90, null).act).toBe(true);
    expect(precipFigure(1.1, 0, 90, null).act).toBe(true);
    expect(precipFigure(0.3, 0, 90, null).act).toBe(false);
  });
  it("knows which kinds a stretch holds", () => {
    expect(
      kindsIn([
        { precip: 0.1, snow: 0 },
        { precip: 0.1, snow: 0.7 },
      ]),
    ).toEqual({ rain: true, snow: true });
    expect(kindsIn([{ precip: 0.06, snow: 0.4 }])).toEqual({ rain: false, snow: true });
  });
  it("says how much over the next day, and when it's heaviest", () => {
    const slot = (from: string, to: string, precip: number, snow: number, chance = 80) => ({
      from: at(from).toISOString(),
      to: at(to).toISOString(),
      precip,
      snow,
      chance,
    });
    expect(
      hoursPrecipLine(
        [
          slot("14:00", "17:00", 0.1, 0.6),
          slot("17:00", "20:00", 0.4, 2.8),
          slot("20:00", "23:00", 0.15, 1),
        ],
        at("10:00"),
        tz,
      ),
    ).toBe("About 4½ inches of snow, heaviest from 5 to 8 p.m.");
    expect(hoursPrecipLine([slot("11:00", "14:00", 0.42, 0)], at("10:00"), tz)).toBe(
      "About four-tenths of an inch of rain, from 11 a.m. to 2 p.m.",
    );
    expect(hoursPrecipLine([slot("11:00", "14:00", 0.04, 0)], at("10:00"), tz)).toBe(
      "A little rain, under a tenth of an inch, from 11 a.m. to 2 p.m.",
    );
    // A slim chance, or nothing measurable: no promise.
    expect(hoursPrecipLine([slot("11:00", "14:00", 0.4, 0, 10)], at("10:00"), tz)).toBe(
      "Little if any.",
    );
    expect(hoursPrecipLine([slot("11:00", "14:00", 0.002, 0)], at("10:00"), tz)).toBe(
      "Little if any.",
    );
  });
  it("names only the days with a fair chance over the week", () => {
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
        day("Thursday", 0.1, 0.7, 7),
        day("Saturday", 0.5, 3.5),
        day("Tuesday", 0.5, 0),
      ]),
    ).toBe("Snow today and Saturday, about 7½ inches in all. Rain Tuesday, about half an inch.");
    expect(daysPrecipLine([day("Thursday", 0.1, 0.7, 7)])).toBe(
      "Mostly dry; a chance of snow Thursday, little if any.",
    );
    expect(daysPrecipLine([{ ...day("Friday", 0, 0, 40), guess: "snow" }])).toBe(
      "Mostly dry; a chance of snow Friday, little if any.",
    );
  });
});

describe("wind", () => {
  it("names the eight points", () => {
    expect(compass(0)).toBe("N");
    expect(compass(292)).toBe("W");
    expect(compass(300)).toBe("NW");
    expect(compass(-45)).toBe("NW");
  });
  it("averages bearings across north, weighted by speed", () => {
    expect(meanDir([350, 10], [10, 10])).toBe(0);
    expect(meanDir([270, 90], [10, 10])).toBeUndefined();
    expect(meanDir([270, 280], [0, 0])).toBeUndefined();
  });
  it("sets a slot's or a day's figures, never with a hole", () => {
    expect(windFigure(12, 12, 20, 300)).toMatchObject({ big: "12", sub: "gusts 20", dir: 300 });
    expect(windFigure(3, 9, 15)).toMatchObject({ big: "3–9", sub: "gusts 15" });
    expect(windFigure(9, 9, 10)).toMatchObject({ sub: "gusts 10" });
    expect(windFigure(9, 9, 9)).toMatchObject({ sub: "—" });
    expect(windFigure(20, 25, 45)).toMatchObject({ act: true, score: 45 });
  });
  it("says the next day's wind in the weather service's words", () => {
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
    expect(hoursWindLine([hour("10:00", 4, 9), hour("14:00", 11, 14)], at("10:00"), tz)).toBe(
      "A light breeze, 4 to 11 mph from the west.",
    );
    expect(hoursWindLine([hour("10:00", 1, 3), hour("11:00", 2, 4)], at("10:00"), tz)).toBe(
      "Nearly calm, under 4 mph.",
    );
  });
  it("says the week's windiest day, and where it blows from", () => {
    expect(
      daysWindLine([
        { name: "today", lo: 1, hi: 7, gust: 19 },
        { name: "Saturday", lo: 5, hi: 17, gust: 30, dir: 280 },
        { name: "Sunday", lo: 1, hi: 6, gust: 12 },
      ]),
    ).toBe("Windiest Saturday, 5 to 17 mph from the west, gusts to 30. Calmest Sunday.");
    expect(daysWindLine([{ name: "today", lo: 1, hi: 12, gust: 20 }])).toBe(
      "Light winds all week, never above 12 mph.",
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
    expect(uvWord(2.6)).toBe("moderate");
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
    expect(hoursUvLine([{ time: "2026-11-19T20:00:00Z", uv: 8 }], at("21:00"), tz)).toBe(
      "Very high UV, peaking at 8 around noon tomorrow. Sunscreen, a hat, and shade at midday.",
    );
  });
  it("says the week's strongest sun", () => {
    expect(
      daysUvLine([
        { name: "today", uv: 2 },
        { name: "Saturday", uv: 7.2 },
      ]),
    ).toBe("The sun's strongest Saturday: UV 7, high. Sunscreen, a hat, and shade at midday.");
  });
});

describe("how it feels, in words", () => {
  const hour = (t: string, temp: number, feels: number) => ({
    time: at(t).toISOString(),
    temp,
    feels,
  });
  it("says the coldest feel and how far below the air", () => {
    expect(hoursFeelsLine([hour("10:00", 30, 24), hour("22:00", 25, 16)], at("10:00"), tz)).toBe(
      "Feels as cold as 16° tonight, up to 9° below the air.",
    );
    expect(hoursFeelsLine([hour("14:00", 96, 104)], at("10:00"), tz)).toBe(
      "Feels as hot as 104° this afternoon, up to 8° above the air.",
    );
    expect(hoursFeelsLine([hour("14:00", 60, 55)], at("10:00"), tz)).toBe(
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
  const hour = (t: string, rh: number, dew: number, gust = 10) => ({
    time: at(t).toISOString(),
    rh,
    dew,
    gust,
  });
  it("follows the dew point when it's muggy", () => {
    expect(hoursHumidityLine([hour("15:00", 60, 66)], at("10:00"), tz)).toBe(
      "Muggy this afternoon, dew point up to 66°.",
    );
    expect(daysHumidityLine([{ name: "Saturday", rhLow: 50, dew: 71 }])).toBe(
      "Muggiest Saturday, dew point up to 71°.",
    );
  });
  it("calls dry air with strong gusts fire weather", () => {
    expect(
      hoursHumidityLine([hour("15:00", 9, 24, 31), hour("04:00", 40, 30)], at("10:00"), tz),
    ).toBe("Fire weather this afternoon: humidity 9%, gusts to 31 mph.");
    expect(daysHumidityLine([{ name: "Friday", rhLow: 8, dew: 30, gust: 32 }])).toBe(
      "Fire weather Friday: humidity down to 8%, gusts to 32 mph.",
    );
  });
  it("sets a day by its driest hour", () => {
    expect(humidityDayFigure(9, 36)).toEqual({ big: "9%", sub: "dew 36°", quiet: false });
    expect(humidityDayFigure(40, 66)).toMatchObject({ quiet: false });
    expect(humidityDayFigure(40, 50)).toMatchObject({ quiet: true });
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
    expect(hoursAirLine([hour("15:00", 120), hour("16:00")], at("10:00"), tz)).toBe(
      "The air is unhealthy for sensitive groups this afternoon, AQI up to 120. Go easy outside if you're sensitive.",
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

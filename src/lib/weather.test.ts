import { describe, expect, it } from "vitest";
import { shape, type OpenMeteo } from "./weather";

// Two days of Open-Meteo's answer, cut down: UTC, so local times are instants.
const hours = Array.from({ length: 48 }, (_, i) => {
  const d = i < 24 ? "2026-11-18" : "2026-11-19";
  return `${d}T${String(i % 24).padStart(2, "0")}:00`;
});
const fill = <T>(f: (i: number) => T) => hours.map((_, i) => f(i));

const base: OpenMeteo = {
  current: { temperature_2m: 30.4, weather_code: 3, is_day: 1 },
  hourly: {
    time: hours,
    temperature_2m: fill(() => 30),
    precipitation_probability: fill(() => 10),
    weather_code: fill(() => 3),
    is_day: fill((i) => (i % 24 >= 7 && i % 24 < 17 ? 1 : 0)),
  },
  daily: {
    time: ["2026-11-18", "2026-11-19"],
    weather_code: [73, 3],
    temperature_2m_max: [33.4, 35],
    temperature_2m_min: [24.6, 22],
    precipitation_probability_max: [90, 10],
    sunrise: ["2026-11-18T06:52", "2026-11-19T06:53"],
    sunset: ["2026-11-18T16:48", "2026-11-19T16:47"],
  },
  utc_offset_seconds: 0,
};

describe("shape", () => {
  const now = new Date("2026-11-18T10:20:00Z");

  it("leaves the lenses out when Open-Meteo doesn't send them", () => {
    const w = shape(base, now);
    expect(w.hours[0].wind).toBeUndefined();
    expect(w.days[0].precip).toBeUndefined();
    expect(w.days[0].hourly).toBeUndefined();
  });

  it("carries rain, snow, wind, and UV, rounded small", () => {
    const w = shape(
      {
        ...base,
        hourly: {
          ...base.hourly,
          precipitation: fill((i) => (i === 14 ? 0.0712 : 0)),
          snowfall: fill((i) => (i === 14 ? 0.4961 : 0)),
          wind_speed_10m: fill((i) => 5.4 + (i % 3)),
          wind_gusts_10m: fill(() => 12.6),
          wind_direction_10m: fill(() => 281),
          uv_index: fill((i) => (i % 24 === 12 ? 1.65 : 0)),
        },
        daily: {
          ...base.daily,
          precipitation_sum: [0.0712, 0],
          snowfall_sum: [0.4961, null],
          wind_speed_10m_max: [7.4, 6.1],
          wind_gusts_10m_max: [12.6, 9.9],
          wind_direction_10m_dominant: [281, 90],
          uv_index_max: [1.65, 1.7],
        },
      },
      now,
    );
    // The next 24 hours start with the current one, 10 a.m.
    expect(w.hours[0]).toMatchObject({ wind: 6, gust: 13, dir: 281, uv: 0 });
    expect(w.hours[2]).toMatchObject({ uv: 1.7 });
    expect(w.hours[4]).toMatchObject({ precip: 0.07, snow: 0.5 });
    expect(w.days[0]).toMatchObject({ precip: 0.07, snow: 0.5, wind: 7, gust: 13, uv: 1.7 });
    // Open-Meteo's null is no number at all.
    expect(w.days[1].snow).toBeUndefined();
    // Each day's hours, from midnight, as columns.
    expect(w.days[0].hourly?.snow).toHaveLength(24);
    expect(w.days[0].hourly?.snow[14]).toBe(0.5);
    expect(w.days[1].hourly?.wind[0]).toBe(5);
  });
});

describe("shape, with yesterday", () => {
  it("sets yesterday's hours aside and starts the days today", () => {
    const yesterday = Array.from(
      { length: 24 },
      (_, i) => `2026-11-17T${String(i).padStart(2, "0")}:00`,
    );
    const time = [...yesterday, ...hours];
    const fill2 = <T>(f: (i: number) => T) => time.map((_, i) => f(i));
    const w = shape(
      {
        ...base,
        hourly: {
          time,
          temperature_2m: fill2(() => 30),
          precipitation_probability: fill2(() => 10),
          precipitation: fill2((i) => (i === 20 ? 0.1 : 0)),
          snowfall: fill2((i) => (i === 20 ? 0.7 : 0)),
          wind_speed_10m: fill2(() => 5),
          wind_gusts_10m: fill2(() => 9),
          uv_index: fill2(() => 0),
        },
        daily: {
          ...base.daily,
          time: ["2026-11-17", ...base.daily.time],
          weather_code: [71, ...base.daily.weather_code],
          temperature_2m_max: [28, ...base.daily.temperature_2m_max],
          temperature_2m_min: [20, ...base.daily.temperature_2m_min],
          precipitation_probability_max: [80, ...base.daily.precipitation_probability_max],
          sunrise: ["2026-11-17T06:51", ...base.daily.sunrise],
          sunset: ["2026-11-17T16:49", ...base.daily.sunset],
        },
      },
      new Date("2026-11-18T10:20:00Z"),
    );
    expect(w.days[0].date).toBe("2026-11-18");
    expect(w.today.sunrise).toBe("2026-11-18T06:52:00.000Z");
    expect(w.yesterday?.date).toBe("2026-11-17");
    expect(w.yesterday?.hourly.snow[20]).toBe(0.7);
  });
});

describe("shape, visibility", () => {
  it("turns Open-Meteo's feet into meters", () => {
    // As Open-Meteo answers with temperature_unit=fahrenheit: current_units.visibility is "ft".
    const w = shape(
      {
        ...base,
        current: { temperature_2m: 30.4, weather_code: 0, is_day: 1, visibility: 26246.7 },
      },
      new Date("2026-11-18T10:20:00Z"),
    );
    expect(w.now.visibility).toBe(8000);
  });
});

describe("shape, across a clock change", () => {
  it("files each hour under the family's own day and hour", () => {
    // Oct. 31 to Nov. 2, 2026 in Chicago: clocks fall back at 2 a.m. on Nov. 1.
    // Open-Meteo labels all three days with one offset (CDT, -5) and 24 hours each.
    const time = ["2026-10-31", "2026-11-01", "2026-11-02"].flatMap((d) =>
      Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, "0")}:00`),
    );
    const fill3 = <T>(f: (i: number) => T) => time.map((_, i) => f(i));
    const w = shape(
      {
        current: { temperature_2m: 50, weather_code: 0, is_day: 1 },
        hourly: {
          time,
          // Each hour's temperature is its index, so we can see where it landed.
          temperature_2m: fill3((i) => i),
          precipitation_probability: fill3(() => 0),
          precipitation: fill3(() => 0),
          snowfall: fill3(() => 0),
          wind_speed_10m: fill3(() => 5),
          wind_gusts_10m: fill3(() => 9),
          uv_index: fill3(() => 0),
        },
        daily: {
          time: ["2026-10-31", "2026-11-01", "2026-11-02"],
          weather_code: [0, 0, 0],
          temperature_2m_max: [60, 60, 60],
          temperature_2m_min: [40, 40, 40],
          precipitation_probability_max: [0, 0, 0],
          sunrise: ["2026-10-31T07:20", "2026-11-01T06:21", "2026-11-02T06:22"],
          sunset: ["2026-10-31T17:50", "2026-11-01T16:49", "2026-11-02T16:48"],
        },
        utc_offset_seconds: -5 * 3600,
      },
      new Date("2026-10-31T15:00:00Z"),
      "America/Chicago",
    );
    const temp = (date: string) => w.days.find((d) => d.date === date)!.hourly!.temp!;
    // Before the change, labels and the clock agree.
    expect(temp("2026-10-31")[9]).toBe(9);
    // After it, the label "10:00" (at -5) is 9 a.m. by the clock (at -6).
    expect(temp("2026-11-02")[9]).toBe(48 + 10);
    // The repeated 1 a.m. keeps its later reading; every hour is filled.
    expect(temp("2026-11-01")[1]).toBe(24 + 2);
    expect(temp("2026-11-01")).toHaveLength(24);
    expect(temp("2026-11-02").every((x) => x != null)).toBe(true);
  });
});

// Made-up skies for tests and design review (?sky=fair|snow|storm|rain|smoke
// in dev). Built around a given moment, so the hours always start "now".

import { describe } from "./forecast";
import { addDays, dayKey, parts } from "./time";
import type { DayHours, Weather } from "./types";

export const SKIES = ["fair", "snow", "storm", "rain", "smoke"] as const;
export type FakeSky = (typeof SKIES)[number];

const HOUR = 3_600_000;

type HourSpec = { code: number; chance: number };
type Spec = {
  low: number;
  high: number;
  /** The wind's calm and peak (mph), where it comes from, and the sun's noon UV. */
  wind: [calm: number, peak: number, dir: number];
  uv: number;
  /** Humidity at the afternoon's driest and the dawn's dampest (%). */
  rh: [dry: number, damp: number];
  /** Each day's worst air (US AQI); the air forecast runs five days. */
  aqi: number[];
  /** How far one can see, meters. */
  visibility: number;
  /** The sky for a local hour of a day (0: today, 1: tomorrow). */
  hour: (day: number, h: number) => HourSpec;
  days: Array<[code: number, high: number, low: number, chance: number]>;
};

const fair = (h: number): HourSpec => ({
  code: h >= 7 && h < 17 ? (h % 4 === 0 ? 1 : 0) : 0,
  chance: 0,
});

const SPECS: Record<FakeSky, Spec> = {
  // A plain, bright autumn day.
  fair: {
    low: 36,
    high: 58,
    wind: [3, 9, 300],
    uv: 3,
    rh: [40, 80],
    aqi: [32, 28, 35, 41, 30],
    visibility: 40_000,
    hour: (_, h) => fair(h),
    days: [
      [1, 58, 36, 0],
      [0, 61, 38, 0],
      [2, 57, 40, 10],
      [3, 54, 41, 20],
      [61, 52, 43, 40],
      [1, 55, 39, 5],
      [0, 58, 37, 0],
      [2, 56, 38, 10],
    ],
  },
  // Snow this afternoon into the evening; a chance of more tomorrow morning.
  snow: {
    low: 24,
    high: 33,
    wind: [6, 16, 330],
    uv: 1.4,
    rh: [75, 95],
    aqi: [18, 15, 22, 25, 20],
    visibility: 2_000,
    hour: (day, h) => {
      if (day === 0 && h >= 14 && h < 22) {
        const peak = [71, 73, 75, 75, 75, 73, 73, 71][h - 14];
        return { code: peak, chance: [60, 75, 90, 90, 90, 85, 70, 60][h - 14] };
      }
      if (day === 1 && h >= 6 && h < 10) return { code: 71, chance: 40 };
      return { code: day === 1 && h >= 12 ? 2 : 3, chance: 10 };
    },
    days: [
      [75, 33, 24, 90],
      [71, 31, 20, 45],
      [0, 30, 15, 0],
      [1, 34, 18, 0],
      [3, 37, 25, 10],
      [73, 35, 27, 70],
      [2, 36, 22, 10],
      [3, 35, 24, 20],
    ],
  },
  // A warm, heavy afternoon: thunderstorms from 3 to 7 p.m.
  storm: {
    low: 58,
    high: 74,
    wind: [8, 24, 220],
    uv: 8.6,
    rh: [55, 90],
    aqi: [45, 38, 52, 58, 44],
    visibility: 15_000,
    hour: (day, h) => {
      if (day === 0 && h >= 15 && h < 19) return { code: 95, chance: 85 };
      if (day === 0 && ((h >= 13 && h < 15) || (h >= 19 && h < 21)))
        return { code: 63, chance: 60 };
      if (day === 0 && h >= 9 && h < 13) return { code: 2, chance: 20 };
      return { code: day === 1 && h >= 8 ? 1 : 3, chance: 10 };
    },
    days: [
      [95, 74, 58, 85],
      [80, 70, 56, 50],
      [1, 72, 55, 5],
      [0, 75, 57, 0],
      [0, 77, 59, 0],
      [2, 74, 60, 10],
      [61, 68, 57, 60],
      [2, 73, 58, 10],
    ],
  },
  // Raining this morning, gray the rest of the day.
  rain: {
    low: 44,
    high: 52,
    wind: [5, 14, 200],
    uv: 1.2,
    rh: [80, 98],
    aqi: [14, 18, 20, 16, 22],
    visibility: 6_000,
    hour: (day, h) => {
      if (day === 0 && h >= 4 && h < 11) return { code: h < 8 ? 63 : 61, chance: 85 };
      return { code: day === 1 && h >= 10 ? 2 : 3, chance: 10 };
    },
    days: [
      [63, 52, 44, 85],
      [2, 55, 41, 10],
      [3, 53, 42, 20],
      [61, 50, 43, 65],
      [3, 49, 40, 25],
      [1, 51, 37, 5],
      [0, 54, 36, 0],
      [2, 53, 38, 10],
    ],
  },
  // An August week under wildfire smoke: hot, bone dry, the sun a dim disc.
  smoke: {
    low: 58,
    high: 92,
    wind: [3, 10, 280],
    uv: 6.2,
    rh: [9, 38],
    aqi: [168, 182, 143, 96, 72],
    visibility: 3_000,
    hour: (_, h) => ({ code: h >= 7 && h < 19 ? 1 : 0, chance: 0 }),
    days: [
      [1, 92, 58, 0],
      [1, 95, 60, 0],
      [1, 93, 59, 0],
      [2, 89, 57, 5],
      [1, 87, 55, 0],
      [0, 90, 56, 0],
      [0, 91, 57, 0],
      [1, 90, 56, 0],
    ],
  },
};

/** A day's temperature curve: coldest near dawn, warmest midafternoon. */
function tempAt(spec: Spec, h: number): number {
  const x = Math.cos(((h - 15) / 24) * 2 * Math.PI); // 1 at 3 p.m., -1 at 3 a.m.
  return Math.round(spec.low + ((x + 1) / 2) * (spec.high - spec.low));
}

/** Inches of water an hour for a code: drizzle, rain, showers, storms. */
function waterOf(code: number): number {
  if (code >= 95) return 0.3;
  if (code >= 80) return 0.08;
  if (code === 65) return 0.22;
  if (code === 63) return 0.09;
  if (code === 61) return 0.03;
  if (code >= 51 && code <= 57) return 0.01;
  return 0;
}

/** Inches of snow an hour for a snow code. */
function snowOf(code: number): number {
  if (code === 75 || code === 86) return 0.8;
  if (code === 73 || code === 85) return 0.4;
  if (code === 71 || code === 77) return 0.15;
  return 0;
}

/** The sky for any hour of the week: the spec's own hours for two days, then each day's code. */
function hourAt(spec: Spec, day: number, h: number): HourSpec {
  if (day < 2) return spec.hour(day, h);
  const [code, , , chance] = spec.days[day] ?? spec.days.at(-1)!;
  // A wet day is wet from late morning to evening.
  return h >= 10 && h < 18 ? { code, chance } : { code: code > 3 ? 3 : code, chance: 10 };
}

/** The temperature at an hour of any day: the spec's curve for two days, then each day's. */
function tempOn(spec: Spec, day: number, h: number): number {
  if (day < 2) return tempAt(spec, h) + day;
  const [, high, low] = spec.days[day] ?? spec.days.at(-1)!;
  return tempAt({ ...spec, high, low }, h);
}

/** The dew point (°F) for a temperature (°F) and humidity, by the Magnus formula. */
function dewOf(f: number, rh: number): number {
  const c = ((f - 32) * 5) / 9;
  const g = Math.log(Math.max(rh, 1) / 100) + (17.62 * c) / (243.12 + c);
  return Math.round((((243.12 * g) / (17.62 - g)) * 9) / 5 + 32);
}

/** One made-up hour, everything the lenses draw. */
function lensHour(spec: Spec, day: number, h: number) {
  const s = hourAt(spec, day, h);
  const sure = s.chance >= 30;
  const snow = sure ? snowOf(s.code) : 0;
  const precip = sure ? Math.round((waterOf(s.code) + snow / 7) * 100) / 100 : 0;
  // The wind rises through the day and falls at night, a little more each day.
  const [calm, peak, dir] = spec.wind;
  const x = (Math.cos(((h - 15) / 24) * 2 * Math.PI) + 1) / 2;
  // Each day its own peak, so a week doesn't repeat one shape.
  const gusty = [1, 0.7, 1.25, 0.85, 1.45, 0.6, 1.1, 0.9][day % 8];
  const wind = Math.round(calm + x * (peak - calm) * gusty);
  // The sun from 7 to 5, highest at noon.
  const sun = h > 7 && h < 17 ? Math.sin(((h - 7) / 10) * Math.PI) : 0;
  const temp = tempOn(spec, day, h);
  // Driest in the afternoon, dampest at dawn.
  const [dry, damp] = spec.rh;
  const rh = Math.round(damp - x * (damp - dry));
  // Cold and wind: the wind's chill. Hot and humid: the heat's weight.
  const feels =
    temp < 50
      ? temp - Math.round(wind * 0.6)
      : temp > 80
        ? temp + Math.round(((rh - 20) / 10) * 2)
        : temp;
  // The air, worst in the afternoon; nothing known past the fifth day.
  const worst = spec.aqi[day];
  const aqi = worst == null ? null : Math.round(worst * (0.7 + 0.3 * x));
  return {
    precip,
    snow,
    wind,
    gust: Math.round(wind * 1.6 + 2),
    dir: (dir + h * 3 + day * 20) % 360,
    // Clouds and rain dim the sun.
    uv: Math.round(spec.uv * sun * (s.code >= 61 ? 0.25 : s.code >= 3 ? 0.4 : 1) * 10) / 10,
    temp,
    feels,
    rh,
    dew: dewOf(temp, rh),
    aqi,
    pm: aqi == null ? undefined : Math.round(aqi > 100 ? aqi * 0.45 : aqi * 0.25),
  };
}

/** A made-up day's hours as columns, as Open-Meteo's are shaped. */
function lensDay(spec: Spec, day: number): DayHours {
  const hours = Array.from({ length: 24 }, (_, h) => lensHour(spec, day, h));
  return {
    precip: hours.map((h) => h.precip),
    snow: hours.map((h) => h.snow),
    wind: hours.map((h) => h.wind),
    gust: hours.map((h) => h.gust),
    uv: hours.map((h) => h.uv),
    temp: hours.map((h) => h.temp),
    feels: hours.map((h) => h.feels),
    rh: hours.map((h) => h.rh),
    dew: hours.map((h) => h.dew),
    aqi: hours.map((h) => h.aqi),
  };
}

const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

/** A whole Weather report for a made-up sky, as Open-Meteo would shape it. */
export function fakeWeather(sky: FakeSky, now: Date, timeZone: string): Weather {
  const spec = SPECS[sky];
  const today = dayKey(now, timeZone);
  const p = parts(now, timeZone);
  const midnight = now.getTime() - ((p.hour * 60 + p.minute) * 60_000 + now.getUTCSeconds() * 1000);
  const top = Math.floor(now.getTime() / HOUR) * HOUR;

  const hours = Array.from({ length: 24 }, (_, i) => {
    const t = new Date(top + i * HOUR);
    const { hour } = parts(t, timeZone);
    const day = dayKey(t, timeZone) === today ? 0 : 1;
    const s = spec.hour(day, hour);
    const isDay = hour >= 7 && hour < 17;
    const { aqi, ...lens } = lensHour(spec, day, hour);
    return {
      time: t.toISOString(),
      precipChance: s.chance,
      code: s.code,
      isDay,
      ...lens,
      aqi: aqi ?? undefined,
    };
  });

  const days = spec.days.map(([code, high, low, chance], i) => {
    const hourly = lensDay(spec, i);
    return {
      date: addDays(today, i),
      high,
      low,
      precipChance: chance,
      code,
      label: describe(code),
      precip: sum(hourly.precip),
      snow: sum(hourly.snow),
      wind: Math.max(...hourly.wind),
      gust: Math.max(...hourly.gust),
      dir: (spec.wind[2] + i * 20) % 360,
      uv: Math.max(...hourly.uv),
      feelsHigh: Math.max(...hourly.feels!),
      feelsLow: Math.min(...hourly.feels!),
      aqi: spec.aqi[i],
      hourly,
    };
  });

  const nowHour = hours[0];
  return {
    now: {
      temp: nowHour.temp,
      code: nowHour.code,
      isDay: nowHour.isDay,
      label: describe(nowHour.code, nowHour.isDay),
      visibility: spec.visibility,
      aqi: nowHour.aqi,
      pm: nowHour.pm,
    },
    today: {
      high: days[0].high,
      low: days[0].low,
      precipChance: days[0].precipChance,
      label: days[0].label,
      sunrise: new Date(midnight + (6 * 60 + 52) * 60_000).toISOString(),
      sunset: new Date(midnight + (16 * 60 + 48) * 60_000).toISOString(),
      nextSunrise: new Date(midnight + (24 * 60 + 6 * 60 + 53) * 60_000).toISOString(),
    },
    days,
    hours,
  };
}

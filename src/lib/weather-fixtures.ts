// Made-up skies for tests and design review (?sky=fair|snow|storm|rain in
// dev). Built around a given moment, so the hours always start "now".

import { describe } from "./forecast";
import { addDays, dayKey, parts } from "./time";
import type { Weather } from "./types";

export const SKIES = ["fair", "snow", "storm", "rain"] as const;
export type FakeSky = (typeof SKIES)[number];

const HOUR = 3_600_000;

type HourSpec = { code: number; chance: number };
type Spec = {
  low: number;
  high: number;
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
    hour: (_, h) => fair(h),
    days: [
      [1, 58, 36, 0],
      [0, 61, 38, 0],
      [2, 57, 40, 10],
      [3, 54, 41, 20],
      [61, 52, 43, 40],
      [1, 55, 39, 5],
      [0, 58, 37, 0],
    ],
  },
  // Snow this afternoon into the evening; a chance of more tomorrow morning.
  snow: {
    low: 24,
    high: 33,
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
    ],
  },
  // A warm, heavy afternoon: thunderstorms from 3 to 7 p.m.
  storm: {
    low: 58,
    high: 74,
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
    ],
  },
  // Raining this morning, gray the rest of the day.
  rain: {
    low: 44,
    high: 52,
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
    ],
  },
};

/** A day's temperature curve: coldest near dawn, warmest midafternoon. */
function tempAt(spec: Spec, h: number): number {
  const x = Math.cos(((h - 15) / 24) * 2 * Math.PI); // 1 at 3 p.m., -1 at 3 a.m.
  return Math.round(spec.low + ((x + 1) / 2) * (spec.high - spec.low));
}

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
    return {
      time: t.toISOString(),
      temp: tempAt(spec, hour) + (day === 1 ? 1 : 0),
      precipChance: s.chance,
      code: s.code,
      isDay,
    };
  });

  const days = spec.days.map(([code, high, low, chance], i) => ({
    date: addDays(today, i),
    high,
    low,
    precipChance: chance,
    code,
    label: describe(code),
  }));

  const nowHour = hours[0];
  return {
    now: {
      temp: nowHour.temp,
      code: nowHour.code,
      isDay: nowHour.isDay,
      label: describe(nowHour.code, nowHour.isDay),
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

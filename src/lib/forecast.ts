// Weather in words: the sky described, the way a person would say it.

import { weekdayOf } from "./time";
import type { Weather } from "./types";

/** WMO weather code to a short label. */
export function describe(code: number, isDay = true): string {
  if (code === 0) return isDay ? "Fair" : "Clear";
  if (code === 1) return isDay ? "Mostly Sunny" : "Mostly Clear";
  if (code === 2) return "Partly Cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 55) return "Drizzle";
  if (code === 56 || code === 57) return "Freezing Drizzle";
  if (code === 61) return "Light Rain";
  if (code === 63) return "Rain";
  if (code === 65) return "Heavy Rain";
  if (code === 66 || code === 67) return "Freezing Rain";
  if (code === 71) return "Light Snow";
  if (code === 73) return "Snow";
  if (code === 75) return "Heavy Snow";
  if (code === 77) return "Snow Grains";
  if (code >= 80 && code <= 82) return "Showers";
  if (code === 85 || code === 86) return "Snow Showers";
  if (code === 95) return "Thunderstorms";
  if (code === 96 || code === 99) return "Thunderstorms and Hail";
  return "Unsettled";
}

/** What falls from the sky for a code, if anything. */
export function precipKind(code: number): "rain" | "snow" | "storms" | null {
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storms";
  if (code >= 51 && code <= 82) return "rain";
  return null;
}

export function feel(high: number): string {
  if (high < 25) return "bitter cold";
  if (high < 40) return "cold";
  if (high < 55) return "cool";
  if (high < 70) return "mild";
  if (high < 85) return "warm";
  return "hot";
}

/**
 * One or two sentences for the weather page and the voice:
 * "Partly cloudy and cold, with a high of 38°. Snow likely Thursday."
 */
export function forecastLine(w: Weather): string {
  const today = w.days[0];
  const first = `${capitalize(w.today.label.toLowerCase())} and ${feel(w.today.high)}, with a high of ${w.today.high}°.`;
  const wet = w.days.slice(1, 6).find((d) => d.precipChance >= 50 && precipKind(d.code) !== null);
  if (today && today.precipChance >= 50 && precipKind(today.code)) {
    return `${first} ${capitalize(precipKind(today.code)!)} likely today.`;
  }
  if (wet) {
    return `${first} ${capitalize(precipKind(wet.code)!)} likely ${weekdayOf(wet.date)}.`;
  }
  return `${first} Dry days ahead.`;
}

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);

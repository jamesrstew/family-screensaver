// The shapes that travel from the server to the TV. Plain JSON only.

import type { WeatherView } from "./carousel";

export const PAGES = ["home", "weather", "week", "notebook"] as const;
export type Page = (typeof PAGES)[number];

export type Weather = {
  now: {
    temp: number;
    label: string;
    code: number;
    isDay: boolean;
    /** How far one can see, meters. */
    visibility?: number;
    /**
     * The air now: Open-Meteo's blended US AQI; fine particles (µg/m³) as the
     * EPA's NowCast over 12 hours; the ozone and PM10 indices (lib/smoke.ts).
     */
    aqi?: number;
    pm?: number;
    ozone?: number;
    pm10?: number;
  };
  today: {
    high: number;
    low: number;
    precipChance: number;
    label: string;
    sunrise: string; // ISO
    sunset: string; // ISO
    /** Tomorrow's sunrise, when the forecast has it: the night's real end. */
    nextSunrise?: string; // ISO
  };
  days: Array<{
    date: string; // YYYY-MM-DD in the family's time zone
    high: number;
    low: number;
    precipChance: number;
    label: string;
    code: number;
    // The lenses (rain and snow, wind, UV). Optional: an older report has none.
    /** Rain and melted snow, in inches of water. */
    precip?: number;
    /** Snow, in inches of snow on the ground (not melted). */
    snow?: number;
    /** The strongest wind and gust, mph; where the wind mostly comes from, degrees. */
    wind?: number;
    gust?: number;
    dir?: number;
    uv?: number;
    /** How the day's warmest and coldest feel: the NWS heat index and wind chill (feel.ts). */
    feelsHigh?: number;
    feelsLow?: number;
    /** The day's worst air (US AQI), and its worst ozone, when the air-quality forecast reaches it. */
    aqi?: number;
    ozone?: number;
    /** The day hour by hour, from midnight, for drawing it. */
    hourly?: DayHours;
  }>;
  hours: Array<{
    time: string;
    temp: number;
    precipChance: number;
    code?: number;
    isDay?: boolean;
    precip?: number;
    snow?: number;
    wind?: number;
    gust?: number;
    dir?: number;
    uv?: number;
    /** Relative humidity (%) and dew point (°F). (How it feels is figured from these: feel.ts.) */
    rh?: number;
    dew?: number;
    /** US AQI, fine particles (µg/m³), and the ozone AQI. */
    aqi?: number;
    pm?: number;
    ozone?: number;
  }>; // next 24
  /** Yesterday's hours, for last evening (fresh snow, a hard freeze): only what's read. */
  yesterday?: { date: string; hourly: Pick<DayHours, "temp" | "snow" | "precip"> };
};

/** One day's hours as columns of numbers (they travel to the TV as JSON: kept small). */
export type DayHours = {
  precip: number[];
  snow: number[];
  wind: number[];
  gust: number[];
  uv: number[];
  temp?: number[];
  rh?: number[];
  dew?: number[];
  /** US AQI; null past the end of the air-quality forecast. */
  aqi?: Array<number | null>;
  /** Fine particles (µg/m³); null past the end of the air-quality forecast. */
  pm?: Array<number | null>;
};

export type Happening = {
  id: string;
  title: string;
  allDay: boolean;
  // Timed: ISO instants. All-day: YYYY-MM-DD dates, end exclusive.
  start: string;
  end: string;
};

export type NotebookItem = {
  id: string;
  kind: "idea" | "quote" | "question";
  text: string;
  author?: string;
  source?: string;
};

export type Snapshot = {
  issuedAt: string; // ISO
  place: string;
  timeZone: string;
  weather: Weather | null; // null: not configured or unavailable
  happenings: Happening[] | null; // null: no calendar connected
  notebook: NotebookItem[]; // today's selection, in order
  voice: boolean; // can it talk?
};

/** A page to show; for the weather, which view of it. */
export type ShowRequest = { seq: number; page: Page; at: string; view?: WeatherView };

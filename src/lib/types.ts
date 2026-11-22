// The shapes that travel from the server to the TV. Plain JSON only.

import type { WeatherView } from "./carousel";
import type { Sound } from "./nature";

export const PAGES = ["home", "weather", "week", "notebook", "sports", "nature"] as const;
export type Page = (typeof PAGES)[number];

export type Weather = {
  /** When the report was fetched (ISO), stamped inside the cache: its true age. */
  at?: string;
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
    /** Aerosol optical depth: how veiled the whole sky is (smoke, not smog; lib/smoke.ts). */
    aod?: number;
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
    /** Minutes of civil twilight (the light after sunset, before sunrise). */
    twilight?: number;
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
    /** US AQI, fine particles (µg/m³), the ozone AQI, and the aerosol optical depth. */
    aqi?: number;
    pm?: number;
    ozone?: number;
    aod?: number;
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
  /** Aerosol optical depth; null past the end of the air-quality forecast. */
  aod?: Array<number | null>;
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

/** Inside the house, from the Nest thermostats. °F; `temp` is their average. */
export type Indoor = {
  /** When the thermostats were read (ISO): the server may hand out a cached reading. */
  at: string;
  /** The house's one number: NEST_ROOM's thermostat, else the average. */
  temp: number;
  rooms: Array<{
    name: string; // the thermostat's room; never shown in the repo or logs
    temp: number;
    humidity?: number;
  }>;
};

/** Which games: college football, men's college basketball, the NFL. */
export type League = "cfb" | "cbb" | "nfl";

/** One side of a game. */
export type Side = {
  id: string;
  /** "Iowa", "Michigan State", "Bears": the name a family says. */
  name: string;
  /** A shorter one when the line runs long ("Michigan St"). */
  short: string;
  /** ESPN’s abbreviation ("IOWA") and the team’s place ("Chicago"): for finding its market. */
  abbr?: string;
  place?: string;
  /** Its Top 25 rank, as ESPN gives it (college only). */
  rank?: number;
  score?: number;
  /** One of the family's own teams. */
  mine?: boolean;
  /** Its chance of winning, in percent (before the game only): a liquid market's, else ESPN's predictor. */
  chance?: number;
};

/** One game on the sports page (lib/games.ts). */
export type Game = {
  id: string;
  league: League;
  start: string; // ISO
  /** False when the kickoff hasn't been set ("TBA"). */
  timed: boolean;
  state: "pre" | "in" | "post";
  /** Where a game in progress or over stands: "3rd qtr.", "Halftime", "Final". */
  period?: string;
  neutral: boolean;
  /** The national channel: "Fox", "ESPN", "Peacock". */
  tv?: string;
  away: Side;
  home: Side;
};

/** One team's page (lib/team-view.ts): who they are, how they've done, what's next. */
export type TeamView = {
  league: League;
  id: string;
  /** "Kentucky Wildcats". */
  name: string;
  /** "Kentucky": how the lines name them. */
  short: string;
  /** "8-1", as ESPN writes it. */
  record?: string;
  /** Their Top 25 rank, if they have one. */
  rank?: number;
  /** A game of theirs under way, if one is. */
  live: Game | null;
  /** Their last few results, the latest last. */
  results: Game[];
  /** Their next games, the soonest first. */
  ahead: Game[];
  /** When it was gathered (ISO). */
  at: string;
};

export type Snapshot = {
  issuedAt: string; // ISO
  place: string;
  timeZone: string;
  weather: Weather | null; // null: not configured or unavailable
  happenings: Happening[] | null; // null: no calendar connected
  /** null: no thermostats connected, or they didn't answer. Optional for older snapshots. */
  indoor?: Indoor | null;
  notebook: NotebookItem[]; // today's selection, in order
  /** The games ahead (lib/games.ts); null: the scores didn't answer. Optional for older snapshots. */
  games?: Game[] | null;
  /** When the games were gathered (ISO): the TV retires them when they're old (freshGames). */
  gamesAt?: string;
  /**
   * The NFL's other games in the few days (it has no Top 25), for its own
   * page only; null: its scoreboard didn't answer. Gathered with the games.
   */
  nfl?: Game[] | null;
  /** The carousel's passages for the next hour or so (pick.ts), by passage number. */
  passages?: { from: number; items: NotebookItem[] };
  voice: boolean; // can it talk?
};

/** A page to show; for the weather, which view of it. */
/** How nature sounds from now on (lib/nature.ts), as last asked; kept apart from the pages. */
export type SoundRequest = { seq: number; sound: Sound; at: string };

/** What the TV hears when it asks: the latest page asked for, and the latest sound. */
export type Asks = (ShowRequest | { seq: 0 }) & { heard: SoundRequest | null };

export type ShowRequest = {
  seq: number;
  page: Page;
  at: string;
  view?: WeatherView;
  /** The games page, for one team: resolved on the server from what was said (team-query.ts). */
  team?: { league: League; id: string; name?: string };
  /** The games page, for one league (or football, college and the NFL together). */
  league?: League | "football";
};

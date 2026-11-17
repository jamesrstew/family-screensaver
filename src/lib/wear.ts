// What to wear, said a few different ways. A cold week shouldn't hear "You'll
// want a warm coat" seven mornings running, so each kind of day has a small
// set of lines, and the day picks one: the same all day and on every reload,
// a different one tomorrow. Every line stays true to the forecast it's paired
// with and keeps the practical part (the coat, the boots, the umbrella); a
// lighter touch only ever rides along with it.
//
// The circumstances come from the forecast itself (outlook in forecast.ts
// gathers them). Bad air isn't here: when the air isn't fine for everyone,
// its own line (smoke.ts) takes this one's place, and nothing here invites
// anyone outside unless the air is fine.

import type { Fall } from "./forecast";

/** What the forecast says about the hours the family will be out in. */
export type Facts = {
  /** Which day the advice is for, and its date (YYYY-MM-DD). */
  when: "today" | "tomorrow";
  date: string;
  /** The coldest and warmest waking hours (°F). */
  cold: number;
  warm: number;
  /** The coldest and hottest feel in those hours (the NWS wind chill and heat index). */
  coldFeel: number;
  hotFeel: number;
  /** The strongest sustained wind (mph) and the muggiest dew point (°F). */
  wind: number;
  dew: number;
  /** What's likely to fall while they're out, for how many of how many waking hours, and whether it's falling already. */
  fall: Fall | null;
  wetHours: number;
  wakingHours: number;
  wetNow: boolean;
  /** Inches of snow on the ground since last evening (fallen, or likely before morning). */
  freshSnow: number;
  /** A mostly clear sky for the day. */
  clear: boolean;
  /** A hard freeze before morning, with nothing falling: frost on the windshield. */
  frost: boolean;
  /** The afternoon is still ahead. */
  afternoon: boolean;
  /** The air is fine for everyone (AQI 100 or under). */
  airOk: boolean;
  /** Warmer than any other day of the week ahead, and mild enough to notice. */
  warmest: boolean;
};

/** The coat for the coldest waking hour, or none. */
export function coatOf(cold: number): string | null {
  if (cold < 20) return "a heavy coat, a hat, and mittens";
  if (cold < 40) return "a warm coat";
  if (cold < 55) return "a jacket";
  if (cold < 65) return "a sweater";
  return null;
}

/** The circumstance a day's line is chosen for, in order of what matters most. */
export type Condition =
  | "powder"
  | "fresh-snow"
  | "snowing"
  | "rain-all-day"
  | "shower"
  | "rain"
  | "wind-chill"
  | "frost"
  | "heat"
  | "muggy"
  | "walk"
  | "warmest"
  | "bitter"
  | "cold"
  | "cool"
  | "sweater"
  | "warm";

/** Rain likely for this many waking hours is a wet day, not a shower. */
export const ALL_DAY = 6;

/**
 * Which circumstance the day is, by its triggers:
 *  powder:       an inch or more of fresh snow, then a clear, dry, cold day.
 *  fresh-snow:   an inch or more of fresh snow, nothing falling while out.
 *  snowing:      snow likely while out.
 *  rain-all-day: rain likely 6 or more waking hours, and most of them.
 *  shower:       rain likely for an hour or two, not already falling.
 *  rain:         rain likely, in between.
 *  wind-chill:   the wind makes it feel 8° colder, below freezing.
 *  frost:        a hard freeze (28° or colder) before morning, dry.
 *  heat:         the heat index reaches 95°, or the air 90°.
 *  muggy:        a dew point of 65° or more.
 *  walk:         a mild (60° to 78°), dry, calm afternoon ahead, the air fine.
 *  warmest:      50° or more and the warmest day of the week ahead.
 *  then by the coldest hour: bitter (under 20°), cold, cool, sweater, warm.
 */
export function conditionOf(f: Facts): Condition {
  const dry = !f.fall;
  if (f.freshSnow >= 1 && dry && f.cold < 40) return f.clear ? "powder" : "fresh-snow";
  if (f.fall === "snow") return "snowing";
  if (f.fall) {
    if (f.wetHours >= ALL_DAY && f.wetHours >= f.wakingHours * 0.75) return "rain-all-day";
    if (f.wetHours <= 2 && !f.wetNow) return "shower";
    return "rain";
  }
  if (f.coldFeel <= f.cold - 8 && f.coldFeel < 32) return "wind-chill";
  if (f.frost) return "frost";
  if (f.hotFeel >= 95 || f.warm >= 90) return "heat";
  if (f.dew >= 65) return "muggy";
  if (f.afternoon && f.airOk && f.warm >= 60 && f.warm <= 78 && f.wind < 12) return "walk";
  if (f.warmest && f.warm >= 50) return "warmest";
  if (f.cold < 20) return "bitter";
  if (f.cold < 40) return "cold";
  if (f.cold < 55) return "cool";
  if (f.cold < 65) return "sweater";
  return "warm";
}

/** What a line can say: the coat (and a shorter one for long lines), the day, and the feel. */
type Say = {
  coat: string | null;
  /** The coat in fewer words, for lines that carry more: "heavy layers". */
  wrap: string;
  you: string;
  /** "Tomorrow, " or nothing: lines are written as if for today. */
  t: string;
  feel: number;
  warm: number;
};

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** "You'll want a warm coat" (or, with no coat to wear, "No coat needed"). */
const want = (s: Say, also?: string) =>
  s.coat
    ? `${s.you} want ${also ? `${s.wrap} and ${also}` : s.coat}.`
    : also
      ? `No coat needed, but bring ${also}.`
      : "No coat needed.";

/**
 * The lines, a few for each circumstance. Each keeps the practical part;
 * none assumes what the family likes to do (an invitation, at most).
 */
const LINES: Record<Condition, Array<(s: Say) => string>> = {
  powder: [
    (s) => `${s.t}fresh snow and blue sky. Boots and ${s.wrap}, maybe a sled.`,
    (s) => `${s.t}new snow, clear sky: a fine day for the hill. Boots and ${s.wrap}.`,
    (s) => `${s.t}fresh powder, if anyone’s inclined. Boots and ${s.wrap}.`,
  ],
  "fresh-snow": [
    (s) => want(s, "boots for the new snow"),
    (s) => `${s.t}fresh snow on the ground: boots, and ${s.wrap}.`,
  ],
  snowing: [
    (s) => want(s, "boots"),
    (s) => `${s.t}boots by the door, and ${s.wrap}.`,
    (s) => `${s.t}a snowy one: ${s.wrap} and boots.`,
  ],
  "rain-all-day": [
    (s) => want(s, "an umbrella, all day long"),
    (s) => `${s.t}a wet one, start to finish: ${s.coat ? `${s.wrap} and ` : ""}the umbrella.`,
  ],
  shower: [
    (s) => want(s, "an umbrella for a passing shower"),
    (s) => `${s.t}just a passing shower: an umbrella in the bag${s.coat ? `, and ${s.wrap}` : ""}.`,
  ],
  rain: [
    (s) => want(s, "an umbrella"),
    (s) => `${s.t}umbrella weather${s.coat ? `, and ${s.wrap}` : ""}.`,
  ],
  "wind-chill": [
    (s) =>
      `${s.t}the wind will make it feel like ${s.feel}°: ${s.wrap}${s.wrap.includes("hat") || s.wrap.includes("mittens") ? "" : ", and a hat"}.`,
    (s) => `${s.t}it’ll feel like ${s.feel}° in the wind. Bundle up: ${s.wrap}.`,
  ],
  frost: [
    (s) => want(s, "a scraper for the windshield"),
    (s) => `${s.t}a hard frost first thing: the scraper, then ${s.wrap}.`,
  ],
  heat: [
    (s) => `${s.t}a hot one: water, shade, and a hat in the afternoon.`,
    (s) =>
      s.feel > s.warm
        ? `${s.t}it’ll feel like ${s.feel}° at its hottest. Water, and shade when you can.`
        : `${s.t}up to ${s.warm}°. Water, and shade when you can.`,
  ],
  muggy: [
    (s) => `${s.t}a muggy one: dress light and keep water handy.`,
    (s) => `${s.t}it’ll be sticky: light clothes, and water.`,
  ],
  walk: [
    (s) => `${s.t}${s.coat ?? "no coat needed"}, and a fine afternoon for a walk.`,
    (s) => `${s.t}mild and calm: a good afternoon to be outside${s.coat ? `, in ${s.coat}` : ""}.`,
  ],
  warmest: [
    (s) =>
      `${s.t}the warmest day of the week. ${s.coat ? `${cap(s.coat)} should do.` : "No coat needed."}`,
    (s) =>
      `${s.t}the week’s warmest day${s.coat ? `; ${s.coat} for the cool hours` : ", and no coat needed"}.`,
  ],
  bitter: [
    (s) => want(s),
    (s) => `${s.t}bitter cold: a heavy coat, a hat, and mittens.`,
    (s) => `${s.t}layers, then a heavy coat, a hat, and mittens.`,
  ],
  cold: [
    (s) => want(s),
    (s) => `${s.t}warm coat weather.`,
    (s) => `${s.t}a warm coat, and gloves wouldn’t hurt.`,
  ],
  cool: [(s) => want(s), (s) => `${s.t}jacket weather.`, (s) => `${s.t}a jacket should do it.`],
  sweater: [(s) => want(s), (s) => `${s.t}sweater weather.`, (s) => `${s.t}a sweater should do.`],
  warm: [(s) => want(s), (s) => `${s.t}no coat needed; short sleeves will do.`],
};

/** Days since 1970 for a YYYY-MM-DD date: the day's own turn of the wheel. */
const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T12:00:00Z`) / 86_400_000);

/**
 * The day's line. Chosen by the date, so it holds all day and through a
 * reload; the next day takes the next line, so the same circumstance never
 * says the same thing two days running when it has another way to say it.
 */
export function wearLine(f: Facts): string {
  const condition = conditionOf(f);
  const lines = LINES[condition];
  const pick = lines[dayNumber(f.date) % lines.length];
  const coat = coatOf(f.cold);
  const tomorrow = f.when === "tomorrow";
  const line = pick({
    coat,
    wrap: coat === null ? "a light jacket" : f.cold < 20 ? "heavy layers" : coat,
    you: tomorrow ? "Tomorrow, you’ll" : "You’ll",
    t: tomorrow ? "Tomorrow, " : "",
    feel: condition === "heat" ? f.hotFeel : f.coldFeel,
    warm: f.warm,
  });
  return cap(line);
}

/** How many ways a circumstance can be said. */
export const waysOf = (c: Condition) => LINES[c].length;

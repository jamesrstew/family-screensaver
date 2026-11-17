// The weather's lenses. The Hours and Days views each show one stretch of
// time several ways, turning slowly from one to the next: the sky (as drawn
// today), rain and snow, the air, how it feels, wind, humidity, and the sun's
// UV. A lens with nothing to say is skipped. This is the arithmetic and the
// words; the drawing is in `views/designs/almanac-lenses.tsx`.
//
// Units throughout: inches of water for precipitation, inches of snow for
// snowfall (Open-Meteo's own), mph for wind, °F, percent humidity, the plain
// UV index, the US AQI.

import { CHANCE, periodWord } from "./forecast";
import { AQI_SENSITIVE, AQI_UNHEALTHY, HAZE_PM, airAdvice, airPhrase, aqiWord } from "./smoke";
import { addDays, clock, dayKey, parts } from "./time";
import type { Weather } from "./types";

/** Every lens, in the order they turn: what matters most comes first. */
export const LENSES = ["sky", "precip", "air", "feels", "wind", "humidity", "uv"] as const;
export type Lens = (typeof LENSES)[number];

/** How long each lens stays: four of them fill home's two-minute weather slide. */
export const LENS_MS = 30_000;

/**
 * The lens after `current` in the turn. A lens that has just gone quiet (UV
 * at dusk) is stepped past, never jumped to mid-turn: the turn finds its
 * place by the full order instead.
 */
export function nextLens(order: readonly Lens[], current: Lens): Lens {
  if (order.length < 2) return "sky";
  const i = order.indexOf(current);
  if (i >= 0) return order[(i + 1) % order.length];
  const after = order.find((l) => l !== "sky" && LENSES.indexOf(l) > LENSES.indexOf(current));
  return after ?? "sky";
}

/**
 * The turn, opening on the sky, then carrying on after the lens last seen.
 * Home's two-minute slide has room for four lenses; the next time the view
 * comes round, it picks up where it left off instead of starting over.
 */
export function lensOrder(lenses: readonly Lens[], after?: Lens | null): Lens[] {
  const rest: Lens[] = lenses.filter((l) => l !== "sky");
  // The first lens that comes after the one last seen, in the full order
  // (that one may have nothing to say today); round to the start past the end.
  const last = after ? LENSES.indexOf(after) : -1;
  const k = Math.max(
    rest.findIndex((l) => LENSES.indexOf(l) > last),
    0,
  );
  return ["sky", ...rest.slice(k), ...rest.slice(0, k)];
}

/** One hour, slot, or day, as far as the lenses care. */
export type Sample = {
  precip?: number;
  snow?: number;
  chance?: number;
  wind?: number;
  gust?: number;
  uv?: number;
  /** The air temperature and how it feels; for a day, the high (and the low below). */
  temp?: number;
  feels?: number;
  tempLow?: number;
  feelsLow?: number;
  /** Relative humidity (%) and dew point (°F); for a day, the driest and the muggiest. */
  rh?: number;
  dew?: number;
  /** US AQI; missing past the end of the air forecast. */
  aqi?: number;
  /** Hours of hazy air (fine particles 15 µg/m³ or more): 1 or 0 for an hour, a count for a day. */
  haze?: number;
};

/** How far the feel must stray from the thermometer to be worth a lens (°F)... */
export const FEELS_GAP = 8;
/** ...or less far, when the feel is bitter or scorching. */
export const FEELS_NEAR = 5;
export const BITTER = 10;
export const SCORCHING = 95;
/** A dew point this high is muggy (°F). */
export const MUGGY = 65;
/** Humidity this low, with gusts this strong, is fire weather (%, mph). */
export const PARCHED = 15;
export const FIRE_GUST = 25;
/** Hours of haze worth a lens: the sky draws haze, so the lens explains it. */
export const HAZE_HOURS = 3;
/** Wind worth a lens: sustained this strong, or gusts this strong (mph). */
export const WINDY = 15;
export const GUSTY = 25;
/** UV worth a lens: the EPA's "moderate", where its advice starts. */
export const UV_MODERATE = 3;

/** Whether the feel strays far enough from the thermometer to say so. */
export const feelsSays = (temp?: number, feels?: number) =>
  temp != null &&
  feels != null &&
  (Math.abs(feels - temp) >= FEELS_GAP ||
    (Math.abs(feels - temp) >= FEELS_NEAR && (feels <= BITTER || feels >= SCORCHING)));

/**
 * The lenses with something to say about these samples, in order. A lens
 * that would only say "nothing to do" is left out, so a calm, dry day stays
 * on the sky:
 *  rain and snow: some hour or day with a fair chance (30% or more) and a
 *                 measurable amount (0.01 inch of water, or 0.1 of snow).
 *  air:           some hour unhealthy for sensitive groups (AQI over 100), or
 *                 three hours or more of haze (fine particles 15 µg/m³ or
 *                 more, the line at which the sky draws haze).
 *  feels like:    the feel 8° or more from the thermometer, or 5° when it
 *                 feels 10° or colder, or 95° or hotter.
 *  wind:          sustained 15 mph or more, or gusts of 25 or more.
 *  humidity:      muggy (dew point 65° or more), or fire weather (humidity
 *                 15% or less with gusts of 25 mph or more).
 *  UV:            3 or more, the EPA's "moderate", where its advice starts.
 */
export function lensesFor(samples: Sample[]): Lens[] {
  const out: Lens[] = ["sky"];
  if (!samples.length) return out;
  const known = (k: keyof Sample) => samples.every((s) => s[k] != null);
  const wet = samples.some(
    (s) => (s.chance ?? 0) >= CHANCE && ((s.precip ?? 0) >= 0.01 || (s.snow ?? 0) >= 0.1),
  );
  if (known("precip") && known("snow") && wet) out.push("precip");
  const hazy = samples.reduce((a, s) => a + (s.haze ?? 0), 0);
  if (samples.some((s) => (s.aqi ?? 0) > AQI_SENSITIVE) || hazy >= HAZE_HOURS) out.push("air");
  if (samples.some((s) => feelsSays(s.temp, s.feels) || feelsSays(s.tempLow, s.feelsLow)))
    out.push("feels");
  if (known("wind") && known("gust") && samples.some((s) => s.wind! >= WINDY || s.gust! >= GUSTY))
    out.push("wind");
  if (
    known("rh") &&
    known("dew") &&
    samples.some((s) => s.dew! >= MUGGY || (s.rh! <= PARCHED && (s.gust ?? 0) >= FIRE_GUST))
  )
    out.push("humidity");
  if (known("uv") && samples.some((s) => Math.round(s.uv!) >= UV_MODERATE)) out.push("uv");
  return out;
}

/**
 * Today, from the current hour on. The lenses talk about what's ahead: at
 * 2 p.m., the morning's rain is not "rain today", and the noon sun is gone.
 * The day's own totals are re-counted from the hours left, and `from` says
 * where they start, so the plate can leave the past hours bare.
 */
type Day = Weather["days"][number];
export type LensDay = Day & { from: number };
export function restOfDay(d: Day, from: number, chance?: number): LensDay {
  const h = d.hourly;
  if (!h || from <= 0) return { ...d, from: 0 };
  const left = <T>(xs?: T[]) => xs?.slice(from) ?? [];
  const nums = (xs?: Array<number | null>) => left(xs).filter((x): x is number => x != null);
  const most = (xs: number[]) => (xs.length ? Math.max(...xs) : undefined);
  const least = (xs: number[]) => (xs.length ? Math.min(...xs) : undefined);
  const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
  return {
    ...d,
    from,
    precip: sum(left(h.precip)),
    snow: sum(left(h.snow)),
    precipChance: chance ?? d.precipChance,
    wind: most(left(h.wind)) ?? d.wind,
    gust: most(left(h.gust)) ?? d.gust,
    uv: most(left(h.uv)) ?? 0,
    high: most(left(h.temp)) ?? d.high,
    low: least(left(h.temp)) ?? d.low,
    feelsHigh: most(left(h.feels)) ?? d.feelsHigh,
    feelsLow: least(left(h.feels)) ?? d.feelsLow,
    aqi: most(nums(h.aqi)),
  };
}

/** The hour of the day `now` falls in, for cutting today down to what's left. */
export const hourNow = (now: Date, tz: string) => parts(now, tz).hour;

/** Whether an hour's fine particles make haze. */
export const hazeOf = (pm?: number | null) => (pm != null && pm >= HAZE_PM ? 1 : 0);

/* ------------------------------------------------------------ rain and snow */

/** Inches of snow per inch of water: Open-Meteo's own ratio (0.7 cm of snow per mm). */
export const SNOW_RATIO = 7;

export type Kind = "rain" | "snow" | "mix";

/** Rain, melted snow, and snow on the ground, in inches. */
export function split(precip: number, snow: number) {
  const snowWater = snow / SNOW_RATIO;
  return { rain: Math.max(precip - snowWater, 0), snowWater, snow };
}

/** What falls: rain, snow, or a mix (neither is three-quarters of the water). */
export function kindOf(precip: number, snow: number): Kind | null {
  if (precip < 0.005 && snow < 0.05) return null;
  const { rain, snowWater } = split(precip, snow);
  const total = rain + snowWater;
  if (total <= 0) return "snow";
  const share = snowWater / total;
  return share >= 0.75 ? "snow" : share <= 0.25 ? "rain" : "mix";
}

/** Which kinds fall at all over a stretch (each sample judged on its own). */
export function kindsIn(xs: Sample[]): { rain: boolean; snow: boolean } {
  const kinds = xs.map((x) => kindOf(x.precip ?? 0, x.snow ?? 0));
  return {
    rain: kinds.some((k) => k === "rain" || k === "mix"),
    snow: kinds.some((k) => k === "snow" || k === "mix"),
  };
}

/** One hour's marks on the chart: snow if most of its water fell as snow. */
export function hourKind(precip: number, snow: number): "rain" | "snow" | null {
  const k = kindOf(precip, snow);
  if (!k) return null;
  const { rain, snowWater } = split(precip, snow);
  return snowWater >= rain ? "snow" : "rain";
}

/**
 * Inches for a column, the way a forecaster writes them: "<0.1″", "0.4″",
 * "1.2″" of rain (hundredths would only pretend to precision); "0.4″",
 * "1.5″", "3″", "14″" of snow.
 */
export function inches(x: number, kind: "rain" | "snow"): string {
  x = Math.round(x * 100) / 100;
  if (kind === "snow") {
    if (x < 1) return `${trim(Math.max(x, 0.1), 1)}″`;
    return x < 10 ? `${Math.round(x * 2) / 2}″` : `${Math.round(x)}″`;
  }
  return x < 0.095 ? "<0.1″" : `${trim(x, 1)}″`;
}

const TENTHS = [
  "",
  "a tenth",
  "two-tenths",
  "three-tenths",
  "four-tenths",
  "half",
  "six-tenths",
  "seven-tenths",
  "eight-tenths",
  "nine-tenths",
];

/**
 * Inches for a sentence, in AP's words: "under a tenth of an inch", "about
 * three-tenths of an inch", "about half an inch", "about an inch", "about
 * 1.4 inches" of rain; "under an inch", "about 4½ inches" of snow.
 */
export function inchWords(x: number, kind: "rain" | "snow"): string {
  x = Math.round(x * 100) / 100;
  if (kind === "snow") {
    if (x < 0.95) return "under an inch";
    const n = x < 10 ? Math.round(x * 2) / 2 : Math.round(x);
    if (n === 1) return "about an inch";
    const whole = Math.floor(n);
    return `about ${n % 1 ? `${whole}½` : whole} inches`;
  }
  if (x < 0.095) return "under a tenth of an inch";
  const t = Math.round(x * 10);
  if (t < 10) return t === 5 ? "about half an inch" : `about ${TENTHS[t]} of an inch`;
  const v = Math.round(x * 10) / 10;
  return v === 1 ? "about an inch" : `about ${trim(v, 1)} inches`;
}
const trim = (x: number, dp: number) => String(Number(x.toFixed(dp)));

/** The amount to write down: snow as it lies when there's an inch's tenth of it, else water. */
export function amountOf(precip: number, snow: number): string | null {
  const k = kindOf(precip, snow);
  if (!k) return null;
  if (k !== "rain" && snow >= 0.1) return inches(snow, "snow");
  return inches(precip, "rain");
}

/** A column's figures: the big one, the line under it, and the wind's bearing. */
export type Figure = {
  big: string;
  sub: string;
  /** Nothing to report (dry, calm, dark): set faint. */
  quiet?: boolean;
  /** The one thing worth acting on: set in the accent. */
  act?: boolean;
  /** Where the wind comes from, degrees. */
  dir?: number;
  /** What falls, drawn as a small mark beside the chance. */
  kind?: Kind;
  /** How strong, to give the accent to the strongest. */
  score?: number;
  /** A small third line (fine particles). */
  note?: string;
  /** Long words (the EPA's air words) set a size smaller to fit the column. */
  small?: boolean;
};

/** Enough to act on: 2 inches of snow or an inch of rain. */
export const HEAVY = { snow: 2, rain: 1 };

/**
 * "0.4″" over "rain 80%". Under a fair chance the amount isn't written
 * (Open-Meteo's chance and its amount come from different models, and a
 * family reads an amount as a promise): just the faint chance. Dry: nothing.
 */
export function precipFigure(
  precip: number,
  snow: number,
  chance: number,
  guess: "rain" | "snow" | "storms" | null,
): Figure {
  const amount = amountOf(precip, snow);
  const kind = kindOf(precip, snow) ?? (guess === "storms" ? "rain" : (guess ?? "rain"));
  if (chance < CHANCE) {
    // The empty plate above says dry; a faint chance only when the model drew something.
    return amount
      ? { big: "", sub: `${kind} ${chance}%`, quiet: true, small: true }
      : { big: "", sub: "", quiet: true };
  }
  const { rain } = split(precip, snow);
  const heavy = snow >= HEAVY.snow || rain >= HEAVY.rain;
  return {
    big: amount ?? "",
    sub: `${kind} ${chance}%`,
    small: true,
    act: heavy,
    score: precip,
  };
}

/* ------------------------------------------------------------------- wind */

const POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const POINT_WORDS = [
  "north",
  "northeast",
  "east",
  "southeast",
  "south",
  "southwest",
  "west",
  "northwest",
];

const point = (deg: number) => Math.round((((deg % 360) + 360) % 360) / 45) % 8;
/** "NW" */
export const compass = (deg: number) => POINTS[point(deg)];
/** "northwest" */
export const compassWord = (deg: number) => POINT_WORDS[point(deg)];

/**
 * Where the wind mostly comes from: the mean of its bearings, weighted by
 * speed. Undefined when it's calm or swings all around (no one direction).
 */
export function meanDir(dirs: number[], speeds: number[]): number | undefined {
  let x = 0;
  let y = 0;
  let total = 0;
  dirs.forEach((d, i) => {
    const s = speeds[i] ?? 0;
    x += Math.sin((d * Math.PI) / 180) * s;
    y += Math.cos((d * Math.PI) / 180) * s;
    total += s;
  });
  if (total <= 0 || Math.hypot(x, y) / total < 0.4) return undefined;
  return Math.round(((Math.atan2(x, y) * 180) / Math.PI + 360) % 360);
}

/** Gusts this strong are worth a word of warning. */
export const GALE = 40;

/** "12" (or "3–9" for a day) over "gusts 20". */
export function windFigure(lo: number, hi: number, gust: number, dir?: number): Figure {
  const big = lo < hi && lo >= 0 ? `${lo}–${hi}` : String(hi);
  return {
    big,
    // No gusts above the wind: a dash, so the row has no hole.
    sub: gust > hi ? `gusts ${gust}` : "\u2014",
    quiet: hi < 4 && gust < 8,
    act: gust >= GALE,
    score: gust,
    dir,
  };
}

/** The National Weather Service's words: breezy from 15 mph, windy from 25. */
const windWord = (hi: number) =>
  hi < 10
    ? "Light winds"
    : hi < 15
      ? "A light breeze"
      : hi < 25
        ? "Breezy"
        : hi < 35
          ? "Windy"
          : "Very windy";

const speeds = (lo: number, hi: number) => (lo <= 1 ? `up to ${hi} mph` : `${lo} to ${hi} mph`);

/** The next day's wind in a sentence: "Breezy, 8 to 17 mph from the west. Gusts to 28 mph this afternoon." */
export function hoursWindLine(
  hours: Array<{ time: string; wind: number; gust: number; dir?: number }>,
  now: Date,
  tz: string,
): string {
  if (!hours.length) return "";
  const winds = hours.map((h) => h.wind);
  const [lo, hi] = [Math.min(...winds), Math.max(...winds)];
  if (hi < 4) return "Nearly calm, under 4 mph.";
  const dir = meanDir(
    hours.map((h) => h.dir ?? 0),
    hours.map((h) => (h.dir == null ? 0 : h.wind)),
  );
  const from = dir == null ? "" : ` from the ${compassWord(dir)}`;
  const peak = hours.reduce((a, b) => (b.gust > a.gust ? b : a));
  const gusts =
    peak.gust >= hi + 5
      ? ` Gusts to ${peak.gust} mph ${periodWord(new Date(peak.time), now, tz)}.`
      : "";
  return `${windWord(hi)}, ${speeds(lo, hi)}${from}.${gusts}`;
}

/** The week's wind: "Windiest Thursday, 10 to 17 mph from the west, gusts to 28. Calmest Sunday." */
export function daysWindLine(
  days: Array<{ name: string; lo: number; hi: number; gust: number; dir?: number }>,
): string {
  if (!days.length) return "";
  const top = days.reduce((a, b) =>
    b.gust > a.gust || (b.gust === a.gust && b.hi > a.hi) ? b : a,
  );
  const hi = Math.max(...days.map((d) => d.hi));
  if (hi < WINDY && top.gust < GUSTY) return `Light winds all week, never above ${hi} mph.`;
  const calm = days.reduce((a, b) => (b.gust < a.gust ? b : a));
  const from = top.dir == null ? "" : ` from the ${compassWord(top.dir)}`;
  const gusts = top.gust > top.hi ? `, gusts to ${top.gust}` : "";
  const calmest = calm.name !== top.name ? ` Calmest ${calm.name}.` : "";
  return `Windiest ${top.name}, ${speeds(top.lo, top.hi)}${from}${gusts}.${calmest}`;
}

/* --------------------------------------------------------------------- UV */

/** The EPA's words for the UV index. */
export function uvWord(uv: number): string {
  const n = Math.round(uv);
  if (n < 3) return "low";
  if (n < 6) return "moderate";
  if (n < 8) return "high";
  if (n < 11) return "very high";
  return "extreme";
}

/** From here up, the sun is worth acting on (the EPA's "high"). */
export const UV_HIGH = 6;

/** "6" over "high"; nothing at all for the dark hours. */
export function uvFigure(uv: number): Figure {
  const n = Math.round(uv);
  if (n < 1) return { big: "", sub: "", quiet: true };
  return { big: String(n), sub: uvWord(n), act: n >= UV_HIGH, score: n };
}

/** What to do about it, in the EPA's spirit; nothing when it's low. */
const uvAdvice = (n: number) =>
  n >= UV_HIGH
    ? " Sunscreen, a hat, and shade at midday."
    : n >= 3
      ? " Sunscreen for long hours outside."
      : "";

/** "Moderate UV, peaking at 4 around 1 p.m. Sunscreen for long hours outside." */
export function hoursUvLine(hours: Array<{ time: string; uv: number }>, now: Date, tz: string) {
  if (!hours.length) return "";
  const peak = hours.reduce((a, b) => (b.uv > a.uv ? b : a));
  const n = Math.round(peak.uv);
  const t = new Date(peak.time);
  const day = dayKey(t, tz) === dayKey(now, tz) ? "" : " tomorrow";
  const word = uvWord(n);
  const line = `${word[0].toUpperCase()}${word.slice(1)} UV, peaking at ${n} around ${clock(t, tz)}${day}.`;
  // "around 1 p.m.." reads as a typo: one period ends both.
  return line.replace(/\.\.$/, ".") + uvAdvice(n);
}

/** "Low UV all week, 2 at most." or "The sun's strongest Saturday: UV 7, high." */
export function daysUvLine(days: Array<{ name: string; uv: number }>): string {
  if (!days.length) return "";
  const top = days.reduce((a, b) => (Math.round(b.uv) > Math.round(a.uv) ? b : a));
  const n = Math.round(top.uv);
  if (n < 3) return `Low UV all week, ${n} at most.`;
  return `The sun's strongest ${top.name}: UV ${n}, ${uvWord(n)}.${uvAdvice(n)}`;
}

/* ---------------------------------------------------- rain and snow, words */

/** "about 4½ inches of snow and a tenth of an inch of rain", or null for a trace. */
function amounts(precip: number, snow: number): string | null {
  const kind = kindOf(precip, snow);
  const parts: string[] = [];
  if (kind && kind !== "rain" && snow >= 0.1) parts.push(`${inchWords(snow, "snow")} of snow`);
  if (kind && kind !== "snow") parts.push(`${inchWords(split(precip, snow).rain, "rain")} of rain`);
  return parts.length ? parts.join(" and ") : null;
}

/** "5 to 8 p.m.", "11 a.m. to 2 p.m." */
function span(from: Date, to: Date, tz: string): string {
  const a = clock(from, tz);
  const b = clock(to, tz);
  const suffix = / (a\.m\.|p\.m\.)$/;
  const same = a.match(suffix)?.[1] && a.match(suffix)?.[1] === b.match(suffix)?.[1];
  return `${same ? a.replace(suffix, "") : a} to ${b}`;
}

/**
 * The next day's rain and snow: how much, and when (the sky's own sentence
 * says when it starts and stops). Only hours with a fair chance count. One
 * short spell gives its own hours ("from 9 to 11 a.m.", or "until 11 a.m."
 * when it's already falling); a longer one, its heaviest three hours.
 * "About 4½ inches of snow, heaviest from 4 to 7 p.m."
 */
export function hoursPrecipLine(
  hours: Array<{ time: string; precip: number; snow: number; chance: number }>,
  now: Date,
  tz: string,
): string {
  const sure = hours.map((h) => h.chance >= CHANCE && Boolean(kindOf(h.precip, h.snow)));
  const wet = hours.filter((_, i) => sure[i]);
  if (!wet.length) return "Little if any.";
  const precip = wet.reduce((a, h) => a + h.precip, 0);
  const snow = wet.reduce((a, h) => a + h.snow, 0);
  const what = amounts(precip, snow);
  if (!what) return "Little if any.";
  const first = sure.indexOf(true);
  const last = sure.lastIndexOf(true);
  const HOUR = 3_600_000;
  const end = (i: number) => new Date(Date.parse(hours[i].time) + HOUR);
  let when: string;
  if (last - first < 3) {
    when =
      Date.parse(hours[first].time) <= now.getTime()
        ? `until ${clock(end(last), tz)}`
        : `from ${span(new Date(hours[first].time), end(last), tz)}`;
  } else {
    // The three neighboring hours with the most water.
    let top = first;
    let most = -1;
    for (let i = first; i + 2 <= last; i++) {
      const w = [i, i + 1, i + 2].reduce((a, k) => a + (sure[k] ? hours[k].precip : 0), 0);
      if (w > most) [top, most] = [i, w];
    }
    const from = new Date(hours[top].time);
    when =
      from.getTime() <= now.getTime()
        ? `heaviest until ${clock(end(top + 2), tz)}`
        : `heaviest from ${span(from, end(top + 2), tz)}`;
  }
  const from = new Date(hours[first].time);
  const tomorrow =
    dayKey(from, tz) === addDays(dayKey(now, tz), 1) && parts(from, tz).hour >= 5
      ? " tomorrow"
      : "";
  // A little rain says so, plainly.
  const lead =
    what === "under a tenth of an inch of rain"
      ? "A little rain, under a tenth of an inch"
      : cap(what);
  // "8 p.m.." reads as a typo: one period ends both.
  return `${lead}, ${when}${tomorrow}.`.replace(/\.\.$/, ".");
}

/**
 * The week's rain and snow: "Snow Wednesday and Saturday, about 7½ inches
 * in all. Rain Tuesday, about half an inch." Only days with a fair chance
 * are named; a day with an amount but a slim chance is "a chance".
 */
export function daysPrecipLine(
  days: Array<{
    name: string;
    precip: number;
    snow: number;
    chance: number;
    guess?: "rain" | "snow" | "storms" | null;
  }>,
): string {
  const groups: Array<{ noun: string; names: string[]; total: number; kind: "rain" | "snow" }> = [];
  const add = (kind: "rain" | "snow", name: string, x: number) => {
    let g = groups.find((g) => g.kind === kind);
    if (!g)
      groups.push((g = { noun: kind === "snow" ? "Snow" : "Rain", names: [], total: 0, kind }));
    g.names.push(name);
    g.total += x;
  };
  for (const d of days) {
    if (d.chance < CHANCE) continue;
    const kind = kindOf(d.precip, d.snow);
    if (kind !== "rain" && d.snow >= 0.1) add("snow", d.name, d.snow);
    if (kind !== "snow" && kind) add("rain", d.name, split(d.precip, d.snow).rain);
  }
  if (!groups.length) {
    const maybe =
      days.find((d) => d.chance >= CHANCE) ?? days.find((d) => kindOf(d.precip, d.snow));
    const what = maybe ? (kindOf(maybe.precip, maybe.snow) ?? maybe.guess ?? "rain") : "rain";
    const noun = what === "mix" ? "rain and snow" : what;
    return maybe
      ? `Mostly dry; a chance of ${noun} ${maybe.name}, little if any.`
      : "Little if any all week.";
  }
  return groups
    .map((g) => {
      const words = inchWords(g.total, g.kind);
      const all = g.names.length > 1 && words.startsWith("about") ? " in all" : "";
      return `${g.noun} ${list(g.names)}, ${words}${all}.`;
    })
    .join(" ");
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const list = (xs: string[]) =>
  xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")}, and ${xs.at(-1)}`;

/* ---------------------------------------------------------------- how it feels */

/** "18°" over "air 27°": an hour slot's feel beside the thermometer. */
export function feelsFigure(feels: number, temp: number): Figure {
  return {
    big: `${feels}°`,
    sub: `air ${temp}°`,
    quiet: !feelsSays(temp, feels),
  };
}

/**
 * A day's feel beside the thermometer, from whichever end of the day it
 * strays: the coldest feel over the low ("11°" over "air 19°"), or the
 * hottest over the high.
 */
export function feelsDayFigure(
  high: number,
  low: number,
  feelsHigh: number,
  feelsLow: number,
): Figure {
  const chill = low - feelsLow;
  const heat = feelsHigh - high;
  const [feels, air] = chill >= heat ? [feelsLow, low] : [feelsHigh, high];
  return { big: `${feels}°`, sub: `air ${air}°`, quiet: !feelsSays(air, feels) };
}

/** "Feels as cold as 12° tonight, up to 9° below the air." */
export function hoursFeelsLine(
  hours: Array<{ time: string; temp: number; feels: number }>,
  now: Date,
  tz: string,
): string {
  if (!hours.length) return "";
  const chill = Math.max(...hours.map((h) => h.temp - h.feels));
  const heat = Math.max(...hours.map((h) => h.feels - h.temp));
  if (!hours.some((h) => feelsSays(h.temp, h.feels)))
    return "Feels about like the thermometer says.";
  if (chill >= heat) {
    const cold = hours.reduce((a, b) => (b.feels < a.feels ? b : a));
    const when = periodWord(new Date(cold.time), now, tz);
    return `Feels as cold as ${cold.feels}° ${when}, up to ${chill}° below the air.`;
  }
  const hot = hours.reduce((a, b) => (b.feels > a.feels ? b : a));
  const when = periodWord(new Date(hot.time), now, tz);
  return `Feels as hot as ${hot.feels}° ${when}, up to ${heat}° above the air.`;
}

/**
 * "Feels up to 9° colder than the air; coldest Thursday, 5°." Like with
 * like: the chill is the low against the coldest feel, the heat the high
 * against the hottest.
 */
export function daysFeelsLine(
  days: Array<{ name: string; high: number; low: number; feelsHigh: number; feelsLow: number }>,
): string {
  if (!days.length) return "";
  const chill = Math.max(...days.map((d) => d.low - d.feelsLow));
  const heat = Math.max(...days.map((d) => d.feelsHigh - d.high));
  if (!days.some((d) => feelsSays(d.high, d.feelsHigh) || feelsSays(d.low, d.feelsLow)))
    return "Feels about like the thermometer all week.";
  if (chill >= heat) {
    const cold = days.reduce((a, b) => (b.feelsLow < a.feelsLow ? b : a));
    return `Feels up to ${chill}° colder than the air; coldest ${cold.name}, ${cold.feelsLow}°.`;
  }
  const hot = days.reduce((a, b) => (b.feelsHigh > a.feelsHigh ? b : a));
  return `Feels up to ${heat}° warmer than the air; hottest ${hot.name}, ${hot.feelsHigh}°.`;
}

/* ---------------------------------------------------------------- humidity */

/*
 * Relative humidity is the number people know, so the plate draws it; but on
 * its own it misleads (a cold night is "100%" and feels like nothing). The
 * dew point is the honest measure of how the air feels: muggy from 65°,
 * oppressive from 70°. So the figures carry both, and the words follow the
 * dew point when it's muggy. Dry air alone isn't news in the high desert;
 * dry air with strong gusts is, and the words say so plainly (not "fire
 * weather", which sounds like the weather service's own warning).
 */

const dewWord = (dew: number) => (dew >= 70 ? "Oppressive" : "Muggy");
const SPARKS = "Careful with anything that sparks.";

/** "38%" over "dew 45°". */
export function humidityFigure(rh: number, dew: number): Figure {
  return { big: `${rh}%`, sub: `dew ${dew}°`, quiet: dew < MUGGY && rh > PARCHED };
}

/** A day's humidity: its driest hour (a week's column has no room for a range), and its muggiest dew point. */
export function humidityDayFigure(driest: number, dew: number): Figure {
  return { big: `${driest}%`, sub: `dew ${dew}°`, quiet: dew < MUGGY && driest > PARCHED };
}

/** "Muggy this afternoon, dew point up to 66°." or "Very dry and gusty this afternoon: humidity 9%, gusts to 30 mph. …" */
export function hoursHumidityLine(
  hours: Array<{ time: string; rh: number; dew: number; gust?: number }>,
  now: Date,
  tz: string,
): string {
  if (!hours.length) return "";
  const wet = hours.reduce((a, b) => (b.dew > a.dew ? b : a));
  if (wet.dew >= MUGGY)
    return `${dewWord(wet.dew)} ${periodWord(new Date(wet.time), now, tz)}, dew point up to ${wet.dew}°.`;
  const fire = hours.filter((h) => h.rh <= PARCHED && (h.gust ?? 0) >= FIRE_GUST);
  if (fire.length) {
    const h = fire.reduce((a, b) => ((b.gust ?? 0) > (a.gust ?? 0) ? b : a));
    return `Very dry and gusty ${periodWord(new Date(h.time), now, tz)}: humidity ${h.rh}%, gusts to ${h.gust} mph. ${SPARKS}`;
  }
  return `Comfortable, dew point near ${Math.round(hours.reduce((a, h) => a + h.dew, 0) / hours.length)}°.`;
}

/** "Muggiest Saturday, dew point up to 66°." or "Very dry and gusty Friday: humidity down to 8%, gusts to 30 mph. …" */
export function daysHumidityLine(
  days: Array<{ name: string; rhLow: number; dew: number; gust?: number }>,
): string {
  if (!days.length) return "";
  const wet = days.reduce((a, b) => (b.dew > a.dew ? b : a));
  if (wet.dew >= MUGGY) return `Muggiest ${wet.name}, dew point up to ${wet.dew}°.`;
  const fire = days.filter((d) => d.rhLow <= PARCHED && (d.gust ?? 0) >= FIRE_GUST);
  if (fire.length) {
    const d = fire.reduce((a, b) => ((b.gust ?? 0) > (a.gust ?? 0) ? b : a));
    return `Very dry and gusty ${d.name}: humidity down to ${d.rhLow}%, gusts to ${d.gust} mph. ${SPARKS}`;
  }
  return "Comfortable all week.";
}

/* ---------------------------------------------------------------- the air */

/** The EPA's word for a column: "sensitive" over "groups" for "unhealthy for sensitive groups". */
export function airFigure(aqi: number | undefined): Figure {
  if (aqi == null) return { big: "", sub: "", quiet: true };
  const usg = aqi > AQI_SENSITIVE && aqi < AQI_UNHEALTHY;
  return {
    big: String(aqi),
    sub: usg ? "sensitive" : aqiWord(aqi),
    note: usg ? "groups" : undefined,
    small: true,
    quiet: aqi <= 50,
    act: aqi >= AQI_UNHEALTHY,
    score: aqi,
  };
}

const SMOKY_MODERATE = "Fine for most; sensitive people may want to take it easy.";

/**
 * The next day's air, in the columns' own numbers (one per three-hour slot:
 * its worst hour, and for the first slot the air right now, the NowCast).
 * When it's already bad, now is the news: "Unhealthy air now, AQI 168; worst
 * tomorrow morning, AQI 178: keep time outside short and easy." Otherwise the
 * worst slot ahead, and smoke named when it's what makes a moderate day
 * moderate.
 */
export function hoursAirLine(
  cols: Array<{ time: string; aqi?: number; ozone?: boolean }>,
  now: Date,
  tz: string,
  o: { smoky?: boolean; current?: boolean } = {},
): string {
  const known = cols.filter(
    (c): c is { time: string; aqi: number; ozone?: boolean } => c.aqi != null,
  );
  if (!known.length) return "";
  const worst = known.reduce((a, b) => (b.aqi > a.aqi ? b : a));
  const when = periodWord(new Date(worst.time), now, tz);
  const first = o.current ? cols[0]?.aqi : undefined;
  if (first != null && first > AQI_SENSITIVE) {
    const later =
      worst !== known[0] && worst.aqi > first ? `; worst ${when}, AQI ${worst.aqi}` : "";
    return `${airPhrase(first, cols[0].ozone)} now, AQI ${first}${later}: ${airAdvice(Math.max(first, worst.aqi))}.`;
  }
  if (worst.aqi <= 50) return `Good air, AQI ${worst.aqi} at most.`;
  if (worst.aqi <= AQI_SENSITIVE) {
    return o.smoky && !worst.ozone
      ? `Smoky, moderate air ${when}, AQI up to ${worst.aqi}. ${SMOKY_MODERATE}`
      : `Moderate air ${when}, AQI up to ${worst.aqi}.`;
  }
  return `${airPhrase(worst.aqi, worst.ozone)} ${when}, AQI up to ${worst.aqi}: ${airAdvice(worst.aqi)}.`;
}

/** "Worst air Saturday: AQI 160, unhealthy. Forecast through Sunday." */
export function daysAirLine(
  days: Array<{ name: string; aqi?: number; haze?: number; ozone?: boolean }>,
): string {
  const known = days.filter(
    (d): d is { name: string; aqi: number; haze?: number; ozone?: boolean } => d.aqi != null,
  );
  if (!known.length) return "";
  const worst = known.reduce((a, b) => (b.aqi > a.aqi ? b : a));
  const through = known.length < days.length ? ` Forecast through ${known.at(-1)!.name}.` : "";
  if (worst.aqi <= 50) return `Good air.${through}`;
  if (worst.aqi <= AQI_SENSITIVE && days.some((d) => (d.haze ?? 0) >= HAZE_HOURS)) {
    const smoky = days.find((d) => (d.haze ?? 0) >= HAZE_HOURS)!;
    return `Smoky, moderate air ${smoky.name}, AQI up to ${worst.aqi}. ${SMOKY_MODERATE}${through}`;
  }
  const what = worst.ozone ? `ozone at AQI ${worst.aqi}` : `AQI ${worst.aqi}`;
  return `Worst air ${worst.name}: ${what}, ${aqiWord(worst.aqi)}.${through}`;
}

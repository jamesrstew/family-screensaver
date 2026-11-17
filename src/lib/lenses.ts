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
import { clock, dayKey } from "./time";

/** Every lens, in the order they turn: what matters most comes first. */
export const LENSES = ["sky", "precip", "air", "feels", "wind", "humidity", "uv"] as const;
export type Lens = (typeof LENSES)[number];

/** How long each lens stays: four of them fill home's two-minute weather slide. */
export const LENS_MS = 30_000;

/** The lens showing `elapsed` ms after the view appeared, always starting on the sky. */
export function lensAt(elapsed: number, lenses: readonly Lens[]): Lens {
  if (!lenses.length) return "sky";
  return lenses[Math.floor(Math.max(elapsed, 0) / LENS_MS) % lenses.length];
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
};

/** How far the feel must stray from the thermometer to be worth a lens (°F). */
export const FEELS_GAP = 5;
/** A dew point this high is sticky (°F). */
export const MUGGY = 60;
/** Humidity this low is very dry air: the fire-weather line (%). */
export const PARCHED = 15;
/** Above this the air is no longer "good". */
export const AQI_GOOD = 50;

/**
 * The lenses with something to say about these samples, in order. The sky
 * always; rain and snow only when some is forecast (an amount, or a fair
 * chance); the air when any hour isn't good; how it feels when the wind or
 * the heat moves it 5° or more from the thermometer; wind whenever it's
 * known; humidity when it's sticky (dew point 60° or more) or very dry (15%
 * or less); UV only when the sun is strong enough to register at all.
 */
export function lensesFor(samples: Sample[]): Lens[] {
  const out: Lens[] = ["sky"];
  if (!samples.length) return out;
  const known = (k: keyof Sample) => samples.every((s) => s[k] != null);
  const wet = samples.some(
    (s) => (s.precip ?? 0) >= 0.01 || (s.snow ?? 0) >= 0.1 || (s.chance ?? 0) >= CHANCE,
  );
  if (known("precip") && known("snow") && wet) out.push("precip");
  if (samples.some((s) => (s.aqi ?? 0) > AQI_GOOD)) out.push("air");
  const strays = (t?: number, f?: number) => t != null && f != null && Math.abs(f - t) >= FEELS_GAP;
  if (samples.some((s) => strays(s.temp, s.feels) || strays(s.tempLow, s.feelsLow)))
    out.push("feels");
  if (known("wind") && known("gust")) out.push("wind");
  if (known("rh") && known("dew") && samples.some((s) => s.dew! >= MUGGY || s.rh! <= PARCHED))
    out.push("humidity");
  if (known("uv") && samples.some((s) => Math.round(s.uv!) >= 1)) out.push("uv");
  return out;
}

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
 * Inches, the way a forecaster writes them: "0.04″", "0.4″", "1.2″" of rain;
 * "0.4″", "1.5″", "3″", "14″" of snow. Never less than the smallest measurable amount.
 */
export function inches(x: number, kind: "rain" | "snow"): string {
  if (kind === "snow") {
    if (x < 1) return `${trim(Math.max(x, 0.1), 1)}″`;
    return x < 10 ? `${Math.round(x * 2) / 2}″` : `${Math.round(x)}″`;
  }
  return x < 0.095 ? `${trim(Math.max(x, 0.01), 2)}″` : `${trim(x, 1)}″`;
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

/** "0.4″" over "80%" (with rain's or snow's mark); or just "40%"; or nothing, when dry. */
export function precipFigure(
  precip: number,
  snow: number,
  chance: number,
  guess: "rain" | "snow" | "storms" | null,
): Figure {
  const amount = amountOf(precip, snow);
  // Dry: nothing written. The empty plate above says it.
  if (!amount && chance < CHANCE) return { big: "", sub: "", quiet: true };
  const kind = kindOf(precip, snow) ?? (guess === "storms" ? "rain" : (guess ?? "rain"));
  return { big: amount ?? "", sub: `${chance}%`, kind };
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
    // Gusts barely above the wind aren't worth a line.
    sub: gust >= hi + 3 ? `gusts ${gust}` : "",
    quiet: hi < 4 && gust < 8,
    act: gust >= GALE,
    score: gust,
    dir,
  };
}

const windWord = (hi: number) =>
  hi < 10 ? "Light winds" : hi < 20 ? "Breezy" : hi < 30 ? "Windy" : "Very windy";

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

/** The week's wind: "Windiest Thursday, 10 to 17 mph, gusts to 28. Calmest Sunday." */
export function daysWindLine(
  days: Array<{ name: string; lo: number; hi: number; gust: number }>,
): string {
  if (!days.length) return "";
  const top = days.reduce((a, b) =>
    b.gust > a.gust || (b.gust === a.gust && b.hi > a.hi) ? b : a,
  );
  const hi = Math.max(...days.map((d) => d.hi));
  if (hi < 10 && top.gust < 20) return `Light winds all week, never above ${hi} mph.`;
  const calm = days.reduce((a, b) => (b.gust < a.gust ? b : a));
  const gusts = top.gust > top.hi ? `, gusts to ${top.gust}` : "";
  const calmest = calm.name !== top.name ? ` Calmest ${calm.name}.` : "";
  return `Windiest ${top.name}, ${speeds(top.lo, top.hi)}${gusts}.${calmest}`;
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

/** "Low UV all week, 2 at most." or "UV highest Saturday: 7, high." */
export function daysUvLine(days: Array<{ name: string; uv: number }>): string {
  if (!days.length) return "";
  const top = days.reduce((a, b) => (Math.round(b.uv) > Math.round(a.uv) ? b : a));
  const n = Math.round(top.uv);
  if (n < 3) return `Low UV all week, ${n} at most.`;
  return `UV highest ${top.name}: ${n}, ${uvWord(n)}.${uvAdvice(n)}`;
}

/* ---------------------------------------------------- rain and snow, words */

/** "About 3″ of snow and 0.2″ of rain." */
function totals(precip: number, snow: number): string {
  const kind = kindOf(precip, snow);
  const parts: string[] = [];
  if (kind && kind !== "rain" && snow >= 0.1) parts.push(`${inches(snow, "snow")} of snow`);
  if (kind && kind !== "snow") parts.push(`${inches(split(precip, snow).rain, "rain")} of rain`);
  return parts.length ? `About ${parts.join(" and ")}.` : "Only a trace.";
}

/** The next day's rain and snow: when (the sky's own words), then how much. */
export function hoursPrecipLine(timing: string | null, hours: Sample[]): string {
  const precip = hours.reduce((a, h) => a + (h.precip ?? 0), 0);
  const snow = hours.reduce((a, h) => a + (h.snow ?? 0), 0);
  return [timing, totals(precip, snow)].filter(Boolean).join(" ");
}

/** The week's rain and snow: "Snow Wednesday and Saturday, about 3″ in all. Rain Tuesday, about 0.6″." */
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
    const kind = kindOf(d.precip, d.snow);
    if (kind !== "rain" && d.snow >= 0.1) add("snow", d.name, d.snow);
    if (kind !== "snow" && kind) add("rain", d.name, split(d.precip, d.snow).rain);
  }
  if (!groups.length) {
    const maybe = days.find((d) => d.chance >= CHANCE);
    const what = maybe?.guess ?? "rain";
    return maybe
      ? `Mostly dry; a chance of ${what} ${maybe.name}, little if any.`
      : "Only traces all week.";
  }
  return groups
    .map((g) => {
      const all = g.names.length > 1 ? " in all" : "";
      return `${g.noun} ${list(g.names)}, about ${inches(g.total, g.kind)}${all}.`;
    })
    .join(" ");
}

const list = (xs: string[]) =>
  xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")}, and ${xs.at(-1)}`;

/* ---------------------------------------------------------------- how it feels */

/** "18°" over "air 27°": an hour slot's feel beside the thermometer. */
export function feelsFigure(feels: number, temp: number): Figure {
  const gap = feels - temp;
  return {
    big: `${feels}°`,
    sub: `air ${temp}°`,
    quiet: Math.abs(gap) < FEELS_GAP,
  };
}

/** A day's feel: the warmest over the coldest, as the sky's high and low are set. */
export function feelsDayFigure(high: number, low: number): Figure {
  return { big: `${high}°`, sub: `${low}°` };
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
  if (Math.max(chill, heat) < FEELS_GAP) return "Feels about like the thermometer says.";
  if (chill >= heat) {
    const cold = hours.reduce((a, b) => (b.feels < a.feels ? b : a));
    const when = periodWord(new Date(cold.time), now, tz);
    return `Feels as cold as ${cold.feels}° ${when}, up to ${chill}° below the air.`;
  }
  const hot = hours.reduce((a, b) => (b.feels > a.feels ? b : a));
  const when = periodWord(new Date(hot.time), now, tz);
  return `Feels as hot as ${hot.feels}° ${when}, up to ${heat}° above the air.`;
}

/** "Feels up to 9° colder than the air; coldest Thursday, 5°." */
export function daysFeelsLine(
  days: Array<{ name: string; high: number; low: number; feelsHigh: number; feelsLow: number }>,
): string {
  if (!days.length) return "";
  const chill = Math.max(...days.flatMap((d) => [d.high - d.feelsHigh, d.low - d.feelsLow]));
  const heat = Math.max(...days.flatMap((d) => [d.feelsHigh - d.high, d.feelsLow - d.low]));
  if (Math.max(chill, heat) < FEELS_GAP) return "Feels about like the thermometer all week.";
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
 * dew point is the honest measure of how the air feels: sticky from 60°,
 * oppressive from 70°. So the figures carry both, and the words follow the
 * dew point when it's muggy, the humidity when it's parched.
 */

const dewWord = (dew: number) => (dew >= 70 ? "Oppressive" : dew >= 65 ? "Muggy" : "Humid");

/** "38%" over "dew 45°". */
export function humidityFigure(rh: number, dew: number): Figure {
  return { big: `${rh}%`, sub: `dew ${dew}°`, quiet: dew < MUGGY && rh > PARCHED };
}

/** A day's humidity: its driest hour (a week's column has no room for a range), and its muggiest dew point. */
export function humidityDayFigure(driest: number, dew: number): Figure {
  return { big: `${driest}%`, sub: `dew ${dew}°`, quiet: dew < MUGGY && driest > PARCHED };
}

/** "Muggy this afternoon, dew point up to 66°." or "Very dry air, down to 9% this afternoon." */
export function hoursHumidityLine(
  hours: Array<{ time: string; rh: number; dew: number }>,
  now: Date,
  tz: string,
): string {
  if (!hours.length) return "";
  const wet = hours.reduce((a, b) => (b.dew > a.dew ? b : a));
  const dry = hours.reduce((a, b) => (b.rh < a.rh ? b : a));
  if (wet.dew >= MUGGY)
    return `${dewWord(wet.dew)} ${periodWord(new Date(wet.time), now, tz)}, dew point up to ${wet.dew}°.`;
  if (dry.rh <= PARCHED)
    return `Very dry air, humidity down to ${dry.rh}% ${periodWord(new Date(dry.time), now, tz)}.`;
  return `Comfortable air, dew point near ${Math.round(hours.reduce((a, h) => a + h.dew, 0) / hours.length)}°.`;
}

/** "Muggiest Saturday, dew point up to 66°." or "Driest Friday, humidity down to 8%." */
export function daysHumidityLine(
  days: Array<{ name: string; rhLow: number; dew: number }>,
): string {
  if (!days.length) return "";
  const wet = days.reduce((a, b) => (b.dew > a.dew ? b : a));
  const dry = days.reduce((a, b) => (b.rhLow < a.rhLow ? b : a));
  if (wet.dew >= MUGGY) return `Muggiest ${wet.name}, dew point up to ${wet.dew}°.`;
  if (dry.rhLow <= PARCHED) return `Driest ${dry.name}, humidity down to ${dry.rhLow}%.`;
  return "Comfortable air all week.";
}

/* ---------------------------------------------------------------- the air */

/** The EPA's words for the US AQI. */
export function aqiWord(aqi: number): string {
  if (aqi <= 50) return "good";
  if (aqi <= 100) return "moderate";
  if (aqi <= 150) return "unhealthy for sensitive groups";
  if (aqi <= 200) return "unhealthy";
  if (aqi <= 300) return "very unhealthy";
  return "hazardous";
}

/** The EPA's word, short enough for a column ("sensitive" for "unhealthy for sensitive groups"). */
export const aqiShort = (aqi: number) => (aqi > 100 && aqi <= 150 ? "sensitive" : aqiWord(aqi));

/** From here up, everyone should take care (the EPA's "unhealthy"). */
export const AQI_UNHEALTHY = 151;

/** "135" over "sensitive", and the fine particles under it. */
export function airFigure(aqi: number | undefined, pm?: number): Figure {
  if (aqi == null) return { big: "", sub: "", quiet: true };
  return {
    big: String(aqi),
    sub: aqiShort(aqi),
    small: true,
    note: pm != null && aqi > AQI_GOOD ? `PM2.5 ${pm}` : undefined,
    quiet: aqi <= AQI_GOOD,
    act: aqi >= AQI_UNHEALTHY,
    score: aqi,
  };
}

const airAdvice = (aqi: number) =>
  aqi >= AQI_UNHEALTHY
    ? " Best to stay inside."
    : aqi > 100
      ? " Go easy outside if you're sensitive."
      : "";

/** "The air is unhealthy for sensitive groups this afternoon, AQI up to 135." */
export function hoursAirLine(
  hours: Array<{ time: string; aqi?: number }>,
  now: Date,
  tz: string,
): string {
  const known = hours.filter((h): h is { time: string; aqi: number } => h.aqi != null);
  if (!known.length) return "";
  const worst = known.reduce((a, b) => (b.aqi > a.aqi ? b : a));
  if (worst.aqi <= AQI_GOOD) return `Good air, AQI ${worst.aqi} at most.`;
  const when = periodWord(new Date(worst.time), now, tz);
  return `The air is ${aqiWord(worst.aqi)} ${when}, AQI up to ${worst.aqi}.${airAdvice(worst.aqi)}`;
}

/** "Worst air Saturday: AQI 160, unhealthy. Forecast through Sunday." */
export function daysAirLine(days: Array<{ name: string; aqi?: number }>): string {
  const known = days.filter((d): d is { name: string; aqi: number } => d.aqi != null);
  if (!known.length) return "";
  const worst = known.reduce((a, b) => (b.aqi > a.aqi ? b : a));
  const through = known.length < days.length ? ` Forecast through ${known.at(-1)!.name}.` : "";
  if (worst.aqi <= AQI_GOOD) return `Good air.${through}`;
  return `Worst air ${worst.name}: AQI ${worst.aqi}, ${aqiWord(worst.aqi)}.${through}`;
}

// The air in words: the EPA's names for the US AQI, smoke and haze, and what
// to do about them. Shared by the weather's sentences (home's "Smoky and 91°
// now"), the Air lens, the voice, and the living sky, so they always agree.
//
// Open-Meteo's us_aqi for fine particles is a trailing 24-hour mean (checked
// against its hourly pm2_5 and the EPA's breakpoints): it lags arriving smoke
// by hours, and the blended us_aqi is the worst of every pollutant, ozone
// included. So:
//  - Smoke and haze come from fine particles alone (a high-ozone day is clear).
//  - What the air is like *now* is the worst of the EPA's NowCast for fine
//    particles (what AirNow shows: the last 12 hours, the recent ones weighted
//    more when the air is changing), and Open-Meteo's own ozone and PM10
//    indices. One smoky hour can't set off an alarm, arriving smoke still
//    shows within an hour or two, and clearing smoke stops alarming as soon.
//  - When ozone is what makes the air bad, the words say ozone, not smoke.
//  - Fine particles alone can't tell smoke from smog. A winter inversion
//    traps the town's own exhaust and wood smoke near the ground: the
//    particles climb, but the air above stays clear. Wildfire smoke fills the
//    whole column. So smoke is named only when the aerosol optical depth (how
//    much the whole sky is veiled) says so; otherwise it's smog. With no word
//    of the column (a change upstream), particles alone decide, as before:
//    better to call smog smoke than to miss a wildfire's.
//    Smog is drawn as haze, however dirty: the sky above it is clear, and the
//    air line beside it says how bad it is.
// Later hours keep Open-Meteo's AQI.

/** The EPA's words for the US AQI. */
export function aqiWord(aqi: number): string {
  if (aqi <= 50) return "good";
  if (aqi <= 100) return "moderate";
  if (aqi <= 150) return "unhealthy for sensitive groups";
  if (aqi <= 200) return "unhealthy";
  if (aqi <= 300) return "very unhealthy";
  return "hazardous";
}

/** The top of "good", and of "moderate": past it, the air is worth a word. */
export const AQI_GOOD = 50;
export const AQI_SENSITIVE = 100;
/** From here up, everyone should take care (the EPA's "unhealthy"). */
export const AQI_UNHEALTHY = 151;
/** From here up, stay inside (the EPA's "very unhealthy"). */
export const AQI_VERY = 201;

/** Fine particles (µg/m³) at which the air turns hazy, smoky (or smoggy), and thick: the EPA's 2024 lines. */
export const HAZE_PM = 15;
export const SMOKE_PM = 35.5;
export const THICK_PM = 55.5;
/**
 * Aerosol optical depth (at 550 nm) from which dirty air is smoke: a clear
 * sky is about 0.1, a winter inversion stays near it, wildfire smoke runs
 * from about 0.5 to well past 1. (A damp, foggy inversion can swell toward
 * 0.4; not seen here, but the edge to watch.)
 */
export const SMOKE_AOD = 0.4;

// The EPA's 2024 PM2.5 breakpoints: concentration to index.
const BREAKS: Array<[lo: number, hi: number, a: number, b: number]> = [
  [0, 9, 0, 50],
  [9.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200],
  [125.5, 225.4, 201, 300],
  [225.5, 500, 301, 500],
];

/** An hour's fine particles on the AQI scale (an instant reading, not the 24-hour mean). */
export function pmAqi(pm: number): number {
  const c = Math.floor(Math.max(pm, 0) * 10) / 10;
  const [lo, hi, a, b] = BREAKS.find(([, top]) => c <= top) ?? BREAKS.at(-1)!;
  return Math.round(((b - a) / (hi - lo)) * (Math.min(c, hi) - lo) + a);
}

/** "Air unhealthy for sensitive groups", "Unhealthy air", "Ozone unhealthy": the category as a subject. */
export function airPhrase(aqi: number, ozone = false): string {
  if (ozone) return `Ozone ${aqiWord(aqi)}`;
  if (aqi <= 50) return "Good air";
  if (aqi <= 100) return "Moderate air";
  if (aqi <= 150) return "Air unhealthy for sensitive groups";
  if (aqi <= 200) return "Unhealthy air";
  if (aqi <= 300) return "Very unhealthy air";
  return "Hazardous air";
}

/** What to do, in the EPA's spirit; nothing while the air is fine for everyone. */
export function airAdvice(aqi: number): string {
  if (aqi >= AQI_VERY) return "best to stay inside";
  if (aqi >= AQI_UNHEALTHY) return "keep time outside short and easy";
  if (aqi > AQI_SENSITIVE) return "take it easy outside if you’re sensitive";
  return "";
}

/**
 * The EPA's NowCast for fine particles (µg/m³): the last 12 hours, most
 * recent first, each hour weighted by how steady the air has been (a weight
 * of at least one half). Null without two of the three latest hours.
 */
export function nowcast(recent: Array<number | null | undefined>): number | null {
  const c = recent.slice(0, 12);
  if (c.slice(0, 3).filter((x) => x != null).length < 2) return null;
  const known = c.filter((x): x is number => x != null);
  const lo = Math.min(...known);
  const hi = Math.max(...known);
  const w = hi > 0 ? Math.max(lo / hi, 0.5) : 1;
  let sum = 0;
  let weights = 0;
  c.forEach((x, i) => {
    if (x == null) return;
    sum += w ** i * x;
    weights += w ** i;
  });
  return Math.floor((sum / weights) * 10) / 10;
}

/** The air now, as lib/air.ts gathers it: `pm` is the NowCast (µg/m³); `ozone` and `pm10` are AQIs. */
export type AirReading = { aqi?: number; pm?: number; ozone?: number; pm10?: number };

/**
 * The air right now, as one AQI: the worst of the fine particles' NowCast,
 * ozone, and PM10. Open-Meteo's blended index stands in only when none of
 * those came (an older report).
 */
export function airNow(a: AirReading): number | null {
  const parts = [a.pm == null ? null : pmAqi(a.pm), a.ozone, a.pm10].filter(
    (x): x is number => x != null,
  );
  if (parts.length) return Math.max(...parts);
  return a.aqi ?? null;
}

/** Whether ozone is what makes the air what it is now. */
export function ozoneLeads(a: AirReading): boolean {
  const n = airNow(a);
  return a.ozone != null && n != null && a.ozone >= n && (a.pm == null || pmAqi(a.pm) < n);
}

/**
 * The air, as home and the voice say it, when it isn't fine for everyone:
 * "Unhealthy air, AQI 168: keep time outside short and easy." or "Ozone
 * unhealthy for sensitive groups, AQI 112: …". Null otherwise.
 */
export function airLine(a: AirReading): string | null {
  const n = airNow(a);
  if (n == null || n <= AQI_SENSITIVE) return null;
  return `${airPhrase(n, ozoneLeads(a))}, AQI ${n}: ${airAdvice(n)}.`;
}

/** A day ahead's air, when it won't be fine for everyone: "Tomorrow, unhealthy air, AQI up to 182: …" */
export function airAhead(label: string, aqi?: number, ozone = false): string | null {
  if (aqi == null || aqi <= AQI_SENSITIVE) return null;
  const phrase = airPhrase(aqi, ozone);
  return `${label}, ${phrase[0].toLowerCase()}${phrase.slice(1)}, AQI up to ${aqi}: ${airAdvice(aqi)}.`;
}

/**
 * Smoke and haze, from fine particles (µg/m³: the NowCast now, the hour's
 * reading ahead) and the aerosol optical depth, or, with no word from the
 * air, a short view on a dry day. Ozone is invisible: a high-ozone day is
 * drawn clear.
 *  haze:  fine particles from 15, or visibility under 8 km with no fog or rain.
 *  smog:  from 35.5, under a clear column: an inversion's air.
 *  smoke: from 35.5, unhealthy for sensitive groups, the whole sky veiled.
 *  thick: smoke from 55.5, unhealthy for everyone.
 */
export type Smoke = "none" | "haze" | "smog" | "smoke" | "thick";

/** Whether the whole sky is veiled enough for dirty air to be smoke. */
export const veiled = (aod?: number | null) => aod != null && aod >= SMOKE_AOD;

/** One hour's air, by its fine particles and how veiled the sky is. */
function levelOf(pm: number, aod?: number | null): Smoke {
  if (pm >= SMOKE_PM) {
    if (aod != null && !veiled(aod)) return "smog";
    return pm >= THICK_PM ? "thick" : "smoke";
  }
  return pm >= HAZE_PM ? "haze" : "none";
}

/** Smoke as the sky draws it: smog dims the sun like haze, but no smoke lies over the land. */
export type Drawn = Exclude<Smoke, "smog">;
export const drawn = (s: Smoke): Drawn => (s === "smog" ? "haze" : s);

const RANK: Record<Smoke, number> = { none: 0, haze: 1, smog: 2, smoke: 3, thick: 4 };

/**
 * Smoke over a stretch of hours (a part of the day, a whole day): the worst
 * level that lasts three hours (or all of them, in a shorter stretch).
 */
export function smokeOver(
  pms: Array<number | null | undefined>,
  aods: Array<number | null | undefined> = [],
): Smoke {
  const known = pms.flatMap((pm, i) => (pm == null ? [] : [RANK[levelOf(pm, aods[i])]]));
  const need = Math.min(3, known.length);
  if (!need) return "none";
  const lasting = (s: Smoke) => known.filter((r) => r >= RANK[s]).length >= need;
  return (["thick", "smoke", "smog", "haze"] as const).find(lasting) ?? "none";
}
export function smokeOf(
  now: { pm?: number; aod?: number; visibility?: number; code?: number } | null,
): Smoke {
  if (!now) return "none";
  const { pm, aod, visibility, code } = now;
  const level = levelOf(pm ?? 0, aod);
  if (level !== "none") return level;
  // Fog and rain cut the view too; that isn't haze.
  const murky = code != null && (code === 45 || code === 48 || code >= 51);
  return visibility != null && visibility < 8000 && !murky ? "haze" : "none";
}

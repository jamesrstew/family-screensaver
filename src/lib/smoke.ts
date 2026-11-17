// The air in words: the EPA's names for the US AQI, smoke and haze, and what
// to do about them. Shared by the weather's sentences (home's "Smoky and 91°
// now"), the Air lens, the voice, and the living sky, so they always agree.
//
// Open-Meteo's us_aqi for fine particles is a trailing 24-hour mean (checked
// against its hourly pm2_5 and the EPA's breakpoints): it lags arriving smoke
// by hours. So what the air is like *now* is the EPA's own "now", the NowCast
// (what AirNow shows): the last 12 hours of PM2.5, the recent ones weighted
// more when the air is changing. One smoky hour can't set off an alarm, and
// arriving smoke still shows within the hour or two. Later hours keep
// Open-Meteo's AQI.

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

/** Fine particles (µg/m³) at which the air turns hazy, smoky, and thick: the EPA's 2024 lines. */
export const HAZE_PM = 15;
export const SMOKE_PM = 35.5;
export const THICK_PM = 55.5;

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

/** "Air unhealthy for sensitive groups", "Unhealthy air": the category as a subject. */
export function airPhrase(aqi: number): string {
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

/**
 * The air right now, as one AQI: the worse of Open-Meteo's index and the
 * NowCast of fine particles (`pm` is the NowCast; lib/air.ts computes it).
 */
export function airNow(a: { aqi?: number; pm?: number }): number | null {
  if (a.aqi == null && a.pm == null) return null;
  return Math.max(a.aqi ?? 0, a.pm == null ? 0 : pmAqi(a.pm));
}

/**
 * The air, as home and the voice say it, when it isn't fine for everyone:
 * "Unhealthy air, AQI 168: keep time outside short and easy." Null otherwise.
 */
export function airLine(a: { aqi?: number; pm?: number }): string | null {
  const n = airNow(a);
  if (n == null || n <= AQI_SENSITIVE) return null;
  return `${airPhrase(n)}, AQI ${n}: ${airAdvice(n)}.`;
}

/** A day ahead's air, when it won't be fine for everyone: "Tomorrow, unhealthy air, AQI up to 182: …" */
export function airAhead(label: string, aqi?: number): string | null {
  if (aqi == null || aqi <= AQI_SENSITIVE) return null;
  const phrase = airPhrase(aqi);
  return `${label}, ${phrase[0].toLowerCase()}${phrase.slice(1)}, AQI up to ${aqi}: ${airAdvice(aqi)}.`;
}

/**
 * Smoke and haze, from the air itself: the hour's fine particles (µg/m³)
 * and the US AQI, or, with no word from the air, a short view on a dry day.
 *  haze:  fine particles from 15, or visibility under 8 km with no fog or rain.
 *  smoke: the air unhealthy for sensitive groups (AQI over 100, or 35.5 µg/m³).
 *  thick: the air unhealthy for everyone (AQI over 150, or 55.5 µg/m³).
 */
export type Smoke = "none" | "haze" | "smoke" | "thick";
export function smokeOf(
  now: { aqi?: number; pm?: number; visibility?: number; code?: number } | null,
): Smoke {
  if (!now) return "none";
  const { aqi, pm, visibility, code } = now;
  if ((aqi ?? 0) > 150 || (pm ?? 0) >= THICK_PM) return "thick";
  if ((aqi ?? 0) > AQI_SENSITIVE || (pm ?? 0) >= SMOKE_PM) return "smoke";
  // Fog and rain cut the view too; that isn't haze.
  const murky = code != null && (code === 45 || code === 48 || code >= 51);
  if ((pm ?? 0) >= HAZE_PM || (visibility != null && visibility < 8000 && !murky)) return "haze";
  return "none";
}

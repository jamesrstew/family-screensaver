// How it feels, the way Americans know it: the National Weather Service's
// wind chill in the cold and heat index in the heat. (Open-Meteo's own
// "apparent temperature" is Steadman's, which reads a dry, breezy summer
// afternoon as cooler than the thermometer: "feels as cold as 86°". The NWS
// never calls a hot day cool.)

/** The NWS wind chill (°F), for 50°F and below with a wind of 3 mph or more. */
export function windChill(temp: number, wind: number): number {
  const v = wind ** 0.16;
  return 35.74 + 0.6215 * temp - 35.75 * v + 0.4275 * temp * v;
}

/** The NWS heat index (°F): Steadman's simple form, then Rothfusz's regression with its two adjustments. */
export function heatIndex(temp: number, rh: number): number {
  const simple = 0.5 * (temp + 61 + (temp - 68) * 1.2 + rh * 0.094);
  if ((simple + temp) / 2 < 80) return simple;
  const t = temp;
  let hi =
    -42.379 +
    2.04901523 * t +
    10.14333127 * rh -
    0.22475541 * t * rh -
    0.00683783 * t * t -
    0.05481717 * rh * rh +
    0.00122874 * t * t * rh +
    0.00085282 * t * rh * rh -
    0.00000199 * t * t * rh * rh;
  if (rh < 13 && t >= 80 && t <= 112)
    hi -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(t - 95)) / 17);
  if (rh > 85 && t >= 80 && t <= 87) hi += ((rh - 85) / 10) * ((87 - t) / 5);
  return hi;
}

/** An hour's feel, from the readings the snapshot carries (it carries the readings, not the feel). */
export const hourFeel = (h: { temp: number; wind?: number; rh?: number }) =>
  feelOf(h.temp, h.wind ?? 0, h.rh);

/** A day's hours' feels, from its columns. */
export const dayFeels = (d: { temp?: number[]; wind: number[]; rh?: number[] }) =>
  d.temp?.map((t, i) => feelOf(t, d.wind[i] ?? 0, d.rh?.[i]));

/**
 * How an hour feels (°F): the wind chill when it's cold and windy, the heat
 * index when it's hot (never below the thermometer: dry heat is still heat),
 * otherwise just the temperature.
 */
export function feelOf(temp: number, wind: number, rh?: number): number {
  if (temp <= 50 && wind >= 3) return Math.round(Math.min(windChill(temp, wind), temp));
  if (temp >= 80 && rh != null) return Math.round(Math.max(heatIndex(temp, rh), temp));
  return Math.round(temp);
}

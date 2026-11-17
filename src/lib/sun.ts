// Civil twilight: how long the light lasts after sunset (and comes before
// sunrise), from the sun's height alone. Open-Meteo gives sunrise and sunset
// but not twilight, so a little spherical astronomy on the server fills it in.

const RAD = Math.PI / 180;
/** The sun's center at sunrise and sunset (refraction and its half-width). */
const HORIZON = -0.833;
/** Civil twilight ends when the sun is six degrees down. */
const CIVIL = -6;

/** The sun's declination on a date, degrees (good to about half a degree). */
export function declination(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const day = (date.getTime() - start) / 86_400_000;
  return -23.44 * Math.cos(((2 * Math.PI) / 365.24) * (day + 10));
}

/** The sun's hour angle at a given height, degrees; null if it never gets there. */
function hourAngle(lat: number, dec: number, height: number): number | null {
  const c =
    (Math.sin(height * RAD) - Math.sin(lat * RAD) * Math.sin(dec * RAD)) /
    (Math.cos(lat * RAD) * Math.cos(dec * RAD));
  return c < -1 || c > 1 ? null : Math.acos(c) / RAD;
}

/**
 * Minutes of civil twilight at a latitude on a date: about 24 at the equator,
 * 27 to 40 in the mid-latitudes. Where the sun never sinks six degrees (a
 * northern summer) or never rises, the dusk is long; it's held to 90.
 */
export function civilTwilight(lat: number, date: Date): number {
  const dec = declination(date);
  const set = hourAngle(lat, dec, HORIZON);
  const civil = hourAngle(lat, dec, CIVIL);
  if (set === null || civil === null) return 90;
  // The sun turns fifteen degrees an hour.
  return Math.min(Math.max(Math.round(((civil - set) / 15) * 60), 15), 90);
}

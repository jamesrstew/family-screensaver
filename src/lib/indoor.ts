// What the TV says about inside the house, from the thermostats. Pure.
//
// One number, always: the house's average, "68° inside". Room by room and
// the humidity are for the voice; heating and cooling are the thermostat's
// business. A single number never changes form, so it never re-inks on a
// sensor's wobble: it just changes, like the clock.

import type { Snapshot } from "./types";

/** An indoor reading older than this may be wrong (the heat came on, a window opened). */
export const STALE_MS = 30 * 60_000;

/** The thermostats' readings, if the snapshot holding them is recent. */
export function freshIndoor(snapshot: Snapshot, now: Date) {
  const age = now.getTime() - Date.parse(snapshot.issuedAt);
  return age < STALE_MS ? (snapshot.indoor ?? null) : null;
}

/** The house's temperature to show, or null: none, or too old to trust. */
export function insideTemp(snapshot: Snapshot, now: Date): number | null {
  return freshIndoor(snapshot, now)?.temp ?? null;
}

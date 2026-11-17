// What the TV says about inside the house, from the thermostats. Pure.
//
// One number from one thermostat ("68° inside"): the one in the room named
// by NEST_ROOM, else the house's average (nest.ts decides). Room names and
// humidity are for the voice; heating and cooling are the thermostat's
// business.

import type { Indoor, Snapshot } from "./types";

/** An indoor reading older than this may be wrong (the heat came on, a window opened). */
export const STALE_MS = 30 * 60_000;

/** The thermostats' readings, if they were taken recently. */
export function freshIndoor(snapshot: Snapshot, now: Date): Indoor | null {
  const indoor = snapshot.indoor;
  // The age of the reading itself, not of the snapshot carrying it.
  return indoor && now.getTime() - Date.parse(indoor.at) < STALE_MS ? indoor : null;
}

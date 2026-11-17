// What the TV says about inside the house, from the thermostats. Pure.
//
// One number, the house's average ("68° inside"); when the rooms really
// differ, the range ("66° to 71° inside"). Room names and humidity are for
// the voice; heating and cooling are the thermostat's business. The range
// has a dead band, so a sensor's wobble never flips the note back and forth.

import type { Indoor, Snapshot } from "./types";

/** An indoor reading older than this may be wrong (the heat came on, a window opened). */
export const STALE_MS = 30 * 60_000;
/** Rooms this far apart show as a range; once shown, it stays until they're within MERGE_AT. */
export const SPLIT_AT = 4;
export const MERGE_AT = 2;

/** `temp` is always the house's average, so a range can give way to it. */
export type Inside =
  { kind: "one"; temp: number } | { kind: "range"; low: number; high: number; temp: number };

/** The thermostats' readings, if they were taken recently. */
export function freshIndoor(snapshot: Snapshot, now: Date): Indoor | null {
  const indoor = snapshot.indoor;
  // The age of the reading itself, not of the snapshot carrying it.
  return indoor && now.getTime() - Date.parse(indoor.at) < STALE_MS ? indoor : null;
}

/** The note for these readings, given the one shown before (for the dead band). */
export function insideOf(indoor: Indoor | null | undefined, prev: Inside | null): Inside | null {
  if (!indoor?.rooms.length) return null;
  const temps = indoor.rooms.map((r) => r.temp);
  const low = Math.min(...temps);
  const high = Math.max(...temps);
  const apart = prev?.kind === "range" ? high - low > MERGE_AT : high - low >= SPLIT_AT;
  return apart
    ? { kind: "range", low, high, temp: indoor.temp }
    : { kind: "one", temp: indoor.temp };
}

/** The words as written: "68° inside", "66° to 71° inside". */
export const insideText = (i: Inside) =>
  i.kind === "one" ? `${i.temp}° inside` : `${i.low}° to ${i.high}° inside`;

// What home says about inside the house, from the thermostats. Pure.
//
// One number, usually: the house's average ("68° inside"). Only when the
// rooms really differ (3° or more, enough to reach for a sweater) does each
// room get its own, by name. The air is mentioned only when it's notably dry
// or humid. Whether the heat or the air conditioning is running is the
// thermostat's business, never the page's.

import type { Indoor } from "./types";

/** Rooms this many degrees apart are worth naming. */
export const SPLIT_AT = 3;
/** Indoor humidity below this is dry (static, dry skin); above HUMID_ABOVE, muggy. */
export const DRY_BELOW = 30;
export const HUMID_ABOVE = 60;
/** A split line longer than this, in characters, gives way to a range. */
const LONGEST = 34;

export type Inside =
  | { kind: "one"; temp: number; air: Air }
  | { kind: "rooms"; rooms: Array<{ name: string; temp: number }>; air: Air }
  | { kind: "range"; low: number; high: number; air: Air };

export type Air = "dry" | "humid" | null;

export function insideOf(indoor: Indoor | null | undefined): Inside | null {
  const rooms = indoor?.rooms ?? [];
  if (!indoor || !rooms.length) return null;
  const air = airOf(rooms);
  const temps = rooms.map((r) => r.temp);
  const low = Math.min(...temps);
  const high = Math.max(...temps);
  if (high - low < SPLIT_AT) return { kind: "one", temp: indoor.temp, air };
  const named = rooms.map((r) => ({ name: roomName(r.name), temp: r.temp }));
  const fits =
    named.length <= 3 &&
    named.every((r) => r.name) &&
    new Set(named.map((r) => r.name)).size === named.length &&
    named.reduce((n, r) => n + r.name.length + 6, 0) <= LONGEST;
  return fits ? { kind: "rooms", rooms: named, air } : { kind: "range", low, high, air };
}

/** The rooms' humidity together: dry or humid only when it's notable. */
function airOf(rooms: Indoor["rooms"]): Air {
  const hs = rooms.flatMap((r) => (r.humidity === undefined ? [] : [r.humidity]));
  if (!hs.length) return null;
  const h = hs.reduce((s, x) => s + x, 0) / hs.length;
  return h < DRY_BELOW ? "dry" : h > HUMID_ABOVE ? "humid" : null;
}

/** "Living Room" → "Living room"; an acronym ("TV Room") keeps its capitals. */
export function roomName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .map((w, i) =>
      i === 0
        ? w[0].toUpperCase() + w.slice(1)
        : w.length > 1 && w === w.toUpperCase()
          ? w
          : w.toLowerCase(),
    )
    .join(" ");
}

/** The line's shape, so a change of shape re-inks it (a new number just changes). */
export const insideShape = (i: Inside | null) =>
  i ? `${i.kind}${i.kind === "rooms" ? i.rooms.length : ""}${i.air ?? ""}` : "";

/** The words as written, for measuring: "Hallway 66° · Upstairs 71° · dry air". */
export function insideText(i: Inside): string {
  const air = i.air ? ` · ${i.air} air` : "";
  if (i.kind === "one") return `${i.temp}° inside${air}`;
  if (i.kind === "range") return `${i.low}° to ${i.high}° inside${air}`;
  return i.rooms.map((r) => `${r.name} ${r.temp}°`).join(" · ") + air;
}

/**
 * The fullest version that fits in `room` characters: the rooms, else the
 * house's one number, else the number without the air, else nothing.
 */
export function insideWithin(indoor: Indoor | null | undefined, room: number): Inside | null {
  const full = insideOf(indoor);
  if (!full || !indoor) return null;
  const tries: Inside[] = [
    full,
    { kind: "one", temp: indoor.temp, air: full.air },
    { kind: "one", temp: indoor.temp, air: null },
  ];
  return tries.find((t) => insideText(t).length <= room) ?? null;
}

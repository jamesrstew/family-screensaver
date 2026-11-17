// Time, as the family reads it: in their own time zone, in AP style
// ("7:30 a.m.", "noon"). Pure functions, safe on the server and the TV.

import type { Happening } from "./types";

export type Mood = "morning" | "afternoon" | "evening" | "night";

type Parts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
};

const partsFormatters = new Map<string, Intl.DateTimeFormat>();
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function parts(date: Date, timeZone: string): Parts {
  let f = partsFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      weekday: "short",
      hourCycle: "h23",
    });
    partsFormatters.set(timeZone, f);
  }
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    weekday: WEEKDAYS.indexOf(p.weekday),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-11-16": the calendar day in the family's time zone. */
export function dayKey(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Shift a day key by whole days. */
export function addDays(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const minuteOfDay = (date: Date, timeZone: string) => {
  const { hour, minute } = parts(date, timeZone);
  return hour * 60 + minute;
};

type Sun = { sunrise: string; sunset: string; twilight?: number };

/** Dusk or dawn, and how deep: 0 with the sun on the horizon, 1 at civil night. */
export type Twilight = { side: "dusk" | "dawn"; depth: number };

/** Halfway through civil twilight, as the first stars come out, the paper turns. */
export const TURN = 0.5;

/**
 * Where we are in the day's twilight, by the minute; null in full day or full
 * night. Read as times of day, like the mood. No forecast, no twilight.
 */
export function twilightOf(date: Date, timeZone: string, sun?: Sun | null): Twilight | null {
  if (!sun?.twilight) return null;
  const m = minuteOfDay(date, timeZone);
  const rise = minuteOfDay(new Date(sun.sunrise), timeZone);
  const set = minuteOfDay(new Date(sun.sunset), timeZone);
  const long = sun.twilight;
  if (m >= set && m < set + long) return { side: "dusk", depth: (m - set) / long };
  if (m < rise && m >= rise - long) return { side: "dawn", depth: (rise - m) / long };
  return null;
}

/**
 * How dark the room's light runs at the turn: the veil over the whole sheet.
 * Deeper at dawn, so the morning's paper comes up out of the dark gently,
 * in a room where people are only waking.
 */
export const DUSK_PEAK = { dusk: 0.7, dawn: 0.8 } as const;

const smooth = (x: number) => x * x * (3 - 2 * x);

// After the turn, the veil lifts over this much of the twilight: only long
// enough to hide the paper changing, since the night's ink is dim already.
const LIFT = 0.2;

/**
 * How much of the light has gone, 0 to its peak: the veil deepens from
 * sunset to the turn (the day's paper dimming, its ink with it), then lifts
 * within a few minutes of it (the night's ink coming up, as eyes adjust).
 * Dawn runs the same curve backward. Held near the peak at the turn, so the
 * paper changes under the veil.
 */
export function veilOf(t: Twilight | null): number {
  if (!t) return 0;
  const k =
    t.depth < TURN ? smooth(t.depth / TURN) : 1 - smooth(Math.min((t.depth - TURN) / LIFT, 1));
  return +(DUSK_PEAK[t.side] * k).toFixed(3);
}

/**
 * The paper's mood follows the sun: night from the middle of dusk (the first
 * stars) to the middle of dawn. Either side of the turn, the day's paper dims
 * and brightens under the twilight. Sunrise and sunset are read as times of
 * day, so a forecast from yesterday still works (they move a minute or two a
 * day). With no forecast, night from 9:30 p.m. to 5 a.m.
 */
export function moodOf(date: Date, timeZone: string, sun?: Sun | null): Mood {
  const m = minuteOfDay(date, timeZone);
  const rise = sun ? minuteOfDay(new Date(sun.sunrise), timeZone) : 5 * 60;
  const set = sun ? minuteOfDay(new Date(sun.sunset), timeZone) : 21 * 60 + 30;
  const dusk = twilightOf(date, timeZone, sun);
  if (dusk ? dusk.depth >= TURN : m < rise || m >= set) return "night";
  if (m < 11 * 60) return "morning";
  if (m < 17 * 60) return "afternoon";
  return "evening";
}

/**
 * The question for the table is asked from 2 to 6 p.m. by the family's
 * clock, whatever the light; the rest of the day belongs to ideas and quotes.
 */
export function asksQuestion(date: Date, timeZone: string): boolean {
  const { hour } = parts(date, timeZone);
  return hour >= 14 && hour < 18;
}

/** AP style: "7 a.m.", "7:30 p.m.", "noon", "midnight". */
export function clock(date: Date, timeZone: string): string {
  const { hour, minute } = parts(date, timeZone);
  if (minute === 0 && hour === 12) return "noon";
  if (minute === 0 && hour === 0) return "midnight";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "a.m." : "p.m.";
  return minute === 0 ? `${h} ${suffix}` : `${h}:${pad(minute)} ${suffix}`;
}

/** The clock face without the suffix: "7:42". */
export function clockFace(date: Date, timeZone: string): string {
  const { hour, minute } = parts(date, timeZone);
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:${pad(minute)}`;
}

/** "Monday, November 16, 2026" */
export function longDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/** Weekday for a day key: "Monday" or, short, "Mon." in AP style. */
export function weekdayOf(key: string, style: "long" | "short" = "long"): string {
  const long = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
  }).format(new Date(`${key}T12:00:00Z`));
  if (style === "long") return long;
  // AP abbreviations
  const ap: Record<string, string> = {
    Monday: "Mon.",
    Tuesday: "Tue.",
    Wednesday: "Wed.",
    Thursday: "Thu.",
    Friday: "Fri.",
    Saturday: "Sat.",
    Sunday: "Sun.",
  };
  return ap[long];
}

/** "Nov. 16" in AP style. */
export function shortDate(key: string): string {
  const [, m, d] = key.split("-").map(Number);
  const months = [
    "Jan.",
    "Feb.",
    "March",
    "April",
    "May",
    "June",
    "July",
    "Aug.",
    "Sept.",
    "Oct.",
    "Nov.",
    "Dec.",
  ];
  return `${months[m - 1]} ${d}`;
}

/** Does this happening touch the given day? */
export function happensOn(h: Happening, key: string, timeZone: string): boolean {
  if (h.allDay) return h.start <= key && key < h.end;
  const first = dayKey(new Date(h.start), timeZone);
  // An event ending exactly at midnight doesn't spill into the next day.
  const last = dayKey(new Date(new Date(h.end).getTime() - 1), timeZone);
  return first <= key && key <= last;
}

/** Happenings for one day: all-day first, then by start time. */
export function happeningsOn(all: Happening[], key: string, timeZone: string): Happening[] {
  return all
    .filter((h) => happensOn(h, key, timeZone))
    .sort((a, b) => (a.allDay !== b.allDay ? (a.allDay ? -1 : 1) : a.start.localeCompare(b.start)));
}

/** "9:30 a.m." for a timed happening, "All day" otherwise. */
export function whenOf(h: Happening, key: string, timeZone: string): string {
  if (h.allDay) return "All day";
  const starts = dayKey(new Date(h.start), timeZone);
  if (starts < key) return "Continues";
  return clock(new Date(h.start), timeZone);
}

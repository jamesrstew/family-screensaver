import "server-only";
import { connection } from "next/server";
import { getHappenings } from "./calendar";
import { getIndoor } from "./nest";
import { getNotebook } from "./notebook";
import { forDay } from "./pick";
import { dayKey } from "./time";
import type { Snapshot } from "./types";
import { getWeather } from "./weather";

/** Where the family lives. Env, so the repo stays free of it. */
export function household() {
  const lat = Number(process.env.HOME_LAT);
  const lon = Number(process.env.HOME_LON);
  return {
    place: process.env.HOME_PLACE?.trim() || "Home",
    timeZone: process.env.HOME_TIME_ZONE?.trim() || "America/Los_Angeles",
    coords: Number.isFinite(lat) && Number.isFinite(lon) && lat && lon ? { lat, lon } : null,
    calendars: (process.env.CALENDAR_ICS_URLS ?? "")
      .split(/[\s,]+/)
      .filter(
        (u) =>
          u.startsWith("https://") ||
          (process.env.NODE_ENV !== "production" && u.startsWith("file:")),
      ),
  };
}

const HOUR = 3_600_000;

/**
 * Everything the TV needs for the next while. Each source fails on its own:
 * a dead weather service leaves the weather out, never the whole paper.
 */
export async function getSnapshot(): Promise<Snapshot> {
  await connection(); // always fresh: it's the news
  const now = new Date();
  const h = household();
  // Round the window to the hour so the calendar cache can do its job.
  const hour = Math.floor(now.getTime() / HOUR) * HOUR;

  const [weather, happenings, notebook, indoor] = await Promise.all([
    h.coords ? quietly("weather", getWeather(h.coords.lat, h.coords.lon, h.timeZone)) : null,
    h.calendars.length
      ? quietly(
          "calendar",
          getHappenings(h.calendars, new Date(hour - 24 * HOUR), new Date(hour + 9 * 24 * HOUR)),
        )
      : null,
    quietly("notebook", getNotebook()),
    // The thermostats get a few seconds in all; the rest of the paper doesn't wait on them.
    quietly("nest", within(getIndoor(), NEST_MS)),
  ]);

  return {
    issuedAt: now.toISOString(),
    place: h.place,
    timeZone: h.timeZone,
    weather,
    happenings,
    indoor,
    notebook: forDay(notebook ?? [], dayKey(now, h.timeZone)),
    voice: Boolean(process.env.OPENAI_API_KEY),
  };
}

const NEST_MS = 6000;

/** The promise, or a refusal after `ms` (the work carries on and fills the cache). */
async function within<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, no) => {
    timer = setTimeout(() => no(new Error(`took over ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([p, late]);
  } finally {
    clearTimeout(timer);
  }
}

async function quietly<T>(what: string, p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.error(`[snapshot] ${what} unavailable`, err);
    return null;
  }
}

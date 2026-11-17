import "server-only";
import { connection } from "next/server";
import { getAir, shapeAir, withAir, type OpenMeteoAir } from "./air";
import { getHappenings } from "./calendar";
import { getNotebook } from "./notebook";
import { forDay } from "./pick";
import { dayKey } from "./time";
import type { Snapshot, Weather } from "./types";
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

  const [forecast, air, happenings, notebook] = await Promise.all([
    h.coords ? quietly("weather", getWeather(h.coords.lat, h.coords.lon, h.timeZone)) : null,
    h.coords ? quietly("air", getAir(h.coords.lat, h.coords.lon, h.timeZone)) : null,
    h.calendars.length
      ? quietly(
          "calendar",
          getHappenings(h.calendars, new Date(hour - 24 * HOUR), new Date(hour + 9 * 24 * HOUR)),
        )
      : null,
    quietly("notebook", getNotebook()),
  ]);

  // The air is folded into the weather, and only ever adds to it.
  const weather = forecast && air ? withAirQuietly(forecast, air) : forecast;

  return {
    issuedAt: now.toISOString(),
    place: h.place,
    timeZone: h.timeZone,
    weather,
    happenings,
    notebook: forDay(notebook ?? [], dayKey(now, h.timeZone)),
    voice: Boolean(process.env.OPENAI_API_KEY),
  };
}

function withAirQuietly(w: Weather, air: OpenMeteoAir): Weather {
  try {
    return withAir(w, shapeAir(air));
  } catch (err) {
    console.error("[snapshot] air unreadable", err);
    return w;
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

import "server-only";
import { connection } from "next/server";
import { getAir, shapeAir, withAir, type OpenMeteoAir } from "./air";
import { getHappenings } from "./calendar";
import { getIndoor } from "./nest";
import { passageNear } from "./carousel";
import { fitsEverywhere } from "@/views/designs/common";
import { getNotebook } from "./notebook";
import { forDay, leadDeck, passagesFrom } from "./pick";
import { teamsFrom } from "./games";
import { getGames } from "./sports";
import { within } from "./within";
import { dayKey } from "./time";
import type { NotebookItem, Snapshot, Weather } from "./types";
import { getWeather } from "./weather";

/** Where the family lives. Env, so the repo stays free of it. */
export function household() {
  const lat = Number(process.env.HOME_LAT);
  const lon = Number(process.env.HOME_LON);
  return {
    place: process.env.HOME_PLACE?.trim() || "Home",
    timeZone: process.env.HOME_TIME_ZONE?.trim() || "America/Los_Angeles",
    // The family's teams (lib/games.ts); unset, the games page is the Top 25 alone.
    teams: teamsFrom(process.env.FAMILY_TEAMS),
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
export async function getSnapshot(at?: Date): Promise<Snapshot> {
  await connection(); // always fresh: it's the news
  // `at` is for design review only (page.tsx, in dev): the day's run and the
  // deck as they'd be then.
  const now = at ?? new Date();
  const h = household();
  // Round the window to the hour so the calendar cache can do its job.
  const hour = Math.floor(now.getTime() / HOUR) * HOUR;

  const [forecast, air, happenings, notebook, indoor, sports] = await Promise.all([
    h.coords ? quietly("weather", getWeather(h.coords.lat, h.coords.lon, h.timeZone)) : null,
    h.coords ? quietly("air", getAir(h.coords.lat, h.coords.lon, h.timeZone)) : null,
    h.calendars.length
      ? quietly(
          "calendar",
          getHappenings(h.calendars, new Date(hour - 24 * HOUR), new Date(hour + 9 * 24 * HOUR)),
        )
      : null,
    quietly("notebook", getNotebook()),
    // The thermostats get a few seconds in all; the rest of the paper doesn't wait on them.
    quietly("nest", within(getIndoor(), NEST_MS)),
    // The games likewise: a slow scoreboard never holds up the paper (and
    // getGames answers within its own budget, from the store if need be).
    quietly("sports", within(getGames(now, h.timeZone, h.teams), SPORTS_MS)),
  ]);

  // The air is folded into the weather, and only ever adds to it.
  const weather = forecast && air ? withAirQuietly(forecast, air, h.timeZone) : forecast;

  return {
    issuedAt: now.toISOString(),
    place: h.place,
    timeZone: h.timeZone,
    weather,
    happenings,
    indoor,
    games: sports?.games ?? null,
    ...(sports ? { gamesAt: sports.at } : {}),
    notebook: forDay(notebook ?? [], dayKey(now, h.timeZone)),
    // From a couple of passages back, so a page that appeared a moment ago still finds its own.
    passages: passagesFrom(deckOf(notebook ?? []), passageNear(now.getTime()) - 4),
    voice: Boolean(process.env.OPENAI_API_KEY),
  };
}

// Fitting every passage takes a moment; the notebook changes rarely, so
// the deck is kept until the notebook itself is a different list.
let deck: { from: NotebookItem[]; items: NotebookItem[] } | null = null;
function deckOf(notebook: NotebookItem[]): NotebookItem[] {
  if (deck?.from !== notebook) deck = { from: notebook, items: leadDeck(notebook, fitsEverywhere) };
  return deck.items;
}

const NEST_MS = 6000;
const SPORTS_MS = 6000;

function withAirQuietly(w: Weather, air: OpenMeteoAir, tz: string): Weather {
  try {
    return withAir(w, shapeAir(air), tz);
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

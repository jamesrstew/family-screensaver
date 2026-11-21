import { z } from "zod";
import { WEATHER_VIEWS, type WeatherView } from "./carousel";
import type { LeaguePick } from "./games";
import { TEAM_QUERY } from "./team-query";
import { PAGES, type Page } from "./types";

// Requests to show a page come from the phone remote, Siri, Alexa, and the
// voice. A request is just "show this page" (and, for the weather, which view
// of it). The TV decides the rest.

type Asked = { page: Page; view?: WeatherView; team?: string; league?: LeaguePick };

/**
 * The leagues, by the names people say. "Football" alone is both college and
 * the NFL (a family that says it on a Saturday means one, on a Sunday the
 * other); "basketball" is men's college basketball, the only basketball here.
 */
export const LEAGUE_WORDS: Record<string, LeaguePick> = {
  cfb: "cfb",
  "college football": "cfb",
  "ncaa football": "cfb",
  ncaaf: "cfb",
  cbb: "cbb",
  mbb: "cbb",
  basketball: "cbb",
  "college basketball": "cbb",
  "men's basketball": "cbb",
  "men's college basketball": "cbb",
  "mens college basketball": "cbb",
  "ncaa basketball": "cbb",
  ncaab: "cbb",
  "college hoops": "cbb",
  hoops: "cbb",
  nfl: "nfl",
  "pro football": "nfl",
  football: "football",
};

/** "show NFL", "the NFL", "show the NFL": every way of saying each league, as a page to ask for. */
const LEAGUE_ALIASES: Record<string, Asked> = Object.fromEntries(
  Object.entries(LEAGUE_WORDS).flatMap(([said, league]) =>
    [said, `the ${said}`, `show ${said}`, `show the ${said}`].map((s) => [
      s,
      { page: "sports" as const, league },
    ]),
  ),
);

const ALIASES: Record<string, Asked> = {
  ...LEAGUE_ALIASES,
  home: { page: "home" },
  front: { page: "home" },
  ideas: { page: "notebook" },
  forecast: { page: "weather" },
  calendar: { page: "week" },
  schedule: { page: "week" },
  "week ahead": { page: "week" },
  quote: { page: "notebook" },
  idea: { page: "notebook" },
  question: { page: "notebook" },
  // The scoreboard: every game, as on home (the family's teams and the Top 25).
  sports: { page: "sports" },
  games: { page: "sports" },
  "the games": { page: "sports" },
  "all games": { page: "sports" },
  "all the games": { page: "sports" },
  "show sports": { page: "sports" },
  "show the games": { page: "sports" },
  "show all games": { page: "sports" },
  "show all the games": { page: "sports" },
  scores: { page: "sports" },
  "the scores": { page: "sports" },
  "show scores": { page: "sports" },
  "show the scores": { page: "sports" },
  scoreboard: { page: "sports" },
  "the scoreboard": { page: "sports" },
  "show the scoreboard": { page: "sports" },
  "show scoreboard": { page: "sports" },
  "nature mode": { page: "nature" },
  "show nature": { page: "nature" },
  relax: { page: "nature" },
  calm: { page: "nature" },
  // The weather's views, by the names people say.
  now: { page: "weather", view: "now" },
  hours: { page: "weather", view: "hours" },
  hourly: { page: "weather", view: "hours" },
  "hour by hour": { page: "weather", view: "hours" },
  days: { page: "weather", view: "days" },
  daily: { page: "weather", view: "days" },
  "seven day": { page: "weather", view: "days" },
  "7 day": { page: "weather", view: "days" },
  "ten day": { page: "weather", view: "days" },
  "10 day": { page: "weather", view: "days" },
  "weekly forecast": { page: "weather", view: "days" },
  "week's forecast": { page: "weather", view: "days" },
  today: { page: "weather", view: "ribbon" },
  "next 24 hours": { page: "weather", view: "ribbon" },
  ribbon: { page: "weather", view: "ribbon" },
};

const words = (s: string) =>
  s.trim().toLowerCase().replace(/[’]/g, "'").replace(/[-_]+/g, " ").replace(/\s+/g, " ");

/** A word's own entry, never one an object inherits ("constructor"). */
const own = <T>(map: Record<string, T>, k: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(map, k) ? map[k] : undefined;

/**
 * `{"page": "hourly"}`, `{"page": "weather", "view": "days"}`, or one team's
 * games: `{"page": "sports", "team": "kentucky basketball"}` (a few words;
 * resolved to a team on the server, never passed on as said), or one
 * league's: `{"page": "sports", "league": "nfl"}` (or simply `{"page": "nfl"}`).
 * A league that isn't one of the few is left out: the whole scoreboard.
 */
export const ShowBody = z
  .object({
    page: z.string().max(40),
    view: z.string().max(40).optional(),
    league: z.string().max(40).optional(),
    // Longer than any team's name is cut, not refused (a run-on dictation).
    team: z
      .string()
      .max(400)
      .transform((t) => t.slice(0, 60))
      .optional(),
  })
  .transform(({ page, view, team, league }, ctx): Asked => {
    const p = words(page);
    const asked: Asked | undefined =
      own(ALIASES, p) ?? (PAGES.includes(p as Page) ? { page: p as Page } : undefined);
    if (!asked) {
      ctx.addIssue({ code: "custom", message: "Unknown page" });
      return z.NEVER;
    }
    if (asked.page === "sports") {
      // A team, if one is named; else a league, if one of the few; else every game.
      const q = team?.trim();
      if (q && TEAM_QUERY.test(q)) return { page: "sports", team: q };
      const l = league === undefined ? undefined : own(LEAGUE_WORDS, words(league));
      return l ? { page: "sports", league: l } : asked;
    }
    if (view === undefined || asked.page !== "weather") return asked;
    const v = words(view);
    const named = WEATHER_VIEWS.find((w) => w === v) ?? own(ALIASES, v)?.view;
    return named ? { page: "weather", view: named } : asked;
  });

/** The team a request carries to the screen: the games page's only; any other page clears it. */
export const teamFor = <T>(page: Page, team?: T | null): T | null =>
  page === "sports" && team ? team : null;

/** The league a request carries to the screen: the games page's only, and never beside a team. */
export const leagueFor = (
  page: Page,
  league?: LeaguePick | null,
  team?: unknown,
): LeaguePick | null => (page === "sports" && league && !team ? league : null);

/** Requests older than this are ignored by a TV that just woke up. */
export const SHOW_TTL_MS = 2 * 60_000;

/** The weather view a request carries: only the weather has views; any other page (or the arrows) clears it. */
export const viewAsked = (page: Page, view?: WeatherView): WeatherView | null =>
  page === "weather" ? (view ?? null) : null;

/**
 * What the screen draws: a carousel slide (home's by day, the night page's
 * by night, in Almanac), the weather in the view asked for (by request, else
 * ?weather=), or the page itself.
 */
export function targetOf(o: {
  base: Page | "night";
  slide: string | null;
  asked: WeatherView | null;
  fromUrl: WeatherView;
}): string {
  // A weather slide keeps its name across sunset and sunrise; a passage
  // turns into the night page's (or home's) with the mood.
  // So do the games (by night in night's ink, like the weather).
  if (o.slide?.startsWith("weather") || o.slide?.startsWith("games")) return `carousel:${o.slide}`;
  if (o.slide) return `${o.base === "night" ? "night" : "home"}:${o.slide}`;
  if (o.base === "weather") return `weather:${o.asked ?? o.fromUrl}`;
  return o.base;
}

/**
 * The page a target draws: passages back to back ("home:passage-7", then
 * "home:passage-8") are the same page, so it stays and only its piece turns.
 */
export const pageKey = (target: string) => target.replace(/:passage-\d+$/, ":passage");

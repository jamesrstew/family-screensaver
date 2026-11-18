import "server-only";
import { cacheLife } from "next/cache";
import { after } from "next/server";
import { addDays, dayKey } from "./time";
import {
  AHEAD_DAYS,
  GAMES_FRESH_MS,
  MAX_GAMES,
  curate,
  marketChance,
  readChance,
  readEvents,
  readMarkets,
  trim,
  withChance,
  withTeams,
  type Market,
  type Team,
} from "./games";
import { KEYS, store } from "./store";
import type { Game, League } from "./types";
import { within } from "./within";

// The games, from ESPN's public site API, and their chances from Kalshi's
// public market data: no keys, no accounts. Both can change without notice,
// so every source fails on its own and the page leaves out what didn't
// answer (a game without a market falls back to ESPN's predictor).

const SITE = "https://site.api.espn.com/apis/site/v2/sports";
const CORE = "https://sports.core.api.espn.com/v2/sports";
const PATH: Record<League, string> = {
  cfb: "football/college-football",
  cbb: "basketball/mens-college-basketball",
  nfl: "football/nfl",
};
// ESPN's scoreboards take one day at a time, by Eastern time.
const ESPN_TZ = "America/New_York";
// Kalshi's public market data (no key): its game-winner series, per league.
const KALSHI = "https://api.elections.kalshi.com/trade-api/v2/markets";
const SERIES: Record<League, string> = {
  cfb: "KXNCAAFGAME",
  cbb: "KXNCAAMBGAME",
  nfl: "KXNFLGAME",
};

/** Each request gets this long; all of them run at once. */
const FETCH_MS = 2500;
/** The whole gathering, predictor included (the snapshot allows the games 6 s). */
export const BUDGET_MS = 4500;
/** A list kept in the store this new is served as it is. */
const FRESH_MS = 4 * 60_000;

/** The games, and when they were gathered. */
export type Gathered = { at: string; games: Game[] };
type Kept = Gathered & { teams: string };

/**
 * The games worth a line on the page: the Top 25 through the next few days,
 * and the family's teams through the week, each with its chance of winning.
 *
 * Kept in the store, so a cold server (a new instance, or after a deploy)
 * has the last good list at once: a list under four minutes old is served
 * as is; an older one (up to half an hour) is served while a fresh one is
 * gathered behind it, for the next asking. Throws only if nothing answered
 * and nothing is kept.
 */
export async function getGames(now: Date, tz: string, teams: readonly Team[]): Promise<Gathered> {
  const sig = teams.map((t) => `${t.league}:${t.id}`).join(",");
  const kept = await within(store.get<Kept>(KEYS.games), 1000).catch(() => null);
  const age = kept ? now.getTime() - Date.parse(kept.at) : NaN;
  // The same teams, and not from the future (a dev clock set back).
  const usable = kept && kept.teams === sig && age >= 0 && age < GAMES_FRESH_MS ? kept : null;
  if (usable && age < FRESH_MS) return { at: usable.at, games: usable.games };
  const work = gather(now, tz, teams).then((games): Gathered => ({ at: now.toISOString(), games }));
  // Kept for the next asking, after the answer: a slow store never holds up the page.
  after(() =>
    work.then((fresh) => keep(fresh, sig)).catch((err) => console.error("[sports] not kept", err)),
  );
  if (!usable) return work;
  return { at: usable.at, games: usable.games };
}

/** Keep a list, unless a newer one is already kept (two refreshes overlapping). */
async function keep(fresh: Gathered, teams: string): Promise<void> {
  const kept = await store.get<Kept>(KEYS.games);
  if (kept && kept.teams === teams && Date.parse(kept.at) > Date.parse(fresh.at)) return;
  await store.set(KEYS.games, { ...fresh, teams });
}

/** Everything at once, within the budget: scores first, then each game's chance. */
export async function gather(
  now: Date,
  tz: string,
  teams: readonly Team[],
  budget = BUDGET_MS,
): Promise<Game[]> {
  const began = Date.now();
  const left = () => Math.max(0, budget - (Date.now() - began));
  // The markets, alongside the scores: football and basketball always; the
  // NFL only for a family team (it has no Top 25).
  const leagues: League[] = [
    "cfb",
    "cbb",
    ...(teams.some((t) => t.league === "nfl") ? ["nfl" as const] : []),
  ];
  const books = leagues.map((l) => markets(l).catch(() => [] as Market[]));
  // The scoreboards, from yesterday (last night's finals) to a day past the
  // Top 25's reach (a late Pacific game falls on the next Eastern day):
  // college football's has every FBS game (filtered by rank in curate); men's
  // basketball's is the Top 25's alone by default.
  const first = dayKey(now, ESPN_TZ);
  const days = Array.from({ length: AHEAD_DAYS + 3 }, (_, i) =>
    addDays(first, i - 1).replaceAll("-", ""),
  );
  const boards = (["cfb", "cbb"] as const).flatMap((league) =>
    days.map((d) =>
      events(
        league,
        `${SITE}/${PATH[league]}/scoreboard?dates=${d}${league === "cfb" ? "&groups=80" : ""}&limit=300`,
      ),
    ),
  );
  // The family's teams, whole seasons, the regular and the postseason.
  const seasons = teams.flatMap((t) =>
    [2, 3].map((type) =>
      events(t.league, `${SITE}/${PATH[t.league]}/teams/${t.id}/schedule?seasontype=${type}`),
    ),
  );
  const got = await Promise.allSettled([...boards, ...seasons]);
  const ok = got.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  if (!ok.length) throw new Error("no scoreboard answered");
  // Twice as many as will show: the chances rule out the foregone ones.
  const games = curate(withTeams(ok.flat(), teams), now, tz, MAX_GAMES * 2);
  // The market's chance where it trades; otherwise ESPN's predictor (a
  // request each, kept an hour). Whatever doesn't answer in time goes
  // without: the games come back either way.
  const book = new Map(
    leagues.map((l, i) => [l, within(books[i], left()).catch(() => [] as Market[])]),
  );
  const chanced = await Promise.all(
    games.map(async (g) => {
      if (g.state !== "pre") return g;
      const day = dayKey(new Date(g.start), ESPN_TZ);
      const market = marketChance(g, (await book.get(g.league)) ?? [], day);
      if (market) return withChance(g, market, "market");
      const espn = await within(chance(g.league, g.id), left()).catch(() => null);
      return withChance(g, espn, "espn");
    }),
  );
  return trim(chanced);
}

async function events(league: League, url: string): Promise<Game[]> {
  "use cache";
  // Scores move during a game; the snapshot asks every five minutes.
  cacheLife({ stale: 60, revalidate: 240, expire: 3600 });
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_MS) });
  if (!res.ok) throw new Error(`espn ${res.status}`);
  return readEvents(await res.json(), league);
}

/** A league's open game markets on Kalshi, closing within the next ten days. */
async function markets(league: League): Promise<Market[]> {
  "use cache";
  // Prices move; the snapshot asks every five minutes.
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  const out: Market[] = [];
  let cursor = "";
  const until = Math.floor(Date.now() / 1000) + 10 * 86_400;
  // A page holds a thousand: a few pages at most, even in March.
  for (let page = 0; page < 4; page++) {
    const q = new URLSearchParams({
      series_ticker: SERIES[league],
      status: "open",
      limit: "1000",
      max_close_ts: String(until),
      ...(cursor ? { cursor } : {}),
    });
    const res = await fetch(`${KALSHI}?${q}`, { signal: AbortSignal.timeout(FETCH_MS) });
    if (!res.ok) throw new Error(`kalshi ${res.status}`);
    const json = await res.json();
    out.push(...readMarkets(json));
    cursor = typeof json?.cursor === "string" ? json.cursor : "";
    if (!cursor) break;
  }
  return out;
}

async function chance(league: League, id: string): Promise<Record<string, number> | null> {
  "use cache";
  // ESPN's ids are numbers; anything else never reaches a URL.
  if (!/^\d+$/.test(id)) return null;
  cacheLife({ stale: 600, revalidate: 3600, expire: 6 * 3600 });
  const [sport, name] = PATH[league].split("/");
  const url = `${CORE}/${sport}/leagues/${name}/events/${id}/competitions/${id}/predictor`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_MS) });
  // Not every game has one (it comes a few days ahead).
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`espn predictor ${res.status}`);
  return readChance(await res.json());
}

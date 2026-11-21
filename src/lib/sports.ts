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
  slateOf,
  trim,
  withChance,
  withTeams,
  type Market,
  type Team,
} from "./games";
import { KEYS, store } from "./store";
import {
  TEAM_QUERY,
  readRanked,
  readRefs,
  readTeams,
  resolveTeam,
  teamKey,
  words,
  type Found,
  type TeamEntry,
} from "./team-query";
import { readSchedule, teamView } from "./team-view";
import type { Game, League, TeamView } from "./types";
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

/**
 * The games, and when they were gathered; and the NFL's slate, for its own
 * page (null: its scoreboard didn't answer; absent from a list kept before it).
 */
export type Gathered = { at: string; games: Game[]; nfl?: Game[] | null };
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
  const served = (k: Kept): Gathered => ({
    at: k.at,
    games: k.games,
    ...(k.nfl !== undefined ? { nfl: k.nfl } : {}),
  });
  if (usable && age < FRESH_MS) return served(usable);
  const work = gather(now, tz, teams).then((g): Gathered => ({ at: now.toISOString(), ...g }));
  // Kept for the next asking, after the answer: a slow store never holds up the page.
  after(() =>
    work.then((fresh) => keep(fresh, sig)).catch((err) => console.error("[sports] not kept", err)),
  );
  if (!usable) return work;
  return served(usable);
}

/** Keep a list, unless a newer one is already kept (two refreshes overlapping). */
async function keep(fresh: Gathered, teams: string): Promise<void> {
  const kept = await store.get<Kept>(KEYS.games);
  if (kept && kept.teams === teams && Date.parse(kept.at) > Date.parse(fresh.at)) return;
  await store.set(KEYS.games, { ...fresh, teams });
}

/**
 * Everything at once, within the budget: scores first, then each game's
 * chance. The NFL's slate (its own page's) stands or falls on its own: the
 * rest never waits on it, nor fails with it.
 */
export async function gather(
  now: Date,
  tz: string,
  teams: readonly Team[],
  budget = BUDGET_MS,
): Promise<{ games: Game[]; nfl: Game[] | null }> {
  const began = Date.now();
  const left = () => Math.max(0, budget - (Date.now() - began));
  // The markets, alongside the scores, for all three leagues.
  const leagues: League[] = ["cfb", "cbb", "nfl"];
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
  // The NFL's scoreboard for its own page: the week at hand, Thursday to
  // Monday, as ESPN gives it with no date (it has no Top 25, so the list
  // above takes only the family's NFL games).
  const week = events("nfl", `${SITE}/${PATH.nfl}/scoreboard?limit=300`);
  const fulfilled = (rs: PromiseSettledResult<Game[]>[]) =>
    rs.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const [got, nflGot] = await Promise.all([
    Promise.allSettled([...boards, ...seasons]),
    Promise.allSettled([week]),
  ]);
  const ok = fulfilled(got);
  if (!ok.length) throw new Error("no scoreboard answered");
  const nflOk = fulfilled(nflGot);
  // Twice as many as will show: the chances rule out the foregone ones.
  const games = curate(withTeams(ok.flat(), teams), now, tz, MAX_GAMES * 2);
  const slate = nflOk.length ? slateOf(withTeams(nflOk.flat(), teams), now, tz) : null;
  const book = new Map(leagues.map((l, i) => [l, books[i]]));
  const [chanced, nfl] = await Promise.all([
    chancesFor(games, book, left),
    slate ? chancesFor(slate, book, left) : null,
  ]);
  return { games: trim(chanced), nfl };
}

/**
 * Each game still to come with its chance: the market's where it trades;
 * otherwise ESPN's predictor (a request each, kept an hour). Whatever
 * doesn't answer within `left()` goes without: the games come back either way.
 */
async function chancesFor(
  games: Game[],
  books: Map<League, Promise<Market[]>>,
  left: () => number,
): Promise<Game[]> {
  return Promise.all(
    games.map(async (g) => {
      if (g.state !== "pre") return g;
      const book = await within(books.get(g.league) ?? Promise.resolve([]), left()).catch(
        () => [] as Market[],
      );
      const market = marketChance(g, book, dayKey(new Date(g.start), ESPN_TZ));
      if (market) return withChance(g, market, "market");
      const espn = await within(chance(g.league, g.id), left()).catch(() => null);
      return withChance(g, espn, "espn");
    }),
  );
}

// ---- One team's page, asked for by name ("show Kentucky basketball").

const LEAGUES: League[] = ["cfb", "cbb", "nfl"];

/**
 * The team someone asked for, by ESPN's lists for all three leagues (kept a
 * day), or null. The query is checked before anything is fetched, and never
 * goes into a URL: only the ids it resolves to do.
 */
export async function findTeam(
  q: string,
  family: readonly Team[],
  now: Date,
): Promise<Found | null> {
  if (!TEAM_QUERY.test(q)) return null;
  const quietly = <T>(p: Promise<T>, none: T) => within(p, FETCH_MS).catch(() => none);
  const [lists, ranked, books, fbs, fcs] = await Promise.all([
    Promise.all(LEAGUES.map((l) => quietly(teamList(l), [] as TeamEntry[]))),
    Promise.all((["cfb", "cbb"] as const).map((l) => quietly(rankings(l), [] as string[]))),
    Promise.all(LEAGUES.map((l) => quietly(markets(l), [] as Market[]))),
    quietly(division(80, now), [] as string[]),
    quietly(division(81, now), [] as string[]),
  ]);
  const teams = lists.flat();
  const [top, next] = [new Set(fbs), new Set(fcs)];
  return resolveTeam(q, teams, family, now, {
    ranked: new Set(ranked.flat()),
    volume: tradedBy(teams, books),
    // Basketball's list is Division I alone, and the NFL is the NFL;
    // football's holds every division.
    tier: (t) => (t.league !== "cfb" || top.has(t.id) ? 2 : next.has(t.id) ? 1 : 0),
  });
}

/** Each team's market volume, summed over its open game markets (by name), as a share of its league's busiest. */
function tradedBy(teams: TeamEntry[], books: Market[][]): Map<string, number> {
  const byName = LEAGUES.map((_, i) => {
    const m = new Map<string, number>();
    for (const k of books[i] ?? []) m.set(words(k.name), (m.get(words(k.name)) ?? 0) + k.volume);
    return m;
  });
  // A share of the busiest team in the same league: the NFL's markets are
  // deeper than college's, and must not win a college team's ties.
  const top = byName.map((m) => Math.max(1, ...m.values()));
  const volume = new Map<string, number>();
  for (const t of teams) {
    const i = LEAGUES.indexOf(t.league);
    const v = byName[i]?.get(words(t.place)) ?? 0;
    if (v) volume.set(teamKey(t), v / top[i]);
  }
  return volume;
}

/** The Top 25 now (the first poll ESPN lists: the playoff committee's, in season), as team keys. */
async function rankings(league: "cfb" | "cbb"): Promise<string[]> {
  "use cache";
  cacheLife({ stale: 600, revalidate: 6 * 3600, expire: 86_400 });
  const res = await fetch(`${SITE}/${PATH[league]}/rankings`, {
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!res.ok) throw new Error(`espn rankings ${res.status}`);
  return readRanked(await res.json(), league);
}

/** College football's FBS (80) or FCS (81) teams this season, by ESPN id (kept a week). */
async function division(group: 80 | 81, now: Date): Promise<string[]> {
  "use cache";
  cacheLife({ stale: 86_400, revalidate: 7 * 86_400, expire: 30 * 86_400 });
  // The season is named for the year it starts, in August.
  const year = now.getUTCFullYear() - (now.getUTCMonth() < 7 ? 1 : 0);
  const url = `${CORE}/football/leagues/college-football/seasons/${year}/types/2/groups/${group}/teams?limit=300`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_MS) });
  if (!res.ok) throw new Error(`espn division ${res.status}`);
  const ids = readRefs(await res.json());
  if (!ids.length) throw new Error("espn division: none");
  return ids;
}

/** A league's teams (ESPN's full list; it changes a few times a year). */
export async function teamList(league: League): Promise<TeamEntry[]> {
  "use cache";
  cacheLife({ stale: 3600, revalidate: 86_400, expire: 7 * 86_400 });
  const res = await fetch(`${SITE}/${PATH[league]}/teams?limit=1000`, {
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!res.ok) throw new Error(`espn teams ${res.status}`);
  const teams = readTeams(await res.json(), league);
  // An empty list is a bad answer, not news: never kept for a day.
  if (!teams.length) throw new Error("espn teams: none");
  return teams;
}

/**
 * One team's page: its schedules (regular season and postseason), each game
 * ahead with its chance, within the budget. Null if ESPN doesn't know the
 * team or didn't answer.
 */
export async function getTeamView(
  league: League,
  id: string,
  now: Date,
  budget = BUDGET_MS,
): Promise<TeamView | null> {
  if (!LEAGUES.includes(league) || !/^\d{1,8}$/.test(id)) return null;
  const began = Date.now();
  const left = () => Math.max(0, budget - (Date.now() - began));
  const book = new Map([[league, markets(league).catch(() => [] as Market[])]]);
  const got = await Promise.allSettled([2, 3].map((type) => schedule(league, id, type)));
  const ok = got.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const view = teamView(ok, league, id, now);
  if (!view) return null;
  const ahead = await chancesFor(view.ahead, book, left);
  return { ...view, ahead };
}

async function schedule(league: League, id: string, type: number) {
  "use cache";
  cacheLife({ stale: 60, revalidate: 240, expire: 3600 });
  const url = `${SITE}/${PATH[league]}/teams/${id}/schedule?seasontype=${type}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_MS) });
  if (!res.ok) throw new Error(`espn schedule ${res.status}`);
  return { ...readSchedule(await res.json(), league), postseason: type === 3 };
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

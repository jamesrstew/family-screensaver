// The games: college football, men's college basketball, and the NFL, from
// ESPN's public scoreboards. Only the Top 25 and the family's own teams.
// Pure functions, safe on the server and the TV; the fetching is in sports.ts.

import { addDays, clock, dayKey, weekdayOf } from "./time";
import type { Game, League, Side, Snapshot } from "./types";

/** One of the family's teams: its league and ESPN's id for it. */
export type Team = { league: League; id: string };

const LEAGUE_WORDS: Record<string, League> = { cfb: "cfb", mbb: "cbb", cbb: "cbb", nfl: "nfl" };

/**
 * The family's teams, from FAMILY_TEAMS: ESPN league:id pairs, separated by
 * commas ("cfb:2294,mbb:2250,nfl:3"). They live in env, not in the repo: a
 * family's teams say a good deal about where it lives (§17). Anything
 * malformed is skipped; none at all means the Top 25 alone.
 */
export function teamsFrom(s: string | undefined): Team[] {
  return (s ?? "").split(/[\s,]+/).flatMap((pair) => {
    const m = pair
      .trim()
      .toLowerCase()
      .match(/^([a-z]+):(\d+)$/);
    const league = m ? LEAGUE_WORDS[m[1]] : undefined;
    return m && league ? [{ league, id: m[2] }] : [];
  });
}

/** The games with the family's teams marked (their sides set in full ink, kept first). */
export function withTeams(games: Game[], teams: readonly Team[]): Game[] {
  const mine = (league: League, s: Side): Side =>
    teams.some((t) => t.league === league && t.id === s.id) ? { ...s, mine: true } : s;
  return games.map((g) => ({ ...g, home: mine(g.league, g.home), away: mine(g.league, g.away) }));
}

/** Days ahead the Top 25 reaches (today and three more: midweek, it already shows Saturday). */
export const AHEAD_DAYS = 3;
/** The family's teams reach further: their next game, if it's within the week. */
export const MINE_DAYS = 7;
/** No more than this, however busy the Saturday. */
export const MAX_GAMES = 21;
/** A family team's final stays up this long (did they win last night?). */
const FINAL_HOLD_MS = 18 * 3_600_000;
const STALE_MS = 6 * 3_600_000;

// ---- Reading ESPN. Its scoreboards and team schedules carry the same events
// in slightly different shapes (a score is a string in one, an object in the
// other; a channel is `names` in one, `media` in the other). Anything odd is
// skipped, never guessed.

type Json = Record<string, unknown>;
const obj = (x: unknown): Json => (x && typeof x === "object" ? (x as Json) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined => (typeof x === "string" && x ? x : undefined);
const num = (x: unknown): number | undefined => {
  const n = typeof x === "string" ? Number(x) : x;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};

/** Every game in a scoreboard or a team's schedule. */
export function readEvents(json: unknown, league: League): Game[] {
  return arr(obj(json).events).flatMap((e) => {
    try {
      const g = readEvent(obj(e), league);
      return g ? [g] : [];
    } catch {
      return [];
    }
  });
}

function readEvent(e: Json, league: League): Game | null {
  const c = obj(arr(e.competitions)[0]);
  const status = obj(obj(c.status).type ?? obj(e.status).type);
  const state = str(status.state);
  const id = str(e.id);
  const start = str(e.date) ?? str(c.date);
  if (!id || !start || Number.isNaN(Date.parse(start))) return null;
  if (state !== "pre" && state !== "in" && state !== "post") return null;
  // Postponed, canceled, forfeited: not a game to watch. (Delayed and
  // suspended ones still are: they say so.)
  if (/POSTPONED|CANCELED|CANCELLED|FORFEIT/.test(str(status.name) ?? "")) return null;
  const sides = arr(c.competitors).map(obj);
  const home = sides.find((s) => s.homeAway === "home");
  const away = sides.find((s) => s.homeAway === "away");
  if (!home || !away) return null;
  const h = readSide(home, league, state);
  const a = readSide(away, league, state);
  if (!h || !a) return null;
  const period = num(obj(c.status).period) ?? num(obj(e.status).period) ?? 0;
  return {
    id,
    league,
    start: new Date(start).toISOString(),
    timed: c.timeValid !== false,
    state,
    period: periodOf(league, state, period, str(status.name)),
    neutral: c.neutralSite === true,
    tv: channelOf(c),
    away: a,
    home: h,
  };
}

function readSide(s: Json, league: League, state: string): Side | null {
  const t = obj(s.team);
  const id = str(t.id);
  if (!id) return null;
  // The NFL by nickname ("Bears"); colleges by place ("Iowa").
  const name =
    league === "nfl"
      ? (str(t.name) ?? str(t.shortDisplayName))
      : (str(t.location) ?? str(t.shortDisplayName));
  if (!name) return null;
  const rank = num(obj(s.curatedRank).current) ?? num(s.rank);
  const sc = obj(s.score);
  const score = state === "pre" ? undefined : (num(sc.value) ?? num(s.score));
  return {
    id,
    name,
    short: str(t.shortDisplayName) ?? name,
    ...(str(t.abbreviation) ? { abbr: str(t.abbreviation) } : {}),
    ...(str(t.location) ? { place: str(t.location) } : {}),
    // ESPN writes 99 for unranked.
    ...(rank && rank <= 25 && league !== "nfl" ? { rank } : {}),
    ...(score !== undefined ? { score } : {}),
  };
}

/** The national channel, first listed, in its plain name. */
function channelOf(c: Json): string | undefined {
  const b = arr(c.broadcasts).map(obj);
  const names = b.flatMap((x) => [
    ...arr(x.names).map(str),
    str(obj(x.media).shortName),
    str(x.name),
  ]);
  const first = names.find(Boolean);
  return first ? channel(first) : undefined;
}

// The names as a family would look for them, and short enough for their
// column: the SEC's and the ACC's streams are on ESPN+.
const CHANNELS: Record<string, string> = {
  "ESPN/Disney+": "ESPN",
  "USA Net": "USA",
  "SECN+": "ESPN+",
  ACCNX: "ESPN+",
  ACCN: "ACC Network",
  "B1G+": "Big Ten+",
};

/** "ESPN/Disney+" → "ESPN", "SECN+" → "ESPN+". */
export const channel = (name: string): string => CHANNELS[name] ?? name.split("/")[0].trim();

const ORDINAL = ["", "1st", "2nd", "3rd", "4th"];

/** Where a game stands, without its clock (nothing on the paper counts down). */
export function periodOf(league: League, state: string, period: number, name?: string) {
  if (/DELAYED|SUSPENDED/.test(name ?? "") && state !== "post") return "Delayed";
  if (state === "pre") return undefined;
  const regulation = league === "cbb" ? 2 : 4;
  const over = period > regulation;
  if (state === "post") return over ? "Final, OT" : "Final";
  if (name === "STATUS_HALFTIME") return "Halftime";
  if (name === "STATUS_END_PERIOD") {
    if (period === regulation / 2) return "Halftime";
    if (period === regulation) return "End of regulation";
    if (over) return "End of overtime";
    return `End of ${ORDINAL[period] ?? ""} qtr.`;
  }
  if (over) return "Overtime";
  if (league === "cbb") return `${ORDINAL[period] ?? ""} half`;
  return `${ORDINAL[period] ?? ""} qtr.`;
}

/**
 * ESPN's matchup predictor for one game: each team's chance of winning, in
 * percent, keyed by team id (the core API's `predictor`, or the site
 * summary's). Null if it isn't there.
 */
export function readChance(json: unknown): Record<string, number> | null {
  const j = obj(json);
  const out: Record<string, number> = {};
  for (const side of ["homeTeam", "awayTeam"]) {
    const t = obj(j[side]);
    // Core API: a $ref to the team, and a list of statistics.
    const ref = str(obj(t.team).$ref);
    const id = str(t.id) ?? ref?.match(/teams\/(\d+)/)?.[1];
    const stats = arr(t.statistics).map(obj);
    const p = num(t.gameProjection) ?? num(stats.find((s) => s.name === "gameProjection")?.value);
    if (!id || p === undefined || p < 0 || p > 100) return null;
    out[id] = p;
  }
  return out;
}

/** The game with its chances folded in, as whole percents (a market's or ESPN's predictor's). */
export function withChance(
  g: Game,
  chance: Record<string, number> | null,
  from: "market" | "espn" = "espn",
): Game {
  if (!chance || g.state !== "pre") return g;
  const h = chance[g.home.id];
  const a = chance[g.away.id];
  if (h === undefined || a === undefined) return g;
  const home = Math.round(h);
  // A market's two chances add to 100 (ESPN's leave room for a tie).
  const away = from === "market" ? 100 - home : Math.round(a);
  return { ...g, home: { ...g.home, chance: home }, away: { ...g.away, chance: away } };
}

// ---- The markets. Kalshi lists a market on each team to win nearly every
// NFL and college game, a few days ahead; where people actually trade it,
// its price is the best estimate there is. A thin market (few contracts, a
// wide gap between bid and ask) says little, and is passed over.

/** One team's market: "will this team win?", priced in dollars (0 to 1). */
export type Market = {
  /** The game's event ("KXNFLGAME-26NOV22MINGB"); its two teams share it. */
  event: string;
  /** The game's date, as Kalshi writes it in the ticker (Eastern): "2026-11-22". */
  day: string;
  /** Kalshi’s code for the team ("CHI"), and its name ("Chicago", "Ohio St."). */
  code: string;
  name: string;
  bid: number;
  ask: number;
  /** Contracts traded. */
  volume: number;
};

/** A game this thin isn't trusted: fewer contracts traded (both teams'), or a wider spread. */
export const MIN_VOLUME = 10_000;
export const MAX_SPREAD = 0.05;

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Every team's market in a list of Kalshi's markets (`GET /markets`). */
export function readMarkets(json: unknown): Market[] {
  return arr(obj(json).markets).flatMap((x) => {
    const m = obj(x);
    const ticker = str(m.ticker);
    const event = str(m.event_ticker);
    const name = str(m.yes_sub_title);
    const d = event?.match(/-(\d{2})([A-Z]{3})(\d{2})/);
    const month = d ? MONTHS.indexOf(d[2]) + 1 : 0;
    const bid = num(m.yes_bid_dollars);
    const ask = num(m.yes_ask_dollars);
    if (!ticker || !event || !name || !d || !month || bid === undefined || ask === undefined) {
      return [];
    }
    return [
      {
        event,
        day: `20${d[1]}-${String(month).padStart(2, "0")}-${d[3]}`,
        code: ticker.slice(ticker.lastIndexOf("-") + 1),
        name,
        bid,
        ask,
        volume: num(m.volume_fp) ?? num(m.volume) ?? 0,
      },
    ];
  });
}

/** "Ohio St." and "Ohio State", "Texas A&M" and "Texas A and M": one name. */
const said = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bst\.?(?=\s|$)/g, "state")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Is this market on this team? By Kalshi's code or by name, never by a guess. */
const byCode = (m: Market, s: Side) => Boolean(s.abbr && m.code === s.abbr.toUpperCase());
const byName = (m: Market, s: Side) =>
  [s.place, s.name, s.short].some((x) => x && said(x) === said(m.name));
const onTeam = (m: Market, s: Side) => byName(m, s) || byCode(m, s);

const dayGap = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/**
 * The market's chances for a game, keyed by team id, or null: both teams'
 * markets must be found (in one event, on the game's date or a day either
 * side of it), and both must be liquid. Each price is the middle of its bid
 * and ask; the two are scaled to add up to 100 (the market's margin taken out).
 */
export function marketChance(
  g: Game,
  markets: Market[],
  espnDay: string,
): Record<string, number> | null {
  const near = markets.filter((m) => dayGap(m.day, espnDay) <= 1);
  const tight = (m: Market) => m.bid > 0 && m.ask < 1 && m.ask - m.bid <= MAX_SPREAD;
  // Every event that might be this game, until one is liquid (a thin one
  // a day off doesn't hide the right one).
  for (const event of new Set(near.filter((m) => onTeam(m, g.home)).map((m) => m.event))) {
    const mine = near.filter((m) => m.event === event);
    const h = pick(mine, g.home);
    const a = pick(mine, g.away);
    // Two markets, two teams: never one market read as both, so the
    // chances can't swap sides.
    if (!h || !a || h === a || h.code === a.code) continue;
    if (h.volume + a.volume < MIN_VOLUME || !tight(h) || !tight(a)) continue;
    const ph = (h.bid + h.ask) / 2;
    const pa = (a.bid + a.ask) / 2;
    return { [g.home.id]: (100 * ph) / (ph + pa), [g.away.id]: (100 * pa) / (ph + pa) };
  }
  return null;
}

/** The team's market in an event: by name first (codes collide: "MIA"), else by code. */
function pick(ms: Market[], s: Side): Market | undefined {
  return ms.find((m) => byName(m, s)) ?? ms.find((m) => byCode(m, s));
}

// ---- Choosing. Less is more: the family's teams always, then the Top 25's
// best games, never more than a few pages of them.

export const ours = (g: Game) => Boolean(g.home.mine || g.away.mine);

/** Lower is better: two ranked teams beat one; higher ranks beat lower. */
function interest(g: Game): number {
  const r = [g.home.rank ?? 40, g.away.rank ?? 40].sort((a, b) => a - b);
  return (g.home.rank && g.away.rank ? 0 : 100) + r[0] + r[1] / 4;
}

/**
 * The games worth a line, in time order: the family's teams' games (their
 * next one within the week; a final for a while after), and the Top 25's
 * through the next few days, best first until there are `max`. One game
 * listed twice (a scoreboard and a team's schedule) is kept once, as first
 * listed.
 */
export function curate(all: Game[], now: Date, tz: string, max = MAX_GAMES): Game[] {
  const t = now.getTime();
  const today = dayKey(now, tz);
  const last = addDays(today, AHEAD_DAYS);
  const lastMine = addDays(today, MINE_DAYS);
  const byId = new Map<string, Game>();
  for (const g of all) {
    const key = `${g.league}:${g.id}`;
    const had = byId.get(key);
    byId.set(key, had ? { ...had, tv: had.tv ?? g.tv } : g);
  }
  // A game still "to come" hours after its start is a scoreboard gone stale
  // (or a game called off without word): not a game to list.
  const games = [...byId.values()].filter(
    (g) => g.state !== "pre" || Date.parse(g.start) > t - STALE_MS,
  );
  const dayOf = (g: Game) => dayKey(new Date(g.start), tz);

  const mine = games.filter((g) => {
    if (!ours(g)) return false;
    if (g.state === "post") return t - Date.parse(g.start) < FINAL_HOLD_MS;
    return dayOf(g) <= lastMine;
  });
  // Only each team's next game beyond the Top 25's few days, not its whole week.
  const nextOf = new Map<string, Game>();
  for (const g of mine.filter((g) => g.state === "pre").sort(byStart)) {
    const team = (g.home.mine ? g.home : g.away).id + g.league;
    if (!nextOf.has(team)) nextOf.set(team, g);
  }
  const keep = mine.filter(
    (g) => g.state !== "pre" || dayOf(g) <= last || [...nextOf.values()].includes(g),
  );

  const ranked = games
    .filter(
      (g) =>
        !ours(g) &&
        (g.home.rank || g.away.rank) &&
        // Under way, or still to come within the few days; finals give way.
        g.state !== "post" &&
        dayOf(g) >= today &&
        dayOf(g) <= last,
    )
    .sort((a, b) => interest(a) - interest(b) || byStart(a, b));

  return trim([...keep, ...ranked], max);
}

/** A Top 25 game this one-sided (by its market, or ESPN's predictor) isn't worth a line. */
export const LOPSIDED = 95;

/**
 * At most `max` games, in time order: the family's always, then the Top 25's
 * best, leaving out the foregone conclusions (a No. 3 against a small school).
 */
export function trim(games: Game[], max = MAX_GAMES): Game[] {
  const close = (g: Game) => ours(g) || Math.max(g.home.chance ?? 0, g.away.chance ?? 0) < LOPSIDED;
  const mine = games.filter(ours);
  const rest = games
    .filter((g) => !ours(g) && close(g))
    .sort((a, b) => interest(a) - interest(b) || byStart(a, b));
  return [...mine, ...rest.slice(0, Math.max(0, max - mine.length))].sort(byStart);
}

const byStart = (a: Game, b: Game) =>
  a.start.localeCompare(b.start) || Number(ours(b)) - Number(ours(a)) || a.id.localeCompare(b.id);

// ---- Laying out. The page is an agenda by day; a long one turns in leaves,
// half a minute each, like the weather's lenses.

export type Line = { kind: "day"; key: string; label: string } | { kind: "game"; game: Game };

/** "Yesterday", "Today", "Tomorrow", "Saturday". */
export function dayLabel(key: string, now: Date, tz: string): string {
  const today = dayKey(now, tz);
  if (key === today) return "Today";
  if (key === addDays(today, -1)) return "Yesterday";
  if (key === addDays(today, 1)) return "Tomorrow";
  return weekdayOf(key);
}

/**
 * The games in leaves of at most `rows` lines, a day's name heading each
 * day's games (again at the top of a leaf when the day carries over). A day's
 * name never sits alone at the foot of a leaf.
 */
export function leavesOf(games: Game[], now: Date, tz: string, rows: number): Line[][] {
  const leaves: Line[][] = [];
  let leaf: Line[] = [];
  let day = "";
  for (const game of games) {
    const key = dayKey(new Date(game.start), tz);
    const head: Line = { kind: "day", key, label: dayLabel(key, now, tz) };
    const fresh = key !== day;
    // A new day needs room for its name and one game.
    if (leaf.length + (fresh ? 2 : 1) > rows) {
      leaves.push(leaf);
      leaf = [head];
    } else if (fresh) leaf.push(head);
    leaf.push({ kind: "game", game });
    day = key;
  }
  if (leaf.length) leaves.push(leaf);
  return leaves;
}

/** How long each leaf stays. */
export const LEAF_MS = 30_000;

/** Which leaf is up: one after another, by the clock, from the first. */
export const leafAt = (now: number, since: number, count: number) =>
  count < 2 ? 0 : Math.floor(Math.max(0, now - since) / LEAF_MS) % count;

// ---- Words.

/** "7:30 p.m.", "TBA", or where it stands: "3rd qtr.", "Final". */
export function whenWord(g: Game, tz: string): string {
  if (g.period) return g.period;
  if (g.state !== "pre") return "";
  return g.timed ? clock(new Date(g.start), tz) : "TBA";
}

/** "at" for a home game, "vs." on neutral ground. */
export const joinWord = (g: Game) => (g.neutral ? "vs." : "at");

/**
 * The chance worth printing: a family team's own (even as the underdog),
 * else the favorite's. A toss-up still names one side.
 */
export function chanceOf(g: Game): { side: Side; pct: number } | null {
  const { home, away } = g;
  if (home.chance === undefined || away.chance === undefined) return null;
  if (home.mine !== away.mine) {
    const s = home.mine ? home : away;
    return { side: s, pct: s.chance! };
  }
  const s = home.chance >= away.chance ? home : away;
  return { side: s, pct: s.chance! };
}

/** Games this old aren't news: the TV leaves them out until a fresh snapshot brings new ones. */
export const GAMES_FRESH_MS = 30 * 60_000;

/**
 * The games as the TV should show them now: none once the list is old (a
 * server that stopped answering, a TV offline), and never a game long past,
 * however the list was kept: still "to come" (or under way) six hours after
 * its start, or a final after 18. (Like freshIndoor and freshWeather.)
 */
export function freshGames(s: Pick<Snapshot, "games" | "gamesAt">, now: Date): Game[] | null {
  const at = s.gamesAt ? Date.parse(s.gamesAt) : NaN;
  if (!s.games || !(now.getTime() - at <= GAMES_FRESH_MS)) return null;
  const t = now.getTime();
  return s.games.filter((g) => {
    const since = t - Date.parse(g.start);
    return g.state === "post" ? since < FINAL_HOLD_MS : since < STALE_MS;
  });
}

/** The games within the page's few days (the carousel shows only these). */
export function horizon(games: Game[], now: Date, tz: string): Game[] {
  const last = addDays(dayKey(now, tz), AHEAD_DAYS);
  return games.filter((g) => dayKey(new Date(g.start), tz) <= last);
}

/** Whether home's carousel has games to show, and whether a family team plays today. */
export function gamesCue(games: Game[] | null, now: Date, tz: string) {
  const near = horizon(games ?? [], now, tz);
  const today = dayKey(now, tz);
  return {
    any: near.length > 0,
    ours: near.some((g) => ours(g) && dayKey(new Date(g.start), tz) === today),
  };
}

/**
 * The games for home's slide: those within the few days, a family team's
 * game today leading today's (the reason the slide comes round more often).
 */
export function slideGames(games: Game[], now: Date, tz: string): Game[] {
  const today = dayKey(now, tz);
  const key = (g: Game) => dayKey(new Date(g.start), tz);
  const lead = (g: Game) => (key(g) === today && ours(g) ? 0 : 1);
  return horizon(games, now, tz).sort(
    (a, b) => key(a).localeCompare(key(b)) || lead(a) - lead(b) || byStart(a, b),
  );
}

/** The leader (or the winner), for setting in full ink. */
export function ahead(g: Game): Side | null {
  if (g.state === "pre" || g.home.score === undefined || g.away.score === undefined) return null;
  if (g.home.score === g.away.score) return null;
  return g.home.score > g.away.score ? g.home : g.away;
}

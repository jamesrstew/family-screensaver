// Finding a team from what someone said: "Kentucky basketball", "the Zags",
// "Bucs", "Alabama football". Resolved on the server against ESPN's own
// team lists, so any team works, not only the family's; the TV and every
// URL only ever see the ESPN league and id it resolves to. Pure functions;
// the fetching is in sports.ts.

import { curly, type Team } from "./games";
import type { League } from "./types";

/** One team in ESPN's list for a league. */
export type TeamEntry = {
  league: League;
  id: string;
  /** "Kentucky", "Chicago". */
  place: string;
  /** "Wildcats", "Bears". */
  name: string;
  /** "Kentucky Wildcats". */
  full: string;
  /** "Kentucky", "Kansas St", "Bears". */
  short: string;
  /** "UK", "CHI". */
  abbr: string;
};

/** A team found: its league and ESPN id, and its full name (for the page's title at once). */
export type Found = Team & { name: string };

/** What a team request may look like: a few words, nothing else. */
export const TEAM_QUERY = /^[\p{L}\p{N} .'&-]{1,60}$/u;

type Json = Record<string, unknown>;
const obj = (x: unknown): Json => (x && typeof x === "object" ? (x as Json) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string => (typeof x === "string" ? x : "");

/** A league's teams from ESPN's `/teams` list. Anything odd is skipped. */
export function readTeams(json: unknown, league: League): TeamEntry[] {
  const leagues = arr(obj(arr(obj(json).sports)[0]).leagues);
  return arr(obj(leagues[0]).teams).flatMap((x) => {
    const t = obj(obj(x).team);
    const id = str(t.id);
    if (!/^\d+$/.test(id) || t.isActive === false) return [];
    return [
      {
        league,
        id,
        place: str(t.location),
        name: str(t.name),
        full: str(t.displayName),
        short: str(t.shortDisplayName),
        abbr: str(t.abbreviation),
      },
    ];
  });
}

/** The teams in a `/rankings` answer's first poll, as team keys ("cfb:61"). */
export function readRanked(json: unknown, league: League): string[] {
  const poll = obj(arr(obj(json).rankings)[0]);
  return arr(poll.ranks).flatMap((r) => {
    const id = str(obj(obj(r).team).id);
    return /^\d+$/.test(id) ? [teamKey({ league, id })] : [];
  });
}

/** Lowercase words: "St." as "Saint" when it leads, else "State"; "&" as "and". */
export const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/&/g, " and ")
    .replace(/^\s*st\b\.?/, "saint")
    .replace(/\bst\.?(?=\s|$)/g, "state")
    .replace(/'s\b/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// The sport, said plainly. "Football" alone is college or pro: the team decides.
const SPORT: Array<[RegExp, League[]]> = [
  [/\b(nfl|pro football)\b/, ["nfl"]],
  [/\bcollege football\b/, ["cfb"]],
  [/\b(men s |mens |college )?(basketball|hoops|bball)\b/, ["cbb"]],
  [/\bfootball\b/, ["cfb", "nfl"]],
];

// What families call teams that their names don't say.
const NICKNAMES: Record<string, string> = {
  niners: "49ers",
  bucs: "buccaneers",
  pats: "patriots",
  pack: "packers",
  boys: "cowboys",
  hawks: "seahawks",
  phins: "dolphins",
  jags: "jaguars",
  cats: "wildcats",
  hogs: "razorbacks",
  noles: "seminoles",
  canes: "hurricanes",
  dawgs: "bulldogs",
  vols: "volunteers",
  zags: "gonzaga",
};

/**
 * The query's leagues (from a sport word; all three if none), and every run
 * of its words, as said and with nicknames read ("show me the Texas A&M
 * schedule" holds "texas a and m"; "the Citadel" holds itself). A team's
 * name is matched whole against these, never against what's left after
 * stripping words, so "Boston College" and "Texas A&M" stay themselves.
 */
export function parseQuery(q: string): { leagues: League[]; spans: string[]; core: string } {
  const w = words(q);
  const leagues = SPORT.find(([re]) => re.test(w))?.[1] ?? ["cfb", "cbb", "nfl"];
  const tokens = w.split(" ").filter(Boolean).slice(0, 12);
  const spans = new Set<string>();
  for (const t of [tokens, tokens.map((x) => NICKNAMES[x] ?? x)]) {
    for (let a = 0; a < t.length; a++) {
      for (let b = a + 1; b <= t.length; b++) spans.add(t.slice(a, b).join(" "));
    }
  }
  // The words left once the asking is set aside: an abbreviation ("KSU")
  // counts only when it's all that names the team, never a stray "me".
  const core = tokens.filter((x) => !ASKING.has(x)).join(" ");
  return { leagues, spans: [...spans], core };
}

const ASKING = new Set(
  "show me the a an schedule game games team page please on tv for of season upcoming next mens men women womens college pro nfl football basketball hoops bball".split(
    " ",
  ),
);

/** How well a team answers to a run of words (0: not at all). */
function fit(t: TeamEntry, span: string, core: string): number {
  const said = (x: string) => (x ? words(x) : "");
  if (span === said(t.full)) return 5;
  if (span === said(t.place) || span === said(t.short)) return 4;
  if (span === said(t.name)) return 3;
  if (span === core && span === said(t.abbr)) return 2;
  return 0;
}

const MONTHS: Record<League, { heart: number[]; ends: number[] }> = {
  cfb: { heart: [9, 10, 11], ends: [8, 12, 1] },
  nfl: { heart: [9, 10, 11, 12], ends: [1, 2] },
  cbb: { heart: [12, 1, 2, 3], ends: [11, 4] },
};

/**
 * How much a league's season is on (by month): 2 in its heart (football in
 * the fall, basketball in winter), 1 at its ends (bowls, the playoffs, the
 * tournament's last games, opening weeks), 0 out of season.
 */
export function seasonOf(league: League, now: Date): number {
  const m = now.getUTCMonth() + 1;
  return MONTHS[league].heart.includes(m) ? 2 : MONTHS[league].ends.includes(m) ? 1 : 0;
}

/** What's known of how much a team matters now: Top 25 teams, and how much its markets trade. */
export type Notable = { ranked: ReadonlySet<string>; volume: ReadonlyMap<string, number> };
export const teamKey = (t: { league: League; id: string }) => `${t.league}:${t.id}`;

/**
 * The team someone asked for, or null. The longest run of words naming a
 * team wins ("Kansas State" over "Kansas"), then the better fit (the full
 * name, the place, the nickname, the abbreviation). Among equals: a Top 25
 * team; the family's own, while its season is on; the league whose season
 * is on; the team whose games trade most (Kalshi); the family's own at all;
 * then by name, so the answer never depends on the order of the lists.
 */
export function resolveTeam(
  q: string,
  lists: TeamEntry[],
  family: readonly Team[],
  now: Date,
  notable: Notable = { ranked: new Set(), volume: new Map() },
): Found | null {
  if (!TEAM_QUERY.test(q)) return null;
  const { leagues, spans, core } = parseQuery(q);
  const mine = (t: TeamEntry) => family.some((f) => f.league === t.league && f.id === t.id);
  const scored = lists
    .filter((t) => leagues.includes(t.league))
    .flatMap((t) => {
      let best = { len: 0, score: 0 };
      for (const span of spans) {
        const score = fit(t, span, core);
        const len = span.split(" ").length;
        if (score && (len > best.len || (len === best.len && score > best.score))) {
          best = { len, score };
        }
      }
      return best.score ? [{ t, ...best }] : [];
    });
  const season = (t: TeamEntry) => seasonOf(t.league, now);
  const best = scored.sort(
    (a, b) =>
      b.len - a.len ||
      b.score - a.score ||
      Number(notable.ranked.has(teamKey(b.t))) - Number(notable.ranked.has(teamKey(a.t))) ||
      Number(mine(b.t) && season(b.t) > 0) - Number(mine(a.t) && season(a.t) > 0) ||
      season(b.t) - season(a.t) ||
      (notable.volume.get(teamKey(b.t)) ?? 0) - (notable.volume.get(teamKey(a.t)) ?? 0) ||
      Number(mine(b.t)) - Number(mine(a.t)) ||
      a.t.full.localeCompare(b.t.full),
  )[0];
  return best ? { league: best.t.league, id: best.t.id, name: curly(best.t.full) } : null;
}

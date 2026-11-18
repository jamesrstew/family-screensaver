// Finding a team from what someone said: "Kentucky basketball", "the Zags",
// "Bucs", "Alabama football". Resolved on the server against ESPN's own
// team lists, so any team works, not only the family's; the TV and every
// URL only ever see the ESPN league and id it resolves to. Pure functions;
// the fetching is in sports.ts.

import type { Team } from "./games";
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
  /** "ARIZ", "SF". */
  abbr: string;
};

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

/** Lowercase words, with "St." as "State" and "&" as "and". */
export const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/&/g, " and ")
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

// Words that ask for the page, not name the team.
const FILLER =
  /\b(show|me|the|a|an|schedule|games?|team|page|please|on|tv|for|of|season|upcoming|next|mens|men|women|womens|college|pro|nfl|football|basketball|hoops|bball)\b/g;

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

/** The query's leagues (from a sport word; all three if none) and the team words left. */
export function parseQuery(q: string): { leagues: League[]; team: string } {
  const w = words(q);
  const leagues = SPORT.find(([re]) => re.test(w))?.[1] ?? ["cfb", "cbb", "nfl"];
  const team = w
    .replace(FILLER, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((x) => NICKNAMES[x] ?? x)
    .join(" ");
  return { leagues, team };
}

/** How well a team answers to these words (0: not at all). */
function fit(t: TeamEntry, team: string): number {
  const said = (x: string) => (x ? words(x) : "");
  if (team === said(t.full)) return 5;
  if (team === said(t.place) || team === said(t.short)) return 4;
  if (team === said(t.name)) return 3;
  if (team === said(t.abbr)) return 2;
  return 0;
}

/**
 * How much a league's season is on (by month): 2 in its heart (football in
 * the fall, basketball in winter), 1 at its ends, 0 out of season.
 */
export function seasonOf(league: League, now: Date): number {
  const m = now.getUTCMonth() + 1;
  const heart = { cfb: [8, 11], nfl: [9, 12], cbb: [12, 3] }[league];
  const ends = { cfb: [12, 1], nfl: [1, 2], cbb: [11, 4] }[league];
  const within = ([a, b]: number[]) => (a <= b ? m >= a && m <= b : m >= a || m <= b);
  return within(heart) ? 2 : within(ends) ? 1 : 0;
}

/**
 * The team someone asked for, or null. The best fit wins (the full name,
 * then the place, then the nickname, then the abbreviation); among equals,
 * the family's own team, then the league whose season is on, then the team ESPN has
 * known longest (the lowest id: usually the bigger program).
 */
export function resolveTeam(
  q: string,
  lists: TeamEntry[],
  family: readonly Team[],
  now: Date,
): Team | null {
  if (!TEAM_QUERY.test(q)) return null;
  const { leagues, team } = parseQuery(q);
  if (!team) return null;
  const mine = (t: TeamEntry) => family.some((f) => f.league === t.league && f.id === t.id);
  const best = lists
    .filter((t) => leagues.includes(t.league))
    .map((t) => ({ t, score: fit(t, team) }))
    .filter((x) => x.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(mine(b.t)) - Number(mine(a.t)) ||
        seasonOf(b.t.league, now) - seasonOf(a.t.league, now) ||
        Number(a.t.id) - Number(b.t.id),
    )[0];
  return best ? { league: best.t.league, id: best.t.id } : null;
}

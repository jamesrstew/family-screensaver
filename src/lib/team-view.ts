// One team's page: its name, record and rank, a game under way, its last
// few results, and its next games. Pure; built from the team's schedules
// (sports.ts fetches them).

import { curly, readEvents } from "./games";
import type { Game, League, Side, TeamView } from "./types";

/** Results shown, and games ahead. */
export const RESULTS = 3;
export const AHEAD = 6;

type Json = Record<string, unknown>;
const obj = (x: unknown): Json => (x && typeof x === "object" ? (x as Json) : {});
const str = (x: unknown): string | undefined => (typeof x === "string" && x ? x : undefined);

/** The team's side in a game, and the other one. */
export function sides(g: Game, id: string): { us: Side; them: Side; home: boolean } {
  const home = g.home.id === id;
  return { us: home ? g.home : g.away, them: home ? g.away : g.home, home };
}

/** Who a schedule belongs to, as ESPN describes them there. */
export type TeamInfo = {
  id: string;
  name: string;
  /** "Kentucky" and "Wildcats". */
  place?: string;
  nick?: string;
  record?: string;
};

/** A team's schedule (ESPN's `teams/{id}/schedule`): the team, and its games. */
export function readSchedule(
  json: unknown,
  league: League,
): { team: TeamInfo | null; games: Game[] } {
  const t = obj(obj(json).team);
  const id = str(t.id);
  const said = str(t.displayName);
  const name = said && curly(said);
  const team =
    id && name
      ? {
          id,
          name,
          ...(str(t.location) ? { place: curly(str(t.location)!) } : {}),
          ...(str(t.name) ? { nick: curly(str(t.name)!) } : {}),
          ...(str(t.recordSummary) ? { record: str(t.recordSummary) } : {}),
        }
      : null;
  return { team, games: readEvents(json, league) };
}

/**
 * The page from the team's schedules (regular season and postseason). Null
 * if none of them names the team.
 */
export function teamView(
  schedules: Array<{ team: TeamInfo | null; games: Game[]; postseason?: boolean }>,
  league: League,
  id: string,
  now: Date,
): TeamView | null {
  const info = schedules.map((s) => s.team).find((t) => t?.id === id);
  if (!info) return null;
  // The record is the regular season's (the postseason's is its own short count).
  const record = schedules.find((s) => !s.postseason && s.team?.id === id)?.team?.record;
  const seen = new Set<string>();
  const games = schedules
    .flatMap((s) => s.games)
    .filter((g) => (g.home.id === id || g.away.id === id) && !seen.has(g.id) && seen.add(g.id))
    .sort((a, b) => a.start.localeCompare(b.start));
  const t = now.getTime();
  const live = games.find((g) => g.state === "in") ?? null;
  // A game ESPN still calls "to come" hours after its start is a stale entry, not the future.
  const ahead = games
    .filter((g) => g.state === "pre" && Date.parse(g.start) > t - 6 * 3_600_000)
    .slice(0, AHEAD);
  const results = games.filter((g) => g.state === "post").slice(-RESULTS);
  // The rank as of their latest game (a poll moves weekly).
  const rank = [live, ahead[0], results.at(-1)]
    .flatMap((g) => (g ? [sides(g, id).us.rank] : []))
    .find((r) => r !== undefined);
  return {
    league,
    id,
    name: info.name,
    // As the lines name teams: the NFL by nickname, colleges by place.
    short: (league === "nfl" ? info.nick : info.place) ?? info.name,
    ...(record ? { record } : {}),
    ...(rank ? { rank } : {}),
    live,
    results,
    ahead,
    at: now.toISOString(),
  };
}

/** "W 31–17" or "L 14–20", the team's score first; under way, just the score. */
export function resultWord(g: Game, id: string): string {
  const { us, them } = sides(g, id);
  if (us.score === undefined || them.score === undefined) return g.period ?? "";
  if (g.state !== "post") {
    const word = us.score > them.score ? "leads" : us.score < them.score ? "trails" : "tied";
    return `${word} ${us.score}\u2013${them.score}`;
  }
  const mark = us.score > them.score ? "W" : us.score < them.score ? "L" : "T";
  return `${mark} ${us.score}–${them.score}`;
}

// Made-up games for design review (?games=busy|quiet|none in dev), set
// around a given moment: a busy Saturday afternoon (a final from last night,
// two games under way, the evening's slate, an NFL game tomorrow), and a
// quiet weekday with one game. Real teams; invented times, scores, and
// chances.
// The "family's teams" here are stand-ins, not the family's (those are in env).

import { withTeams, type Team } from "./games";
import type { Game, League, Side, TeamView } from "./types";

/** Stand-in teams: Iowa football, Gonzaga basketball, the Chicago Bears. */
export const FIXTURE_TEAMS: Team[] = [
  { league: "cfb", id: "2294" },
  { league: "cbb", id: "2250" },
  { league: "nfl", id: "3" },
];

export const FAKE_SLATES = ["busy", "quiet", "none"] as const;
export type FakeSlate = (typeof FAKE_SLATES)[number];

const HOUR = 3_600_000;

type Spec = [
  league: League,
  hours: number,
  away: [id: string, name: string, rank?: number, score?: number, chance?: number],
  home: [id: string, name: string, rank?: number, score?: number, chance?: number],
  tv: string,
  state?: Game["state"],
  period?: string,
];

const SLATES: Record<FakeSlate, Spec[]> = {
  busy: [
    [
      "cfb",
      -16,
      ["2294", "Iowa", 15, 27],
      ["275", "Wisconsin", undefined, 20],
      "Fox",
      "post",
      "Final",
    ],
    [
      "cfb",
      -1.5,
      ["252", "BYU", 10, 24],
      ["2305", "Kansas", undefined, 20],
      "ABC",
      "in",
      "4th qtr.",
    ],
    [
      "cfb",
      -0.5,
      ["194", "Ohio State", 14, 14],
      ["158", "Nebraska", undefined, 10],
      "Fox",
      "in",
      "Halftime",
    ],
    [
      "cfb",
      0.5,
      ["2", "Auburn", undefined, undefined, 39],
      ["333", "Alabama", 3, undefined, 61],
      "CBS",
    ],
    [
      "cfb",
      1,
      ["99", "LSU", undefined, undefined, 50],
      ["2633", "Tennessee", 9, undefined, 50],
      "ABC",
    ],
    [
      "cfb",
      1,
      ["26", "UCLA", 4, undefined, 53],
      ["130", "Michigan", undefined, undefined, 47],
      "CBS",
    ],
    [
      "cbb",
      2,
      ["2250", "Gonzaga", 12, undefined, 64],
      ["2229", "Florida State", undefined, undefined, 36],
      "ESPN2",
    ],
    [
      "cfb",
      4.5,
      ["2306", "Kansas State", 19, undefined, 75],
      ["239", "Baylor", undefined, undefined, 25],
      "FS1",
    ],
    [
      "cfb",
      5,
      ["61", "Georgia", 1, undefined, 87],
      ["2579", "South Carolina", 21, undefined, 13],
      "ABC",
    ],
    [
      "cfb",
      5,
      ["2567", "SMU", undefined, undefined, 25],
      ["87", "Notre Dame", 6, undefined, 75],
      "NBC",
    ],
    [
      "cfb",
      6.5,
      ["254", "Utah", 2, undefined, 73],
      ["2628", "TCU", undefined, undefined, 27],
      "Fox",
    ],
    [
      "cbb",
      8.5,
      ["2724", "Washington State", undefined, undefined, 18],
      ["150", "Duke", 5, undefined, 82],
      "ESPN2",
    ],
    [
      "nfl",
      28.5,
      ["9", "Packers", undefined, undefined, 37],
      ["3", "Bears", undefined, undefined, 63],
      "NBC",
    ],
  ],
  quiet: [
    [
      "cbb",
      7,
      ["2439", "Nevada", undefined, undefined, 22],
      ["2250", "Gonzaga", 12, undefined, 78],
      "ESPN+",
    ],
  ],
  none: [],
};

/** The slate, built around `now`: kickoffs on the half hour. */
export function fakeGames(slate: FakeSlate, now: Date): Game[] {
  const t0 = Math.round(now.getTime() / (HOUR / 2)) * (HOUR / 2);
  const games = SLATES[slate].map(([league, hours, away, home, tv, state = "pre", period], i) => {
    const side = ([id, name, rank, score, chance]: Spec[2]): Side => ({
      id,
      name,
      short: name,
      ...(rank ? { rank } : {}),
      ...(score !== undefined ? { score } : {}),
      ...(chance !== undefined && state === "pre" ? { chance } : {}),
    });
    return {
      id: `fake-${i}`,
      league,
      start: new Date(t0 + hours * HOUR).toISOString(),
      timed: true,
      state,
      ...(period ? { period } : {}),
      neutral: false,
      tv,
      away: side(away),
      home: side(home),
    };
  });
  return withTeams(games, FIXTURE_TEAMS);
}

// ---- One team's page, made up (?team=season|live|off in dev): a stand-in
// basketball team mid-season, the same with a game under way, and the same
// after its season.

export const FAKE_TEAMS = ["season", "live", "off"] as const;
export type FakeTeam = (typeof FAKE_TEAMS)[number];

export function fakeTeam(kind: FakeTeam, now: Date): TeamView {
  const DAY = 24 * HOUR;
  // Evening tip-offs: 3 a.m. UTC is 7 p.m. on the West Coast, 10 on the East.
  const t0 = Math.floor(now.getTime() / DAY) * DAY + 3 * HOUR;
  const us = (score?: number, chance?: number): Side => ({
    id: "2250",
    name: "Gonzaga",
    short: "Gonzaga",
    rank: 12,
    mine: true,
    ...(score !== undefined ? { score } : {}),
    ...(chance !== undefined ? { chance } : {}),
  });
  const them = (
    id: string,
    name: string,
    rank?: number,
    score?: number,
    chance?: number,
  ): Side => ({
    id,
    name,
    short: name,
    ...(rank ? { rank } : {}),
    ...(score !== undefined ? { score } : {}),
    ...(chance !== undefined ? { chance } : {}),
  });
  const game = (
    i: number,
    at: number,
    home: boolean,
    other: Side,
    mine: Side,
    tv: string,
    state: Game["state"] = "pre",
    period?: string,
  ): Game => ({
    id: `team-${i}`,
    league: "cbb",
    start: new Date(t0 + at).toISOString(),
    timed: true,
    state,
    ...(period ? { period } : {}),
    neutral: false,
    tv,
    home: home ? mine : other,
    away: home ? other : mine,
  });
  const results = [
    game(
      1,
      -9 * DAY,
      true,
      them("2439", "Nevada", undefined, 61),
      us(78),
      "ESPN+",
      "post",
      "Final",
    ),
    game(2, -5 * DAY, false, them("41", "UConn", 3, 74), us(70), "Fox", "post", "Final"),
    game(
      3,
      -2 * DAY,
      true,
      them("2608", "Saint Mary’s", undefined, 66),
      us(81),
      "ESPN2",
      "post",
      "Final",
    ),
  ];
  const ahead = [
    game(
      4,
      2 * DAY,
      true,
      them("2541", "Santa Clara", undefined, undefined, 18),
      us(undefined, 82),
      "ESPNU",
    ),
    game(5, 5 * DAY, false, them("150", "Duke", 5, undefined, 58), us(undefined, 42), "ESPN"),
    game(
      6,
      8 * DAY,
      true,
      them("2492", "Pepperdine", undefined, undefined, 9),
      us(undefined, 91),
      "ESPN+",
    ),
    game(
      7,
      12 * DAY,
      false,
      them("2539", "San Francisco", undefined, undefined, 30),
      us(undefined, 70),
      "CBS",
    ),
    game(
      8,
      15 * DAY,
      true,
      them("2440", "Loyola Marymount", undefined, undefined, 12),
      us(undefined, 88),
      "ESPN+",
    ),
    game(
      9,
      19 * DAY,
      false,
      them("2350", "Portland", undefined, undefined, 50),
      us(undefined, 50),
      "ESPNU",
    ),
  ];
  const live = game(
    10,
    now.getTime() - HOUR - t0,
    true,
    them("279", "Pacific", undefined, 31),
    us(44),
    "ESPN2",
    "in",
    "2nd half",
  );
  return {
    league: "cbb",
    id: "2250",
    name: "Gonzaga Bulldogs",
    short: "Gonzaga",
    record: kind === "off" ? "27-7" : "9-2",
    rank: kind === "off" ? undefined : 12,
    live: kind === "live" ? live : null,
    results: kind === "live" ? results.slice(1) : results,
    ahead: kind === "off" ? [] : ahead,
    at: now.toISOString(),
  };
}

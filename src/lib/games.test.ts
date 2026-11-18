import { describe, expect, it } from "vitest";
import {
  LEAF_MS,
  chanceOf,
  channel,
  curate,
  dayLabel,
  freshGames,
  gamesCue,
  nightGame,
  slideGames,
  standing,
  periodOf,
  leafAt,
  leavesOf,
  marketChance,
  readMarkets,
  teamsFrom,
  withTeams,
  readChance,
  readEvents,
  trim,
  whenWord,
  withChance,
} from "./games";
import type { Game } from "./types";

const TZ = "America/Los_Angeles";
// Wednesday, Nov. 18, 2026, 10 a.m. Pacific.
const NOW = new Date("2026-11-18T18:00:00Z");

// ESPN's shapes, cut down to what's read. A scoreboard's event:
const board = (o: {
  id: string;
  date: string;
  away: [string, string, number?, string?];
  home: [string, string, number?, string?];
  state?: string;
  name?: string;
  period?: number;
  tv?: string;
  timeValid?: boolean;
}) => ({
  id: o.id,
  date: o.date,
  status: {
    period: o.period ?? 0,
    type: { state: o.state ?? "pre", name: o.name ?? "STATUS_SCHEDULED" },
  },
  competitions: [
    {
      timeValid: o.timeValid ?? true,
      neutralSite: false,
      broadcasts: o.tv ? [{ market: "national", names: [o.tv] }] : [],
      competitors: (["home", "away"] as const).map((side) => {
        const [id, location, rank, score] = o[side];
        return {
          homeAway: side,
          curatedRank: { current: rank ?? 99 },
          ...(score !== undefined ? { score } : {}),
          team: { id, location, name: location, shortDisplayName: location },
        };
      }),
    },
  ],
});

describe("readEvents", () => {
  it("reads a scoreboard: ranks, channel, time", () => {
    const [g] = readEvents(
      {
        events: [
          board({
            id: "1",
            date: "2026-11-21T20:30Z",
            away: ["26", "UCLA", 4],
            home: ["130", "Michigan"],
            tv: "ESPN/Disney+",
          }),
        ],
      },
      "cfb",
    );
    expect(g).toMatchObject({
      id: "1",
      start: "2026-11-21T20:30:00.000Z",
      state: "pre",
      timed: true,
      tv: "ESPN",
      away: { name: "UCLA", rank: 4 },
      home: { name: "Michigan" },
    });
    // 99 is ESPN's "unranked".
    expect(g.home.rank).toBeUndefined();
    expect(g.period).toBeUndefined();
  });

  it("reads a team's schedule: the channel as media, the score as an object", () => {
    const [g] = readEvents(
      {
        events: [
          {
            id: "2",
            date: "2026-11-15T21:25Z",
            competitions: [
              {
                status: { period: 4, type: { state: "post", name: "STATUS_FINAL" } },
                broadcasts: [{ media: { shortName: "Fox" } }],
                competitors: [
                  {
                    homeAway: "home",
                    score: { value: 46, displayValue: "46" },
                    team: { id: "6", location: "Dallas", name: "Cowboys" },
                  },
                  {
                    homeAway: "away",
                    score: { value: 40, displayValue: "40" },
                    team: { id: "3", location: "Chicago", name: "Bears" },
                  },
                ],
              },
            ],
          },
        ],
      },
      "nfl",
    );
    expect(g).toMatchObject({
      state: "post",
      period: "Final",
      tv: "Fox",
      away: { name: "Bears", score: 40 },
      home: { name: "Cowboys", score: 46 },
    });
  });

  it("says where a live game stands, never its clock", () => {
    const games = readEvents(
      {
        events: [
          board({
            id: "3",
            date: "2026-11-21T17:00Z",
            away: ["1", "A"],
            home: ["2", "B"],
            state: "in",
            period: 3,
          }),
          board({
            id: "4",
            date: "2026-11-21T17:00Z",
            away: ["1", "A"],
            home: ["2", "B"],
            state: "in",
            period: 2,
            name: "STATUS_HALFTIME",
          }),
        ],
      },
      "cfb",
    );
    expect(games.map((g) => g.period)).toEqual(["3rd qtr.", "Halftime"]);
    const [hoops] = readEvents(
      {
        events: [
          board({
            id: "5",
            date: "2026-11-21T17:00Z",
            away: ["1", "A"],
            home: ["2", "B"],
            state: "in",
            period: 2,
          }),
        ],
      },
      "cbb",
    );
    expect(hoops.period).toBe("2nd half");
  });

  it("leaves out postponed games and anything malformed", () => {
    const games = readEvents(
      {
        events: [
          board({
            id: "6",
            date: "2026-11-21T17:00Z",
            away: ["1", "A"],
            home: ["2", "B"],
            name: "STATUS_POSTPONED",
          }),
          { id: "7", date: "not a date", competitions: [] },
          null,
          board({ id: "8", date: "2026-11-21T17:00Z", away: ["1", "A"], home: ["2", "B"] }),
        ],
      },
      "cfb",
    );
    expect(games.map((g) => g.id)).toEqual(["8"]);
    expect(readEvents({}, "cfb")).toEqual([]);
    expect(readEvents("nonsense", "cfb")).toEqual([]);
  });

  it("marks a kickoff not yet set", () => {
    const [g] = readEvents(
      {
        events: [
          board({
            id: "9",
            date: "2026-11-28T05:00Z",
            away: ["1", "A"],
            home: ["2", "B"],
            timeValid: false,
          }),
        ],
      },
      "cfb",
    );
    expect(whenWord(g, TZ)).toBe("TBA");
  });
});

describe("channel", () => {
  it("writes channels plainly", () => {
    expect(channel("BTN")).toBe("BTN");
    expect(channel("SECN+")).toBe("ESPN+");
    expect(channel("USA Net")).toBe("USA");
    expect(channel("Fox")).toBe("Fox");
  });
});

describe("readChance", () => {
  it("reads the core API's predictor, team ids from their links", () => {
    const json = {
      homeTeam: {
        team: {
          $ref: "http://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2026/teams/9?lang=en",
        },
        statistics: [{ name: "gameProjection", value: 63.095 }],
      },
      awayTeam: {
        team: {
          $ref: "http://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2026/teams/16?lang=en",
        },
        statistics: [{ name: "gameProjection", value: 36.611 }],
      },
    };
    expect(readChance(json)).toEqual({ "9": 63.095, "16": 36.611 });
  });

  it("reads the summary's predictor", () => {
    expect(
      readChance({
        homeTeam: { id: "2305", gameProjection: "29" },
        awayTeam: { id: "252", gameProjection: "71" },
      }),
    ).toEqual({ "2305": 29, "252": 71 });
  });

  it("is null when it isn't there", () => {
    expect(readChance({})).toBeNull();
    expect(readChance({ homeTeam: { id: "1" }, awayTeam: { id: "2" } })).toBeNull();
  });
});

// ---- Choosing and laying out, from games as the TV holds them.

let n = 0;
function game(
  start: string,
  away: Partial<Game["away"]>,
  home: Partial<Game["home"]>,
  more: Partial<Game> = {},
): Game {
  n++;
  return {
    id: `g${n}`,
    league: "cfb",
    start,
    timed: true,
    state: "pre",
    neutral: false,
    away: { id: `a${n}`, name: `Away ${n}`, short: `Away ${n}`, ...away },
    home: { id: `h${n}`, name: `Home ${n}`, short: `Home ${n}`, ...home },
    ...more,
  };
}

describe("curate", () => {
  it("keeps the Top 25's games in the next few days, and none unranked", () => {
    const sat = game("2026-11-21T20:30:00Z", { rank: 4 }, {});
    const nextWeek = game("2026-11-28T20:30:00Z", { rank: 1 }, {});
    const unranked = game("2026-11-21T20:30:00Z", {}, {});
    expect(curate([sat, nextWeek, unranked], NOW, TZ)).toEqual([sat]);
  });

  it("keeps the family's next game through the week, but only the next", () => {
    const ours = { id: "3", mine: true };
    const sun = game("2026-11-23T01:20:00Z", {}, ours, { league: "nfl" });
    const after = game("2026-11-29T21:25:00Z", {}, ours, { league: "nfl" });
    expect(curate([after, sun], NOW, TZ)).toEqual([sun]);
  });

  it("keeps a family final for a while, and lets other finals go", () => {
    const ours = game(
      "2026-11-18T03:00:00Z",
      { id: "2294", mine: true, score: 31 },
      { score: 17 },
      { state: "post" },
    );
    const old = game("2026-11-16T03:00:00Z", { id: "2294", mine: true }, {}, { state: "post" });
    const ranked = game("2026-11-18T17:00:00Z", { rank: 3 }, {}, { state: "post" });
    expect(curate([ours, old, ranked], NOW, TZ)).toEqual([ours]);
  });

  it("leaves out a game still to come hours after its start", () => {
    const stale = game("2026-11-17T20:00:00Z", { rank: 4 }, {});
    expect(curate([stale], NOW, TZ)).toEqual([]);
  });

  it("lists one game once, wherever it came from", () => {
    const a = game("2026-11-21T20:30:00Z", { rank: 4 }, {});
    const b = { ...a, tv: "CBS" };
    expect(curate([a, b], NOW, TZ)).toEqual([{ ...a, tv: "CBS" }]);
  });

  it("caps the Top 25, best games first, the family's always", () => {
    const ranked = Array.from({ length: 30 }, (_, i) =>
      game("2026-11-21T20:30:00Z", { rank: (i % 25) + 1 }, {}),
    );
    const top = game("2026-11-21T20:30:00Z", { rank: 1 }, { rank: 2 });
    const ours = game("2026-11-22T00:00:00Z", { id: "2250", mine: true }, {});
    const got = curate([...ranked, top, ours], NOW, TZ, 5);
    expect(got).toHaveLength(5);
    expect(got).toContain(top);
    expect(got).toContain(ours);
  });
});

describe("trim", () => {
  it("leaves out foregone conclusions, unless they're ours", () => {
    // No predictor yet: kept.
    const unknown = withChance(game("2026-11-21T19:00:00Z", {}, { rank: 3 }), { x: 2 });
    const r = game("2026-11-21T19:00:00Z", { chance: 3 }, { rank: 3, chance: 97 });
    const ours = game("2026-11-21T19:00:00Z", { chance: 4, mine: true }, { chance: 96 });
    const close = game("2026-11-21T19:00:00Z", { chance: 45 }, { rank: 9, chance: 55 });
    // At the same hour, the family's game is listed first.
    expect(trim([unknown, r, ours, close])).toEqual([ours, unknown, close]);
  });
});

describe("chanceOf", () => {
  it("names the favorite, or the family's team even as the underdog", () => {
    const g = game(
      "2026-11-21T19:00:00Z",
      { chance: 37, name: "Vikings" },
      { chance: 63, name: "Bears" },
    );
    expect(chanceOf(g)).toMatchObject({ side: { name: "Bears" }, pct: 63 });
    const under = game(
      "2026-11-21T19:00:00Z",
      { chance: 37, mine: true, name: "Gonzaga" },
      { chance: 63 },
    );
    expect(chanceOf(under)).toMatchObject({ side: { name: "Gonzaga" }, pct: 37 });
    expect(chanceOf(game("2026-11-21T19:00:00Z", {}, {}))).toBeNull();
  });
});

describe("leavesOf", () => {
  const at = (iso: string) => game(iso, {}, {});
  it("heads each day with its name", () => {
    const [leaf] = leavesOf([at("2026-11-18T21:00:00Z"), at("2026-11-21T20:30:00Z")], NOW, TZ, 10);
    expect(leaf.map((l) => (l.kind === "day" ? l.label : "game"))).toEqual([
      "Today",
      "game",
      "Saturday",
      "game",
    ]);
  });

  it("never leaves a day's name alone at the foot, and names it again over the page", () => {
    const games = [
      at("2026-11-19T21:00:00Z"),
      at("2026-11-19T22:00:00Z"),
      at("2026-11-21T20:30:00Z"),
      at("2026-11-21T21:30:00Z"),
    ];
    const leaves = leavesOf(games, NOW, TZ, 4).map((leaf) =>
      leaf.map((l) => (l.kind === "day" ? l.label : "game")),
    );
    expect(leaves).toEqual([
      ["Tomorrow", "game", "game"],
      ["Saturday", "game", "game"],
    ]);
    const long = leavesOf(games.slice(2).concat(at("2026-11-21T23:00:00Z")), NOW, TZ, 3);
    expect(long.map((leaf) => leaf[0])).toMatchObject([
      { label: "Saturday" },
      { label: "Saturday" },
    ]);
  });
});

describe("dayLabel", () => {
  it("names the days near today plainly, the rest by weekday", () => {
    expect(dayLabel("2026-11-17", NOW, TZ)).toBe("Yesterday");
    expect(dayLabel("2026-11-18", NOW, TZ)).toBe("Today");
    expect(dayLabel("2026-11-19", NOW, TZ)).toBe("Tomorrow");
    expect(dayLabel("2026-11-21", NOW, TZ)).toBe("Saturday");
  });
});

describe("leafAt", () => {
  it("turns every half minute, round and round", () => {
    expect(leafAt(0, 0, 1)).toBe(0);
    expect(leafAt(LEAF_MS - 1, 0, 3)).toBe(0);
    expect(leafAt(LEAF_MS, 0, 3)).toBe(1);
    expect(leafAt(3 * LEAF_MS, 0, 3)).toBe(0);
  });
});

// Kalshi's markets, cut down to what's read: one per team, both in one event.
const kalshi = (
  event: string,
  teams: Array<[code: string, name: string, bid: number, ask: number, volume: number]>,
) =>
  teams.map(([code, name, bid, ask, volume]) => ({
    ticker: `${event}-${code}`,
    event_ticker: event,
    yes_sub_title: name,
    yes_bid_dollars: bid.toFixed(4),
    yes_ask_dollars: ask.toFixed(4),
    volume_fp: volume.toFixed(2),
  }));

describe("the markets", () => {
  const gb = game(
    "2026-11-23T01:20:00Z",
    { id: "16", name: "Vikings", abbr: "MIN", place: "Minnesota" },
    { id: "9", name: "Packers", abbr: "GB", place: "Green Bay" },
    { league: "nfl" },
  );
  const ESPN_DAY = "2026-11-22"; // Eastern

  it("reads Kalshi's markets: the date from the ticker, the team's code and name", () => {
    const [m] = readMarkets({
      markets: kalshi("KXNFLGAME-26NOV22MINGB", [["GB", "Green Bay", 0.61, 0.62, 999_917]]),
    });
    expect(m).toEqual({
      event: "KXNFLGAME-26NOV22MINGB",
      day: "2026-11-22",
      code: "GB",
      name: "Green Bay",
      bid: 0.61,
      ask: 0.62,
      volume: 999_917,
    });
    expect(readMarkets({ markets: [{ ticker: "X" }, null] })).toEqual([]);
    expect(readMarkets("nonsense")).toEqual([]);
  });

  it("prices a liquid game, the market's margin taken out", () => {
    const book = readMarkets({
      markets: kalshi("KXNFLGAME-26NOV22MINGB", [
        ["GB", "Green Bay", 0.62, 0.63, 999_917],
        ["MIN", "Minnesota", 0.38, 0.39, 999_917],
      ]),
    });
    const p = marketChance(gb, book, ESPN_DAY)!;
    expect(Math.round(p["9"])).toBe(62);
    expect(p["9"] + p["16"]).toBeCloseTo(100);
  });

  it("finds a team by name when the codes differ (Ohio St., Texas A&M)", () => {
    const g = game(
      "2026-11-21T17:00:00Z",
      { id: "194", name: "Ohio State", abbr: "OSU", place: "Ohio State" },
      { id: "245", name: "Texas A&M", abbr: "TA&M", place: "Texas A&M" },
    );
    const book = readMarkets({
      markets: kalshi("KXNCAAFGAME-26NOV21OSUTXAM", [
        ["OSU", "Ohio St.", 0.6, 0.62, 40_000],
        ["TXAM", "Texas A&M", 0.38, 0.4, 40_000],
      ]),
    });
    expect(marketChance(g, book, "2026-11-21")).not.toBeNull();
  });

  it("passes over a thin market, a wide one, and another day's game", () => {
    const thin = readMarkets({
      markets: kalshi("KXNFLGAME-26NOV22MINGB", [
        ["GB", "Green Bay", 0.6, 0.62, 4000],
        ["MIN", "Minnesota", 0.38, 0.4, 4000],
      ]),
    });
    expect(marketChance(gb, thin, ESPN_DAY)).toBeNull();
    const wide = readMarkets({
      markets: kalshi("KXNFLGAME-26NOV22MINGB", [
        ["GB", "Green Bay", 0.5, 0.7, 50_000],
        ["MIN", "Minnesota", 0.3, 0.5, 50_000],
      ]),
    });
    expect(marketChance(gb, wide, ESPN_DAY)).toBeNull();
    const rematch = readMarkets({
      markets: kalshi("KXNFLGAME-27JAN10MINGB", [
        ["GB", "Green Bay", 0.6, 0.61, 50_000],
        ["MIN", "Minnesota", 0.39, 0.4, 50_000],
      ]),
    });
    expect(marketChance(gb, rematch, ESPN_DAY)).toBeNull();
  });
});

describe("the family's teams", () => {
  it("reads FAMILY_TEAMS: league:id pairs, the malformed skipped", () => {
    expect(teamsFrom("cfb:2294, MBB:2250,nfl:3")).toEqual([
      { league: "cfb", id: "2294" },
      { league: "cbb", id: "2250" },
      { league: "nfl", id: "3" },
    ]);
    expect(teamsFrom("nba:1,cfb:,:3,cfb:abc")).toEqual([]);
    expect(teamsFrom(undefined)).toEqual([]);
  });

  it("marks their sides, in their own league only", () => {
    const g = game("2026-11-21T17:00:00Z", { id: "3" }, { id: "9" }, { league: "nfl" });
    const [marked] = withTeams([g], [{ league: "nfl", id: "3" }]);
    expect(marked.away.mine).toBe(true);
    expect(marked.home.mine).toBeUndefined();
    // The same id in another league is another team.
    expect(withTeams([g], [{ league: "cfb", id: "3" }])[0].away.mine).toBeUndefined();
  });
});

describe("where a game stands", () => {
  it("says a delayed or suspended game is delayed, and still lists it", () => {
    const games = readEvents(
      {
        events: [
          board({
            id: "20",
            date: "2026-11-21T17:00Z",
            away: ["1", "A"],
            home: ["2", "B"],
            state: "in",
            period: 3,
            name: "STATUS_DELAYED",
          }),
          board({
            id: "21",
            date: "2026-11-21T17:00Z",
            away: ["1", "A"],
            home: ["2", "B"],
            state: "in",
            period: 2,
            name: "STATUS_SUSPENDED",
          }),
          board({
            id: "22",
            date: "2026-11-21T17:00Z",
            away: ["1", "A"],
            home: ["2", "B"],
            name: "STATUS_DELAYED",
          }),
          board({
            id: "23",
            date: "2026-11-21T17:00Z",
            away: ["1", "A"],
            home: ["2", "B"],
            name: "STATUS_CANCELED",
          }),
        ],
      },
      "cfb",
    );
    expect(games.map((g) => [g.id, whenWord(g, TZ)])).toEqual([
      ["20", "Delayed"],
      ["21", "Delayed"],
      ["22", "Delayed"],
    ]);
  });

  it("knows the end of regulation and overtime from halftime", () => {
    expect(periodOf("cbb", "in", 1, "STATUS_END_PERIOD")).toBe("Halftime");
    expect(periodOf("cbb", "in", 2, "STATUS_END_PERIOD")).toBe("End of regulation");
    expect(periodOf("cbb", "in", 3, "STATUS_END_PERIOD")).toBe("End of overtime");
    expect(periodOf("cbb", "in", 3)).toBe("Overtime");
    expect(periodOf("cbb", "post", 3)).toBe("Final, OT");
    expect(periodOf("nfl", "in", 1, "STATUS_END_PERIOD")).toBe("End of 1st qtr.");
    expect(periodOf("nfl", "in", 2, "STATUS_END_PERIOD")).toBe("Halftime");
    expect(periodOf("nfl", "in", 4, "STATUS_END_PERIOD")).toBe("End of regulation");
    expect(periodOf("nfl", "in", 5)).toBe("Overtime");
    expect(periodOf("nfl", "post", 4)).toBe("Final");
  });
});

describe("days", () => {
  it("names the days before yesterday by weekday", () => {
    expect(dayLabel("2026-11-16", NOW, TZ)).toBe("Monday");
  });

  it("puts a late Pacific game on its own evening, though it's past midnight in UTC", () => {
    // 7:30 p.m. Saturday in Los Angeles is 3:30 a.m. Sunday, UTC.
    const late = game("2026-11-22T03:30:00Z", { rank: 2 }, {});
    const [leaf] = leavesOf([late], NOW, TZ, 10);
    expect(leaf[0]).toMatchObject({ kind: "day", label: "Saturday" });
    expect(whenWord(late, TZ)).toBe("7:30 p.m.");
    expect(curate([late], NOW, TZ)).toEqual([late]);
  });
});

describe("the markets, when they mislead", () => {
  const g = game(
    "2026-11-22T01:00:00Z",
    { id: "9", name: "Packers", abbr: "GB", place: "Green Bay" },
    { id: "16", name: "Vikings", abbr: "MIN", place: "Minnesota" },
    { league: "nfl" },
  );

  it("looks past a thin event to the liquid one", () => {
    const book = readMarkets({
      markets: [
        ...kalshi("KXNFLGAME-26NOV21GBMIN", [
          ["GB", "Green Bay", 0.4, 0.45, 100],
          ["MIN", "Minnesota", 0.55, 0.6, 100],
        ]),
        ...kalshi("KXNFLGAME-26NOV22GBMIN", [
          ["GB", "Green Bay", 0.3, 0.31, 50_000],
          ["MIN", "Minnesota", 0.69, 0.7, 50_000],
        ]),
      ],
    });
    expect(Math.round(marketChance(g, book, "2026-11-21")!["9"])).toBe(31);
  });

  it("never reads one team's market as both, and trusts a name over a code", () => {
    // Two teams Kalshi writes alike: only one market can stand for each.
    const same = readMarkets({
      markets: kalshi("KXNFLGAME-26NOV22GBMIN", [
        ["MIN", "Minnesota", 0.6, 0.61, 50_000],
        ["MIN", "Green Bay", 0.39, 0.4, 50_000],
      ]),
    });
    expect(marketChance(g, same, "2026-11-21")).toBeNull();
    // A code that names the other team: the name decides.
    const swapped = readMarkets({
      markets: kalshi("KXNFLGAME-26NOV22GBMIN", [
        ["MIN", "Green Bay", 0.3, 0.31, 50_000],
        ["GB", "Minnesota", 0.69, 0.7, 50_000],
      ]),
    });
    expect(Math.round(marketChance(g, swapped, "2026-11-21")!["9"])).toBe(31);
  });
});

describe("freshGames", () => {
  const at = NOW.toISOString();
  const soon = game("2026-11-18T21:00:00Z", { rank: 1 }, {});
  it("retires the whole list when it's old", () => {
    expect(freshGames({ games: [soon], gamesAt: at }, NOW)).toEqual([soon]);
    expect(
      freshGames({ games: [soon], gamesAt: at }, new Date(NOW.getTime() + 31 * 60_000)),
    ).toBeNull();
    expect(freshGames({ games: [soon] }, NOW)).toBeNull();
    expect(freshGames({ games: null, gamesAt: at }, NOW)).toBeNull();
  });

  it("drops a game long past, however it was kept", () => {
    const stuck = game("2026-11-18T10:00:00Z", { rank: 1 }, {}, { state: "in" });
    const final = game("2026-11-17T12:00:00Z", { mine: true }, {}, { state: "post" });
    const lastNight = game("2026-11-18T04:00:00Z", { mine: true }, {}, { state: "post" });
    expect(freshGames({ games: [stuck, final, lastNight, soon], gamesAt: at }, NOW)).toEqual([
      lastNight,
      soon,
    ]);
  });
});

describe("the games on home", () => {
  it("knows when there's anything within the few days, and a family game today", () => {
    const sat = game("2026-11-21T20:30:00Z", { rank: 4 }, {});
    const nextWeek = game("2026-11-26T20:30:00Z", { mine: true }, {});
    const tonight = game("2026-11-19T03:00:00Z", { mine: true }, {});
    expect(gamesCue([sat, nextWeek], NOW, TZ)).toEqual({ any: true, ours: false });
    expect(gamesCue([nextWeek], NOW, TZ)).toEqual({ any: false, ours: false });
    expect(gamesCue([sat, tonight], NOW, TZ)).toEqual({ any: true, ours: true });
    expect(gamesCue(null, NOW, TZ)).toEqual({ any: false, ours: false });
  });

  it("keeps strict time order, and leaves out what's past the few days", () => {
    const early = game("2026-11-18T20:00:00Z", { rank: 1 }, {});
    const ours = game("2026-11-19T03:00:00Z", { mine: true }, {});
    const sat = game("2026-11-21T20:30:00Z", { rank: 4 }, {});
    const nextWeek = game("2026-11-26T20:30:00Z", { mine: true }, {});
    expect(slideGames([sat, ours, early, nextWeek], NOW, TZ)).toEqual([early, ours, sat]);
  });

  it("counts a family game day only while the game is still to come or under way", () => {
    const over = game("2026-11-18T17:00:00Z", { mine: true }, {}, { state: "post" });
    expect(gamesCue([over], NOW, TZ)).toEqual({ any: true, ours: false });
  });

  it("brings the night only a family game under way or about to start", () => {
    const soon = game("2026-11-18T19:30:00Z", { mine: true }, {});
    const later = game("2026-11-18T23:00:00Z", { mine: true }, {});
    const live = game(
      "2026-11-18T17:00:00Z",
      { mine: true, short: "Bears", score: 24 },
      { score: 20 },
      { state: "in" },
    );
    const ranked = game("2026-11-18T18:30:00Z", { rank: 1 }, {});
    expect(nightGame([later, ranked], NOW)).toBeNull();
    expect(nightGame([later, soon, ranked], NOW)).toBe(soon);
    expect(nightGame([soon, live], NOW)).toBe(live);
    expect(standing(live)).toBe("Bears lead 24\u201320");
    expect(standing({ ...live, home: { ...live.home, score: 31 } })).toBe("Bears trail 24\u201331");
    expect(standing({ ...live, home: { ...live.home, score: 24 } })).toBe("Tied 24\u201324");
  });
});

describe("names", () => {
  it("sets a team's apostrophe as a true one", () => {
    const [g] = readEvents(
      {
        events: [
          board({
            id: "40",
            date: "2026-11-21T17:00Z",
            away: ["1", "Saint Mary's"],
            home: ["2", "B"],
          }),
        ],
      },
      "cbb",
    );
    expect(g.away.name).toBe("Saint Mary’s");
  });
});

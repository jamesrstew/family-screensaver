import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Outside Next: no cache (each call fetches), `after` runs at once, and the
// store is a map.
vi.mock("next/cache", () => ({ cacheLife: () => {} }));
const later: Array<Promise<unknown>> = [];
vi.mock("next/server", () => ({ after: (f: () => Promise<unknown>) => later.push(f()) }));
const kept = new Map<string, unknown>();
vi.mock("./store", () => ({
  KEYS: { games: "games" },
  store: {
    get: async (k: string) => kept.get(k) ?? null,
    set: async (k: string, v: unknown) => void kept.set(k, v),
  },
}));

const { findTeam, gather, getGames, getTeamView, teamList } = await import("./sports");

const TZ = "America/Los_Angeles";
// Wednesday, Nov. 18, 2026, 10 a.m. Pacific.
const NOW = new Date("2026-11-18T18:00:00Z");

/** One ranked game, Saturday, on the scoreboard for Nov. 21. */
const saturday = {
  events: [
    {
      id: "401",
      date: "2026-11-21T20:30Z",
      status: { type: { state: "pre", name: "STATUS_SCHEDULED" } },
      competitions: [
        {
          competitors: [
            { homeAway: "home", team: { id: "130", location: "Michigan" } },
            { homeAway: "away", curatedRank: { current: 4 }, team: { id: "26", location: "UCLA" } },
          ],
        },
      ],
    },
  ],
};

type Route = (url: string) => Promise<Response> | Response;
let asked: string[] = [];
function serve(route: Route) {
  asked = [];
  vi.stubGlobal("fetch", (url: string) => {
    asked.push(url);
    return route(url);
  });
}
const json = (body: unknown) => new Response(JSON.stringify(body));
const never = () => new Promise<Response>(() => {});

beforeEach(() => kept.clear());
afterEach(() => vi.unstubAllGlobals());

describe("gather", () => {
  it("asks for every day from yesterday to a day past the Top 25's reach", async () => {
    serve(() => json({ events: [] }));
    await gather(NOW, TZ, []);
    const days = (league: string) =>
      asked
        .filter((u) => u.includes(league) && u.includes("scoreboard"))
        .map((u) => u.match(/dates=(\d+)/)?.[1]);
    const want = ["20261117", "20261118", "20261119", "20261120", "20261121", "20261122"];
    expect(days("college-football")).toEqual(want);
    expect(days("mens-college-basketball")).toEqual(want);
    // No family teams: no schedules. The NFL's week, undated, for its own page.
    expect(asked.some((u) => u.includes("/schedule"))).toBe(false);
    expect(asked.filter((u) => u.includes("football/nfl/scoreboard"))).toEqual([
      expect.not.stringContaining("dates="),
    ]);
  });

  it("brings the NFL's slate apart: the rest never waits on it, nor fails with it", async () => {
    const sunday = {
      events: [
        {
          id: "501",
          date: "2026-11-22T21:25Z",
          status: { type: { state: "pre", name: "STATUS_SCHEDULED" } },
          competitions: [
            {
              competitors: [
                { homeAway: "home", team: { id: "7", name: "Broncos" } },
                { homeAway: "away", team: { id: "13", name: "Raiders" } },
              ],
            },
          ],
        },
      ],
    };
    serve((u) =>
      u.includes("football/nfl/scoreboard")
        ? json(sunday)
        : u.includes("dates=20261121") && u.includes("college-football")
          ? json(saturday)
          : json({ events: [], markets: [] }),
    );
    const got = await gather(NOW, TZ, []);
    expect(got.games.map((g) => g.id)).toEqual(["401"]);
    expect(got.nfl?.map((g) => g.id)).toEqual(["501"]);
    // The NFL's scoreboard down: the slate is unknown (null), the rest as ever.
    serve((u) =>
      u.includes("football/nfl/scoreboard")
        ? new Response("down", { status: 503 })
        : u.includes("dates=20261121") && u.includes("college-football")
          ? json(saturday)
          : json({ events: [], markets: [] }),
    );
    expect(await gather(NOW, TZ, [])).toMatchObject({ games: [{ id: "401" }], nfl: null });
  });

  it("asks for a family team's regular season and postseason", async () => {
    serve(() => json({ events: [] }));
    await gather(NOW, TZ, [{ league: "nfl", id: "3" }]);
    expect(asked.filter((u) => u.includes("/teams/3/schedule"))).toEqual([
      expect.stringContaining("seasontype=2"),
      expect.stringContaining("seasontype=3"),
    ]);
  });

  it("stands on whatever answered", async () => {
    serve((u) =>
      u.includes("dates=20261121") && u.includes("college-football")
        ? json(saturday)
        : new Response("down", { status: 503 }),
    );
    const { games } = await gather(NOW, TZ, []);
    expect(games.map((g) => g.id)).toEqual(["401"]);
  });

  it("throws only when nothing answered", async () => {
    serve(() => new Response("down", { status: 503 }));
    await expect(gather(NOW, TZ, [])).rejects.toThrow();
  });

  it("brings the games back without chances when the predictor is slow", async () => {
    serve((u) =>
      u.includes("predictor")
        ? never()
        : u.includes("dates=20261121") && u.includes("college-football")
          ? json(saturday)
          : json({ events: [], markets: [] }),
    );
    const began = Date.now();
    const {
      games: [g],
    } = await gather(NOW, TZ, [], 50);
    expect(Date.now() - began).toBeLessThan(1000);
    expect(g.id).toBe("401");
    expect(g.home.chance).toBeUndefined();
  });
});

describe("getGames", () => {
  const list = (at: Date) => ({ at: at.toISOString(), teams: "", games: [] });

  it("serves a list kept a moment ago, asking nothing", async () => {
    kept.set("games", list(new Date(NOW.getTime() - 60_000)));
    serve(() => json({ events: [] }));
    expect(await getGames(NOW, TZ, [])).toEqual({
      at: list(new Date(NOW.getTime() - 60_000)).at,
      games: [],
    });
    expect(asked).toEqual([]);
  });

  it("serves an older list at once, and gathers a fresh one behind it", async () => {
    const old = list(new Date(NOW.getTime() - 10 * 60_000));
    kept.set("games", old);
    serve((u) =>
      u.includes("dates=20261121") && u.includes("college-football")
        ? json(saturday)
        : json({ events: [] }),
    );
    expect((await getGames(NOW, TZ, [])).at).toBe(old.at);
    await Promise.all(later);
    expect(kept.get("games")).toMatchObject({ at: NOW.toISOString(), games: [{ id: "401" }] });
  });

  it("gathers afresh when the kept list is too old, or for other teams", async () => {
    serve(() => json({ events: [] }));
    kept.set("games", list(new Date(NOW.getTime() - 40 * 60_000)));
    expect((await getGames(NOW, TZ, [])).at).toBe(NOW.toISOString());
    // A minute old, which would do, but kept for no family teams.
    kept.set("games", list(new Date(NOW.getTime() - 60_000)));
    expect((await getGames(NOW, TZ, [{ league: "nfl", id: "3" }])).at).toBe(NOW.toISOString());
  });

  it("never serves a list dated in the future, nor overwrites a newer one", async () => {
    serve(() => json({ events: [] }));
    const ahead = list(new Date(NOW.getTime() + 10 * 60_000));
    kept.set("games", ahead);
    expect((await getGames(NOW, TZ, [])).at).toBe(NOW.toISOString());
    await Promise.all(later);
    // The newer list (another refresh's, or another clock's) stays.
    expect(kept.get("games")).toEqual(ahead);
  });

  it("keeps what it gathers, after answering", async () => {
    serve(() => json({ events: [] }));
    await getGames(NOW, TZ, []);
    await Promise.all(later);
    expect(kept.get("games")).toMatchObject({ at: NOW.toISOString(), teams: "" });
  });
});

describe("findTeam", () => {
  const list = (teams: Array<[string, string, string]>) => ({
    sports: [
      {
        leagues: [
          {
            teams: teams.map(([id, location, name]) => ({
              team: {
                id,
                location,
                name,
                displayName: `${location} ${name}`,
                shortDisplayName: location,
                abbreviation: "X",
              },
            })),
          },
        ],
      },
    ],
  });
  const aggies = (u: string) =>
    u.includes("college-football/teams?")
      ? json(
          list([
            ["911", "Texas A&M", "Aggies"],
            ["912", "New Mexico State", "Aggies"],
          ]),
        )
      : u.includes("/teams?")
        ? json(list([]))
        : u.includes("/rankings")
          ? json({ rankings: [{ ranks: [] }] })
          : u.includes("kalshi")
            ? json({
                markets: [
                  {
                    ticker: "E-26NOV21TAMX-TAM",
                    event_ticker: "KXNCAAFGAME-26NOV21TAMX",
                    yes_sub_title: "Texas A&M",
                    yes_bid_dollars: "0.5",
                    yes_ask_dollars: "0.51",
                    volume_fp: "40000",
                  },
                ],
              })
            : json({ events: [] });

  it("asks ESPN only by league, never with what was said", async () => {
    serve(aggies);
    const found = await findTeam("Aggies", [], NOW);
    expect(found).toEqual({ league: "cfb", id: "911", name: "Texas A&M Aggies" });
    expect(asked.some((u) => /aggies/i.test(u))).toBe(false);
  });

  it("finds by the Top 25 first", async () => {
    serve((u) =>
      u.includes("college-football/rankings")
        ? json({ rankings: [{ ranks: [{ team: { id: "912" } }] }] })
        : aggies(u),
    );
    expect(await findTeam("Aggies", [], NOW)).toMatchObject({ id: "912" });
  });

  it("finds nothing when nothing answers, and asks nothing for a bad query", async () => {
    serve(() => new Response("down", { status: 503 }));
    expect(await findTeam("Aggies", [], NOW)).toBeNull();
    serve(() => json({}));
    expect(await findTeam("<script>", [], NOW)).toBeNull();
    expect(asked).toEqual([]);
  });
});

describe("getTeamView", () => {
  const sched = (record: string, events: unknown[]) =>
    json({
      team: {
        id: "904",
        displayName: "Gonzaga Bulldogs",
        location: "Gonzaga",
        recordSummary: record,
      },
      events,
    });
  const game = {
    id: "501",
    date: "2026-11-21T03:00Z",
    competitions: [
      {
        status: { type: { state: "pre", name: "STATUS_SCHEDULED" } },
        competitors: [
          { homeAway: "home", team: { id: "904", location: "Gonzaga" } },
          { homeAway: "away", team: { id: "77", location: "Rival" } },
        ],
      },
    ],
  };

  it("stands on the postseason when the regular season fails, without its record", async () => {
    serve((u) =>
      u.includes("seasontype=2")
        ? new Response("down", { status: 503 })
        : u.includes("seasontype=3")
          ? sched("2-0", [game])
          : json({ markets: [] }),
    );
    const v = await getTeamView("cbb", "904", NOW, 200);
    expect(v).toMatchObject({ name: "Gonzaga Bulldogs", ahead: [{ id: "501" }] });
    expect(v?.record).toBeUndefined();
  });

  it("brings the page back without chances when the predictor is slow", async () => {
    serve((u) =>
      u.includes("predictor")
        ? never()
        : u.includes("schedule")
          ? sched("9-2", [game])
          : json({ markets: [] }),
    );
    const began = Date.now();
    const v = await getTeamView("cbb", "904", NOW, 50);
    expect(Date.now() - began).toBeLessThan(1000);
    expect(v?.ahead[0].home.chance).toBeUndefined();
    expect(v?.record).toBe("9-2");
  });

  it("refuses a league or id that isn't ESPN's, asking nothing", async () => {
    serve(() => json({}));
    expect(await getTeamView("cbb", "../x", NOW)).toBeNull();
    expect(await getTeamView("nba" as never, "1", NOW)).toBeNull();
    expect(asked).toEqual([]);
  });
});

describe("teamList", () => {
  it("refuses an empty list, so it's never kept for a day", async () => {
    serve(() => json({ sports: [{ leagues: [{ teams: [] }] }] }));
    await expect(teamList("cbb")).rejects.toThrow();
  });
});

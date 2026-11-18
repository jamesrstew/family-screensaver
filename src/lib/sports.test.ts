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

const { gather, getGames } = await import("./sports");

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
    // No family teams: no schedules, and no NFL at all.
    expect(asked.some((u) => u.includes("/schedule"))).toBe(false);
    expect(asked.some((u) => u.includes("nfl") || u.includes("KXNFLGAME"))).toBe(false);
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
    const games = await gather(NOW, TZ, []);
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
    const [g] = await gather(NOW, TZ, [], 50);
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

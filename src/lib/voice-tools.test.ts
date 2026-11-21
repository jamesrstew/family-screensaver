import { describe, expect, it } from "vitest";
import { STALE_MS } from "./indoor";
import type { Snapshot } from "./types";
import { runTool } from "./voice-tools";

const at = "2026-11-17T18:00:00.000Z";
const snapshot = (indoor: Snapshot["indoor"]): Snapshot => ({
  issuedAt: at,
  place: "Home",
  timeZone: "America/Los_Angeles",
  weather: null,
  happenings: null,
  indoor,
  notebook: [],
  voice: true,
});
const house = { at, temp: 68, rooms: [{ name: "Den", temp: 68, humidity: 40 }] };
const ask = (s: Snapshot, ms: number) =>
  runTool(
    "read_weather",
    {},
    {
      snapshot: s,
      now: new Date(Date.parse(at) + ms),
      show: () => {},
      hangUp: () => {},
    },
  ) as Promise<{ inside: unknown }>;

describe("read_weather: inside", () => {
  it("gives each room while the reading is fresh", async () => {
    expect((await ask(snapshot(house), 60_000)).inside).toEqual([
      { room: "Den", temperature: "68°F", humidity: "40%" },
    ]);
  });

  it("says plainly that it doesn't know when the reading is old or missing", async () => {
    expect((await ask(snapshot(house), STALE_MS)).inside).toBe("unknown");
    expect((await ask(snapshot(null), 0)).inside).toBe("unknown");
  });
});

describe("read_games", () => {
  const side = (id: string, name: string, more = {}) => ({ id, name, short: name, ...more });
  const games: Snapshot["games"] = [
    {
      id: "1",
      league: "cfb",
      start: "2026-11-17T05:00:00.000Z", // last night, 9 p.m. Pacific
      timed: true,
      state: "post",
      period: "Final",
      neutral: false,
      away: side("2294", "Iowa", { mine: true, score: 27 }),
      home: side("275", "Wisconsin", { score: 20 }),
    },
    {
      id: "2",
      league: "cfb",
      start: "2026-11-17T19:00:00.000Z",
      timed: true,
      state: "in",
      period: "2nd qtr.",
      neutral: false,
      // A score ESPN hasn't sent yet.
      away: side("1", "A", { rank: 4 }),
      home: side("2", "B"),
    },
    {
      id: "3",
      league: "cfb",
      start: "2026-11-18T01:00:00.000Z",
      timed: true,
      state: "pre",
      neutral: false,
      tv: "ABC",
      away: side("3", "C", { chance: 50 }),
      home: side("4", "D", { rank: 9, chance: 50 }),
    },
  ];
  const read = (s: Partial<Snapshot>, ms = 0) =>
    runTool(
      "read_games",
      {},
      {
        snapshot: { ...snapshot(null), ...s },
        now: new Date(Date.parse(at) + ms),
        show: () => {},
        hangUp: () => {},
      },
    ) as Promise<Array<Record<string, unknown>> | { available: false }>;

  it("reads each game plainly: yesterday's final, a game under way, an even one", async () => {
    const got = (await read({ games, gamesAt: at })) as Array<Record<string, unknown>>;
    expect(got[0]).toMatchObject({
      day: "yesterday",
      when: "Final",
      score: "Iowa 27, Wisconsin 20",
      ourTeam: true,
    });
    // No score yet: none said, never "undefined".
    expect(got[1]).not.toHaveProperty("score");
    expect(JSON.stringify(got)).not.toContain("undefined");
    expect(got[2]).toMatchObject({ game: "C at No. 9 D", channel: "ABC", chanceOfWinning: "even" });
  });

  it("knows nothing from an old list", async () => {
    expect(await read({ games, gamesAt: at }, 31 * 60_000)).toEqual({ available: false });
    expect(await read({ games: null })).toEqual({ available: false });
  });
});

describe("show_page with a team", () => {
  const ask = (found: boolean) =>
    runTool(
      "show_page",
      { page: "sports", team: "Narnia" },
      { snapshot: snapshot(null), now: new Date(at), show: () => found, hangUp: () => {} },
    );

  it("says so when no team answers to it, and what's up instead", async () => {
    expect(await ask(false)).toMatchObject({
      team: false,
      say: "I couldn’t find that team; here are the games.".replace("’", "'"),
    });
    expect(await ask(true)).toEqual({ ok: true });
  });
});

describe("show_page and read_games for one league", () => {
  const shown: unknown[][] = [];
  const ctx = (s: Partial<Snapshot> = {}) => ({
    snapshot: { ...snapshot(null), ...s },
    now: new Date(at),
    show: (...a: unknown[]) => void shown.push(a),
    hangUp: () => {},
  });
  const nfl = (id: string, mine = false) => ({
    id,
    league: "nfl" as const,
    start: "2026-11-22T21:25:00Z",
    timed: true,
    state: "pre" as const,
    neutral: false,
    away: { id: `a${id}`, name: `Away ${id}`, short: `Away ${id}` },
    home: { id: `h${id}`, name: `Home ${id}`, short: `Home ${id}`, ...(mine ? { mine } : {}) },
  });

  it("passes a league from the fixed list, never beside a team or another page", async () => {
    shown.length = 0;
    await runTool("show_page", { page: "sports", league: "nfl" }, ctx());
    await runTool("show_page", { page: "sports", league: "nba" }, ctx());
    await runTool("show_page", { page: "week", league: "nfl" }, ctx());
    await runTool("show_page", { page: "sports", league: "cfb", team: "Iowa" }, ctx());
    expect(shown.map((a) => a[3])).toEqual(["nfl", undefined, undefined, undefined]);
  });

  it("reads one league's games, the NFL's whole slate with it", async () => {
    const got = (await runTool(
      "read_games",
      { league: "nfl" },
      ctx({ games: [nfl("1", true)], nfl: [nfl("2")], gamesAt: at }),
    )) as Array<Record<string, unknown>>;
    expect(got.map((g) => g.game)).toEqual(["Away 1 at Home 1", "Away 2 at Home 2"]);
    const college = await runTool(
      "read_games",
      { league: "cbb" },
      ctx({ games: [nfl("1", true)], nfl: [nfl("2")], gamesAt: at }),
    );
    expect(college).toEqual([]);
  });

  it("says it doesn't know, never “no games,” when the NFL's scoreboard didn't answer", async () => {
    expect(
      await runTool("read_games", { league: "nfl" }, ctx({ games: [], nfl: null, gamesAt: at })),
    ).toEqual({ available: false });
  });
});

import { describe, expect, it } from "vitest";
import { readSchedule, resultWord, teamView } from "./team-view";

// Wednesday, Nov. 18, 2026, 10 a.m. Pacific.
const NOW = new Date("2026-11-18T18:00:00Z");
const DAY = 86_400_000;

// A cut-down `teams/{id}/schedule`: the team, and its games against others.
const ev = (
  i: number,
  days: number,
  home: boolean,
  state = "pre",
  us?: number,
  them?: number,
  rank?: number,
) => ({
  id: String(100 + i),
  date: new Date(NOW.getTime() + days * DAY).toISOString(),
  competitions: [
    {
      status: { period: state === "in" ? 2 : 0, type: { state, name: "X" } },
      broadcasts: [{ media: { shortName: "ESPN" } }],
      competitors: [
        {
          homeAway: home ? "home" : "away",
          team: { id: "904", location: "Gonzaga", name: "Bulldogs" },
          curatedRank: { current: rank ?? 99 },
          ...(us !== undefined ? { score: { value: us } } : {}),
        },
        {
          homeAway: home ? "away" : "home",
          team: { id: String(200 + i), location: `Rival ${i}`, name: "Rivals" },
          ...(them !== undefined ? { score: { value: them } } : {}),
        },
      ],
    },
  ],
});
const json = (events: unknown[]) => ({
  team: {
    id: "904",
    displayName: "Gonzaga Bulldogs",
    location: "Gonzaga",
    name: "Bulldogs",
    recordSummary: "9-2",
  },
  events,
});

describe("teamView", () => {
  const events = [
    ev(1, -20, true, "post", 70, 60),
    ev(2, -10, false, "post", 61, 66),
    ev(3, -6, true, "post", 80, 52),
    ev(4, -3, true, "post", 75, 74, 12),
    ...Array.from({ length: 8 }, (_, i) =>
      ev(10 + i, 2 + i * 3, i % 2 === 0, "pre", undefined, undefined, 11),
    ),
  ];
  const view = teamView([readSchedule(json(events), "cbb")], "cbb", "904", NOW)!;

  it("names the team, its record and rank", () => {
    expect(view).toMatchObject({
      name: "Gonzaga Bulldogs",
      short: "Gonzaga",
      record: "9-2",
      rank: 11,
    });
  });

  it("keeps its last three results, the latest last, and its next six games", () => {
    expect(view.results.map((g) => g.id)).toEqual(["102", "103", "104"]);
    expect(view.ahead.map((g) => g.id)).toEqual(["110", "111", "112", "113", "114", "115"]);
    expect(view.live).toBeNull();
    expect(resultWord(view.results[0], "904")).toBe("L 61–66");
    expect(resultWord(view.results[2], "904")).toBe("W 75–74");
  });

  it("puts a game under way first, and leaves out a stale one", () => {
    const live = ev(30, -0.05, true, "in", 40, 31);
    const stale = ev(31, -1, false, "pre");
    const v = teamView(
      [readSchedule(json([live, stale, ev(32, 3, true)]), "cbb")],
      "cbb",
      "904",
      NOW,
    )!;
    expect(v.live?.id).toBe("130");
    expect(resultWord(v.live!, "904")).toBe("leads 40–31");
    expect(v.ahead.map((g) => g.id)).toEqual(["132"]);
  });

  it("joins the regular season and the postseason, each game once", () => {
    const a = readSchedule(json([ev(1, 2, true)]), "cbb");
    const b = readSchedule(
      {
        ...json([ev(1, 2, true), ev(2, 40, true)]),
        team: { id: "904", displayName: "Gonzaga Bulldogs" },
      },
      "cbb",
    );
    const v = teamView([a, b], "cbb", "904", NOW)!;
    expect(v.ahead.map((g) => g.id)).toEqual(["101", "102"]);
    expect(v.record).toBe("9-2");
  });

  it("names an NFL team by nickname", () => {
    const nfl = {
      team: { id: "908", displayName: "Chicago Bears", location: "Chicago", name: "Bears" },
      events: [],
    };
    expect(teamView([readSchedule(nfl, "nfl")], "nfl", "908", NOW)).toMatchObject({
      short: "Bears",
      ahead: [],
      results: [],
    });
  });

  it("is null for a schedule that isn't the team's", () => {
    expect(teamView([readSchedule({}, "cbb")], "cbb", "904", NOW)).toBeNull();
  });
});

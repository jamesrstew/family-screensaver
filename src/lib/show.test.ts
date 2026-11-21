import { describe, expect, it } from "vitest";
import { ShowBody, leagueFor, pageKey, targetOf, teamFor, viewAsked } from "./show";

describe("ShowBody", () => {
  it.each([
    ["weather", "weather"],
    [" Week Ahead ", "week"],
    ["calendar", "week"],
    ["home", "home"],
    ["quote", "notebook"],
    ["nature", "nature"],
    ["Nature mode", "nature"],
    ["show nature", "nature"],
    ["relax", "nature"],
  ])("%s means %s", (page, expected) => {
    expect(ShowBody.parse({ page }).page).toBe(expected);
  });
  it.each([
    ["hourly", "hours"],
    ["Seven-Day", "days"],
    ["7-day", "days"],
    ["ten day", "days"],
    ["Week’s forecast", "days"],
    ["today", "ribbon"],
  ])("%s is the weather's %s view", (page, view) => {
    expect(ShowBody.parse({ page })).toEqual({ page: "weather", view });
  });
  it("takes a view beside the weather page, and ignores one beside any other", () => {
    expect(ShowBody.parse({ page: "weather", view: "hourly" })).toEqual({
      page: "weather",
      view: "hours",
    });
    expect(ShowBody.parse({ page: "weather", view: "days" }).view).toBe("days");
    expect(ShowBody.parse({ page: "weather", view: "tornado" })).toEqual({ page: "weather" });
    expect(ShowBody.parse({ page: "week", view: "days" })).toEqual({ page: "week" });
  });
  it.each([
    "sports",
    "scores",
    "Show scores",
    "scoreboard",
    "Show the scoreboard",
    "all games",
    "Show all the games",
    "the games",
  ])("%s is the whole scoreboard", (page) => {
    expect(ShowBody.parse({ page })).toEqual({ page: "sports" });
  });
  it.each([
    ["college football", "cfb"],
    ["Show college football", "cfb"],
    ["NFL", "nfl"],
    ["show the NFL", "nfl"],
    ["pro football", "nfl"],
    ["college basketball", "cbb"],
    ["show basketball", "cbb"],
    ["Men’s college basketball", "cbb"],
    ["football", "football"],
    ["Show football", "football"],
  ])("%s is one league's games (%s)", (page, league) => {
    expect(ShowBody.parse({ page })).toEqual({ page: "sports", league });
  });
  it("takes a league beside the games page, from a fixed list only", () => {
    expect(ShowBody.parse({ page: "sports", league: "nfl" })).toEqual({
      page: "sports",
      league: "nfl",
    });
    expect(ShowBody.parse({ page: "sports", league: "College Football" }).league).toBe("cfb");
    expect(ShowBody.parse({ page: "sports", league: "mbb" }).league).toBe("cbb");
    // Anything else is left out: the whole scoreboard, never an error.
    expect(ShowBody.parse({ page: "sports", league: "nba" })).toEqual({ page: "sports" });
    expect(ShowBody.parse({ page: "sports", league: "constructor" })).toEqual({ page: "sports" });
    expect(ShowBody.safeParse({ page: "constructor" }).success).toBe(false);
    expect(ShowBody.safeParse({ page: "sports", league: "x".repeat(41) }).success).toBe(false);
    // Never beside another page; a team, if named, wins.
    expect(ShowBody.parse({ page: "weather", league: "nfl" })).toEqual({ page: "weather" });
    expect(ShowBody.parse({ page: "sports", league: "nfl", team: "Bears" })).toEqual({
      page: "sports",
      team: "Bears",
    });
  });
  it("refuses pages that don't exist", () => {
    expect(ShowBody.safeParse({ page: "news" }).success).toBe(false);
    expect(ShowBody.safeParse({}).success).toBe(false);
  });
});

describe("the league a request carries", () => {
  it("is the games page's only, and never beside a team", () => {
    expect(leagueFor("sports", "nfl")).toBe("nfl");
    expect(leagueFor("sports", "nfl", { league: "nfl", id: "3" })).toBeNull();
    expect(leagueFor("week", "nfl")).toBeNull();
    expect(leagueFor("sports")).toBeNull();
  });
});

describe("what a request turns the screen to", () => {
  it("carries a request's weather view through to the screen", () => {
    const asked = viewAsked("weather", "hours");
    expect(asked).toBe("hours");
    expect(targetOf({ base: "weather", slide: null, asked, fromUrl: "now" })).toBe("weather:hours");
  });
  it("falls back to ?weather= (or Now) for a plain request", () => {
    const asked = viewAsked("weather");
    expect(asked).toBeNull();
    expect(targetOf({ base: "weather", slide: null, asked, fromUrl: "days" })).toBe("weather:days");
  });
  it("clears the view for any other page, as the arrows do", () => {
    expect(viewAsked("week", "hours")).toBeNull();
    expect(targetOf({ base: "week", slide: null, asked: null, fromUrl: "now" })).toBe("week");
  });
  it("draws home's carousel slide by day, and the night page at night", () => {
    expect(targetOf({ base: "home", slide: "weather-hours", asked: null, fromUrl: "now" })).toBe(
      "carousel:weather-hours",
    );
    expect(targetOf({ base: "night", slide: null, asked: null, fromUrl: "now" })).toBe("night");
  });
});

describe("the page a target draws", () => {
  const at = (base: "home" | "night", slide: string) =>
    pageKey(targetOf({ base, slide, asked: null, fromUrl: "now" }));
  it("keeps passages back to back on one page, so only the piece turns", () => {
    expect(at("home", "passage-7")).toBe(at("home", "passage-8"));
    expect(at("night", "passage-7")).toBe(at("night", "passage-8"));
  });
  it("turns the page for the weather, and at sunset", () => {
    expect(at("home", "passage-7")).not.toBe(at("home", "weather-now"));
    expect(at("home", "passage-7")).not.toBe(at("night", "passage-8"));
    expect(at("home", "weather-now")).not.toBe(at("home", "weather-hours"));
    expect(pageKey("week")).toBe("week");
  });
});

describe("a team's games", () => {
  it("carries a team, as said, beside the games page only", () => {
    expect(ShowBody.parse({ page: "sports", team: " Kentucky basketball " })).toEqual({
      page: "sports",
      team: "Kentucky basketball",
    });
    expect(ShowBody.parse({ page: "games", team: "the Zags" })).toEqual({
      page: "sports",
      team: "the Zags",
    });
    expect(ShowBody.parse({ page: "weather", team: "Duke" })).toEqual({ page: "weather" });
  });

  it("drops a team that isn't a few plain words, and cuts a run-on one", () => {
    expect(ShowBody.parse({ page: "sports", team: "duke<script>" })).toEqual({ page: "sports" });
    expect(ShowBody.parse({ page: "sports", team: "a/../b" })).toEqual({ page: "sports" });
    expect(ShowBody.parse({ page: "sports", team: "duke ".repeat(30) })).toMatchObject({
      team: expect.stringMatching(/^duke/),
    });
    expect(
      (ShowBody.parse({ page: "sports", team: "duke ".repeat(30) }) as { team: string }).team
        .length,
    ).toBeLessThanOrEqual(60);
    expect(ShowBody.safeParse({ page: "sports", team: "x".repeat(401) }).success).toBe(false);
  });

  it("carries a team to the screen for the games page only", () => {
    const t = { league: "cbb" as const, id: "1" };
    expect(teamFor("sports", t)).toBe(t);
    expect(teamFor("home", t)).toBeNull();
    expect(teamFor("sports", null)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { ShowBody, pageKey, targetOf, viewAsked } from "./show";

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
  it("refuses pages that don't exist", () => {
    expect(ShowBody.safeParse({ page: "news" }).success).toBe(false);
    expect(ShowBody.safeParse({}).success).toBe(false);
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

  it("drops a team that isn't a few plain words, and refuses one too long", () => {
    expect(ShowBody.parse({ page: "sports", team: "duke<script>" })).toEqual({ page: "sports" });
    expect(ShowBody.parse({ page: "sports", team: "a/../b" })).toEqual({ page: "sports" });
    expect(ShowBody.safeParse({ page: "sports", team: "x".repeat(61) }).success).toBe(false);
  });
});

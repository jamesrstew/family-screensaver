import { describe, expect, it } from "vitest";
import { ShowBody, targetOf, viewAsked } from "./show";

describe("ShowBody", () => {
  it.each([
    ["weather", "weather"],
    [" Week Ahead ", "week"],
    ["calendar", "week"],
    ["home", "home"],
    ["quote", "notebook"],
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

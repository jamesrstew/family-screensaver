import { describe, expect, it } from "vitest";
import { ShowBody } from "./show";

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

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
  it("refuses pages that don't exist", () => {
    expect(ShowBody.safeParse({ page: "news" }).success).toBe(false);
    expect(ShowBody.safeParse({}).success).toBe(false);
  });
});

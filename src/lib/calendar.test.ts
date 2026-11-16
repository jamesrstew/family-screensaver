import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { expand } from "./calendar";
import { happeningsOn } from "./time";

const ics = readFileSync(path.join(__dirname, "../../content/fixtures/family.ics"), "utf8");
const TZ = "America/Los_Angeles";
const all = expand(
  ics,
  new Date("2026-11-16T00:00:00-08:00"),
  new Date("2026-11-30T00:00:00-08:00"),
);
const titles = (day: string) => happeningsOn(all, day, TZ).map((h) => h.title);

describe("expand", () => {
  it("expands weekly events into the window", () => {
    expect(titles("2026-11-16")).toEqual([
      "School drop-off",
      "Library story time",
      "Swim lessons",
      "Dinner with the Hendersons",
    ]);
  });
  it("keeps times in the family's zone", () => {
    const dropoff = happeningsOn(all, "2026-11-16", TZ)[0];
    expect(dropoff.start).toBe("2026-11-16T16:00:00.000Z"); // 8 a.m. PST
  });
  it("applies moved and cancelled occurrences", () => {
    expect(titles("2026-11-19")).toContain("Swim lessons (moved)");
    expect(titles("2026-11-23")).not.toContain("Swim lessons");
  });
  it("honors EXDATE", () => {
    expect(titles("2026-11-27")).not.toContain("School drop-off");
  });
  it("spans all-day events across days, all-day first", () => {
    expect(titles("2026-11-20")[0]).toBe("Grandma visits");
    expect(titles("2026-11-22")).toContain("Grandma visits");
    expect(titles("2026-11-23")).not.toContain("Grandma visits");
  });
  it("leaves out what's outside the window", () => {
    expect(all.every((h) => h.end > "2026-11-16" || h.allDay)).toBe(true);
  });
});

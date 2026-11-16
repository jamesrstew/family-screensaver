import { describe, expect, it } from "vitest";
import type { Happening, Snapshot } from "@/lib/types";
import { firstTomorrow } from "./common";

const TZ = "America/Los_Angeles";
const timed = (id: string, start: string): Happening => ({
  id,
  title: id,
  allDay: false,
  start,
  end: start,
});
const allDay = (id: string, day: string, next: string): Happening => ({
  id,
  title: id,
  allDay: true,
  start: day,
  end: next,
});

function nextAt(iso: string, happenings: Happening[]) {
  const snapshot = { timeZone: TZ, happenings } as Snapshot;
  return firstTomorrow({ snapshot, now: new Date(iso), mood: "night" });
}

describe("what's next on the night page", () => {
  const day = [
    timed("Soccer", "2026-11-17T15:00:00-08:00"),
    timed("Dinner", "2026-11-17T18:00:00-08:00"),
    timed("Drop-off", "2026-11-18T08:00:00-08:00"),
  ];

  it("labels a plan by when it starts, not by the hour now", () => {
    expect(nextAt("2026-11-17T05:30:00-08:00", day)?.label).toBe("This afternoon");
    expect(nextAt("2026-11-17T16:45:00-08:00", day)).toMatchObject({
      label: "Tonight",
      title: "Dinner",
    });
  });

  it("after the last plan, looks to tomorrow", () => {
    expect(nextAt("2026-11-17T21:00:00-08:00", day)).toMatchObject({
      label: "Tomorrow",
      title: "Drop-off",
    });
  });

  it("before dawn, an all-day plan today is today's, not tomorrow's", () => {
    const quiet = [allDay("No school", "2026-11-17", "2026-11-18"), ...day.slice(2)];
    expect(nextAt("2026-11-17T01:00:00-08:00", quiet)).toMatchObject({
      label: "Today",
      title: "No school",
    });
  });
});

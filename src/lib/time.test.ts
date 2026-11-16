import { describe, expect, it } from "vitest";
import { addDays, clock, dayKey, happeningsOn, moodOf, shortDate, weekdayOf, whenOf } from "./time";
import type { Happening } from "./types";

const TZ = "America/Los_Angeles";
const at = (iso: string) => new Date(iso);

describe("clock (AP style)", () => {
  it("spells noon and midnight", () => {
    expect(clock(at("2026-11-16T12:00:00-08:00"), TZ)).toBe("noon");
    expect(clock(at("2026-11-16T00:00:00-08:00"), TZ)).toBe("midnight");
  });
  it("drops :00 and keeps minutes otherwise", () => {
    expect(clock(at("2026-11-16T07:00:00-08:00"), TZ)).toBe("7 a.m.");
    expect(clock(at("2026-11-16T19:05:00-08:00"), TZ)).toBe("7:05 p.m.");
    expect(clock(at("2026-11-16T12:30:00-08:00"), TZ)).toBe("12:30 p.m.");
  });
});

describe("days", () => {
  it("uses the family's day, not the server's", () => {
    // 11 p.m. in Oregon is already tomorrow in UTC.
    expect(dayKey(at("2026-11-16T23:30:00-08:00"), TZ)).toBe("2026-11-16");
  });
  it("adds days across month ends", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
  });
  it("names days the AP way", () => {
    expect(weekdayOf("2026-11-19")).toBe("Thursday");
    expect(weekdayOf("2026-11-19", "short")).toBe("Thu.");
    expect(shortDate("2026-09-03")).toBe("Sept. 3");
    expect(shortDate("2026-06-03")).toBe("June 3");
  });
});

describe("moodOf", () => {
  it.each([
    ["2026-11-16T04:59:00-08:00", "night"],
    ["2026-11-16T05:00:00-08:00", "morning"],
    ["2026-11-16T13:00:00-08:00", "afternoon"],
    ["2026-11-16T18:00:00-08:00", "evening"],
    ["2026-11-16T21:29:00-08:00", "evening"],
    ["2026-11-16T21:30:00-08:00", "night"],
  ])("%s is %s with no forecast", (iso, mood) => {
    expect(moodOf(at(iso), TZ)).toBe(mood);
  });

  // A November day: sunrise 7:01 a.m., sunset 4:37 p.m.
  const winter = { sunrise: "2026-11-16T07:01:00-08:00", sunset: "2026-11-16T16:37:00-08:00" };
  it.each([
    ["2026-11-16T07:00:00-08:00", "night"],
    ["2026-11-16T07:01:00-08:00", "morning"],
    ["2026-11-16T16:36:00-08:00", "afternoon"],
    ["2026-11-16T16:37:00-08:00", "night"],
    ["2026-11-16T23:59:00-08:00", "night"],
    // Yesterday's forecast still reads as a time of day.
    ["2026-11-17T07:30:00-08:00", "morning"],
  ])("%s is %s in November", (iso, mood) => {
    expect(moodOf(at(iso), TZ, winter)).toBe(mood);
  });

  // A June day: sunset 8:48 p.m., so the evening stays light.
  const summer = { sunrise: "2026-06-21T05:25:00-07:00", sunset: "2026-06-21T20:48:00-07:00" };
  it.each([
    ["2026-06-21T05:24:00-07:00", "night"],
    ["2026-06-21T18:00:00-07:00", "evening"],
    ["2026-06-21T20:48:00-07:00", "night"],
  ])("%s is %s in June", (iso, mood) => {
    expect(moodOf(at(iso), TZ, summer)).toBe(mood);
  });
});

describe("happenings on a day", () => {
  const timed: Happening = {
    id: "a",
    title: "Late movie",
    allDay: false,
    start: "2026-11-16T22:00:00-08:00",
    end: "2026-11-17T00:00:00-08:00",
  };
  const allDay: Happening = {
    id: "b",
    title: "Grandma visits",
    allDay: true,
    start: "2026-11-20",
    end: "2026-11-23",
  };
  it("doesn't spill an event ending at midnight into the next day", () => {
    expect(happeningsOn([timed], "2026-11-16", TZ)).toHaveLength(1);
    expect(happeningsOn([timed], "2026-11-17", TZ)).toHaveLength(0);
  });
  it("treats an all-day end date as exclusive", () => {
    expect(happeningsOn([allDay], "2026-11-22", TZ)).toHaveLength(1);
    expect(happeningsOn([allDay], "2026-11-23", TZ)).toHaveLength(0);
  });
  it("labels times", () => {
    expect(whenOf(timed, "2026-11-16", TZ)).toBe("10 p.m.");
    expect(whenOf(allDay, "2026-11-21", TZ)).toBe("All day");
  });
});

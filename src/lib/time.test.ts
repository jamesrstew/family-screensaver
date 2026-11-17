import { describe, expect, it } from "vitest";
import {
  addDays,
  asksQuestion,
  clock,
  dayKey,
  happeningsOn,
  moodOf,
  twilightOf,
  veilOf,
  DUSK_PEAK,
  shortDate,
  weekdayOf,
  whenOf,
} from "./time";
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
    // 11 p.m. on the West Coast is already tomorrow in UTC.
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

describe("twilight", () => {
  // November again, with 28 minutes of civil twilight at each end.
  const sun = {
    sunrise: "2026-11-16T07:01:00-08:00",
    sunset: "2026-11-16T16:37:00-08:00",
    twilight: 28,
  };
  it.each([
    ["2026-11-16T16:36:00-08:00", null, "afternoon"],
    ["2026-11-16T16:37:00-08:00", { side: "dusk", depth: 0 }, "afternoon"],
    ["2026-11-16T16:50:00-08:00", { side: "dusk", depth: 13 / 28 }, "afternoon"],
    // The first stars: the paper turns to night.
    ["2026-11-16T16:51:00-08:00", { side: "dusk", depth: 0.5 }, "night"],
    ["2026-11-16T17:04:00-08:00", { side: "dusk", depth: 27 / 28 }, "night"],
    ["2026-11-16T17:05:00-08:00", null, "night"],
    ["2026-11-17T06:32:00-08:00", null, "night"],
    ["2026-11-17T06:33:00-08:00", { side: "dawn", depth: 1 }, "night"],
    ["2026-11-17T06:47:00-08:00", { side: "dawn", depth: 0.5 }, "night"],
    ["2026-11-17T06:48:00-08:00", { side: "dawn", depth: 13 / 28 }, "morning"],
    ["2026-11-17T07:01:00-08:00", null, "morning"],
  ] as const)("%s is %o, %s", (iso, twilight, mood) => {
    expect(twilightOf(at(iso), TZ, sun)).toEqual(twilight);
    expect(moodOf(at(iso), TZ, sun)).toBe(mood);
  });

  it("veils the light most at the turn, and not at all at either end", () => {
    expect(veilOf(null)).toBe(0);
    expect(veilOf({ side: "dusk", depth: 0 })).toBe(0);
    expect(veilOf({ side: "dusk", depth: 0.499 })).toBeCloseTo(DUSK_PEAK.dusk, 2);
    expect(veilOf({ side: "dawn", depth: 0.499 })).toBeCloseTo(DUSK_PEAK.dawn, 2);
    // Never over the night's paper.
    expect(veilOf({ side: "dusk", depth: 0.5 })).toBe(0);
    expect(veilOf({ side: "dawn", depth: 0.7 })).toBe(0);
    expect(veilOf({ side: "dawn", depth: 1 })).toBe(0);
    const curve = [0, 0.1, 0.2, 0.3, 0.4, 0.49].map((depth) => veilOf({ side: "dusk", depth }));
    expect(curve).toEqual([...curve].sort((a, b) => a - b));
  });

  it("runs past midnight in a northern summer", () => {
    // Far north in June: sunset 11:40 p.m., sunrise 3:10 a.m., 90 minutes each.
    const north = {
      sunrise: "2026-06-21T03:10:00-07:00",
      sunset: "2026-06-21T23:40:00-07:00",
      twilight: 90,
    };
    expect(twilightOf(at("2026-06-21T23:50:00-07:00"), TZ, north)).toEqual({
      side: "dusk",
      depth: 10 / 90,
    });
    expect(twilightOf(at("2026-06-22T00:40:00-07:00"), TZ, north)).toEqual({
      side: "dusk",
      depth: 60 / 90,
    });
    expect(moodOf(at("2026-06-22T00:40:00-07:00"), TZ, north)).toBe("night");
    expect(twilightOf(at("2026-06-22T01:40:00-07:00"), TZ, north)).toEqual({
      side: "dawn",
      depth: 1,
    });
    expect(moodOf(at("2026-06-22T02:30:00-07:00"), TZ, north)).toBe("morning");
  });

  it("isn't drawn without a forecast's twilight", () => {
    const bare = { sunrise: sun.sunrise, sunset: sun.sunset };
    expect(twilightOf(at("2026-11-16T16:50:00-08:00"), TZ, bare)).toBeNull();
    expect(twilightOf(at("2026-11-16T16:50:00-08:00"), TZ, null)).toBeNull();
  });
});

describe("asksQuestion", () => {
  it("asks from 2 to 6 p.m. on the family's clock, and not otherwise", () => {
    const asks = (iso: string) => asksQuestion(at(iso), TZ);
    expect(asks("2026-11-16T13:59:00-08:00")).toBe(false);
    expect(asks("2026-11-16T14:00:00-08:00")).toBe(true);
    expect(asks("2026-11-16T17:59:00-08:00")).toBe(true);
    expect(asks("2026-11-16T18:00:00-08:00")).toBe(false);
    expect(asks("2026-11-16T22:30:00-08:00")).toBe(false);
    // A server in UTC still asks by the family's clock.
    expect(asks("2026-11-16T22:30:00Z")).toBe(true);
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

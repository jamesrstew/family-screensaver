import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Weather } from "@/lib/types";
import { ARC, placeOf, skyNow } from "./arc";
import { ClockFace } from "./common";
import { bodyLook, nearNewMoon, skyOf, smokeOf, starsOf } from "./living";

const TZ = "America/Los_Angeles";

/** A day with sunrise 6:52 a.m. and sunset 4:48 p.m. (Pacific), Nov. 16, 2026. */
function day(code = 0, nextSunrise = true): Weather {
  return {
    now: { temp: 50, label: "", code, isDay: true },
    today: {
      high: 58,
      low: 40,
      precipChance: 0,
      label: "",
      sunrise: "2026-11-16T14:52:00Z",
      sunset: "2026-11-17T00:48:00Z",
      nextSunrise: nextSunrise ? "2026-11-17T14:53:00Z" : undefined,
    },
    days: [],
    hours: [],
  };
}

describe("skyOf", () => {
  it("never leaves the sky still: at least three moving things in any weather", () => {
    for (const code of [0, 1, 2, 3, 45, 61, 71, 95]) {
      const s = skyOf(code);
      expect(s.cumulus + s.stratus + s.wisps).toBeGreaterThanOrEqual(3);
    }
  });

  it("knows its weathers", () => {
    expect(skyOf(0).cover).toBe("clear");
    expect(skyOf(2).cover).toBe("partly");
    expect(skyOf(3).stratus).toBeGreaterThan(0);
    expect(skyOf(45).fog).toBe(true);
    expect(skyOf(63).fall).toBe("rain");
    expect(skyOf(73).fall).toBe("snow");
    expect(skyOf(95).fall).toBe("storms");
  });
});

describe("bodyLook", () => {
  it("shows the whole sun only when it's clear or fair", () => {
    expect(bodyLook(0)).toBe("full");
    expect(bodyLook(1)).toBe("full");
    expect(bodyLook(2)).toBe("soft");
  });

  it("keeps only a dot under cover, fog, rain, or snow, or near new moon", () => {
    for (const code of [3, 45, 61, 73, 95]) expect(bodyLook(code)).toBe("dot");
    expect(bodyLook(0, true)).toBe("dot");
  });

  it("knows the new moon", () => {
    expect(nearNewMoon(new Date("2026-11-09T12:00:00Z"))).toBe(true); // new moon Nov. 9
    expect(nearNewMoon(new Date("2026-11-24T12:00:00Z"))).toBe(false); // full moon Nov. 24
  });
});

describe("starsOf", () => {
  it("draws all the stars on clear or fair nights", () => {
    expect(starsOf(0)).toBe("all");
    expect(starsOf(1)).toBe("all");
  });
  it("draws only the brightest few through partly cloudy skies", () => {
    expect(starsOf(2)).toBe("few");
  });
  it("draws none through overcast, fog, rain, or snow, or with no report", () => {
    for (const code of [3, 45, 48, 61, 73, 95]) expect(starsOf(code)).toBe("none");
    expect(starsOf(null)).toBe("none");
  });
});

describe("skyNow and placeOf", () => {
  it("puts the sun at noon near the top of the arc", () => {
    const at = skyNow(day(), new Date("2026-11-16T19:50:00Z")); // 11:50 a.m.
    expect(at.body).toBe("sun");
    expect(at.t).toBeCloseTo(0.5, 1);
    const p = placeOf(day(), new Date("2026-11-16T19:50:00Z"));
    expect(p.low).toBe(0);
    expect(p.y).toBeLessThan(ARC.cy - ARC.ry + 1);
  });

  it("swells and sinks the sun in the last 40 minutes before sunset", () => {
    const p = placeOf(day(), new Date("2026-11-17T00:38:00Z")); // 4:38 p.m.
    expect(p.low).toBeGreaterThan(0.7);
    expect(p.size).toBeGreaterThan(15);
  });

  it("gives the moon the night, ending at tomorrow's real sunrise", () => {
    const at = skyNow(day(), new Date("2026-11-17T06:00:00Z")); // 10 p.m.
    expect(at.body).toBe("moon");
    expect(at.to.toISOString()).toBe("2026-11-17T14:53:00.000Z");
    // Without tomorrow's sunrise, today's plus a day.
    expect(skyNow(day(0, false), new Date("2026-11-17T06:00:00Z")).to.toISOString()).toBe(
      "2026-11-17T14:52:00.000Z",
    );
  });
});

describe("ClockFace", () => {
  const face = (iso: string) =>
    renderToStaticMarkup(createElement(ClockFace, { now: new Date(iso), tz: TZ }));

  it("says a.m. and p.m.", () => {
    expect(face("2026-11-16T14:30:00Z")).toContain("6:30");
    expect(face("2026-11-16T14:30:00Z")).toContain("a.m.");
    expect(face("2026-11-17T02:30:00Z")).toContain("p.m.");
  });

  it("says noon and midnight in words", () => {
    expect(face("2026-11-16T20:00:00Z")).toBe("noon");
    expect(face("2026-11-17T08:00:00Z")).toBe("midnight");
  });
});

describe("smokeOf", () => {
  const sky = (now: Partial<Weather["now"]>, code = 0): Weather => ({
    ...day(code),
    now: { ...day(code).now, ...now },
  });
  it("reads smoke from the air", () => {
    expect(smokeOf(null)).toBe("none");
    expect(smokeOf(sky({ aqi: 30, pm: 6, visibility: 40_000 }))).toBe("none");
    expect(smokeOf(sky({ aqi: 70, pm: 18 }))).toBe("haze");
    expect(smokeOf(sky({ pm: 40 }))).toBe("smoke");
    // Ozone is invisible: a high-ozone day is clear.
    expect(smokeOf(sky({ aqi: 140, ozone: 140, pm: 5 }))).toBe("none");
    expect(smokeOf(sky({ pm: 60 }))).toBe("thick");
  });
  it("calls a short view on a dry day haze, but not fog or rain", () => {
    expect(smokeOf(sky({ visibility: 5000 }))).toBe("haze");
    expect(smokeOf(sky({ visibility: 5000 }, 45))).toBe("none");
    expect(smokeOf(sky({ visibility: 5000 }, 61))).toBe("none");
  });
  it("veils the sun and hides the stars", () => {
    expect(bodyLook(0, false, "smoke")).toBe("veiled");
    expect(bodyLook(0, false, "haze")).toBe("soft");
    expect(bodyLook(3, false, "thick")).toBe("dot");
    expect(starsOf(0, "haze")).toBe("few");
    expect(starsOf(0, "smoke")).toBe("none");
  });
});

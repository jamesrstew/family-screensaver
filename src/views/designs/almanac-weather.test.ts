import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { freshWeather } from "@/lib/forecast";
import type { Snapshot } from "@/lib/types";
import { fakeWeather } from "@/lib/weather-fixtures";
import { Plate } from "./almanac-lenses";
import { Weather } from "./almanac-weather";

const tz = "America/Los_Angeles";
const fetched = new Date("2026-11-18T09:00:00-08:00");
const w = fakeWeather("snow", fetched, tz);
const at = (h: number) => new Date(fetched.getTime() + h * 3_600_000);

describe("a forecast that's run out", () => {
  it("is left out once it's more than about three hours old, or past its last hour", () => {
    expect(freshWeather(w, fetched)).toBe(w);
    expect(freshWeather(w, at(3.5))).toBe(w);
    expect(freshWeather(w, at(4.5))).toBeNull();
    expect(freshWeather(w, at(30))).toBeNull();
    expect(freshWeather({ ...w, hours: [] }, fetched)).toBeNull();
    expect(freshWeather(null, fetched)).toBeNull();
  });

  it("draws an empty Hours slide as nothing, never NaN or a stray caption", () => {
    const snapshot = {
      timeZone: tz,
      weather: w,
      notebook: [],
      happenings: [],
    } as unknown as Snapshot;
    const html = renderToStaticMarkup(
      createElement(Weather, { snapshot, now: at(30), mood: "morning", view: "hours" }),
    );
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Feels like");
  });
  it("draws a plate with no hours or no columns as nothing", () => {
    for (const lens of ["precip", "air", "feels", "wind", "humidity", "uv"] as const) {
      for (const [hours, cols] of [
        [[], 0],
        [[], 8],
      ] as const) {
        const html = renderToStaticMarkup(
          createElement(Plate, { lens, hours: [...hours], cols, scale: 1 }),
        );
        expect(html).toBe("");
      }
    }
  });
});

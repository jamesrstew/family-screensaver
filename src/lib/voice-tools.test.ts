import { describe, expect, it } from "vitest";
import { STALE_MS } from "./indoor";
import type { Snapshot } from "./types";
import { runTool } from "./voice-tools";

const at = "2026-11-17T18:00:00.000Z";
const snapshot = (indoor: Snapshot["indoor"]): Snapshot => ({
  issuedAt: at,
  place: "Home",
  timeZone: "America/Los_Angeles",
  weather: null,
  happenings: null,
  indoor,
  notebook: [],
  voice: true,
});
const house = { at, temp: 68, rooms: [{ name: "Den", temp: 68, humidity: 40 }] };
const ask = (s: Snapshot, ms: number) =>
  runTool(
    "read_weather",
    {},
    {
      snapshot: s,
      now: new Date(Date.parse(at) + ms),
      show: () => {},
      hangUp: () => {},
    },
  ) as Promise<{ inside: unknown }>;

describe("read_weather: inside", () => {
  it("gives each room while the reading is fresh", async () => {
    expect((await ask(snapshot(house), 60_000)).inside).toEqual([
      { room: "Den", temperature: "68°F", humidity: "40%" },
    ]);
  });

  it("says plainly that it doesn't know when the reading is old or missing", async () => {
    expect((await ask(snapshot(house), STALE_MS)).inside).toBe("unknown");
    expect((await ask(snapshot(null), 0)).inside).toBe("unknown");
  });
});

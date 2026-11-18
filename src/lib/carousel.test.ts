import { describe, expect, it } from "vitest";
import {
  CYCLE_MS,
  SLIDE_MS,
  isNatureCycle,
  natureNext,
  WEATHER_VIEWS,
  nextTurnIn,
  passageNear,
  startAfter,
  slideFromKey,
  slideKey,
  slideOf,
  turns,
  weatherFirst,
  type Slide,
  type Start,
} from "./carousel";
import { passageAt, passagesFrom } from "./pick";
import { targetOf } from "./show";

const tz = "America/Los_Angeles";
const morning = Date.parse("2026-11-18T09:00:07-08:00");
const afternoon = Date.parse("2026-11-18T15:00:07-08:00");
const kinds = (since: number, slides: number, weather = true, start: Start = { since }) =>
  Array.from({ length: slides }, (_, i) =>
    slideOf(new Date(since + i * SLIDE_MS), start, weather, tz),
  );
const letters = (s: Slide[]) => s.map((x) => (x.kind === "weather" ? "W" : "P")).join("");

describe("home's carousel", () => {
  it("always opens on the weather's now, never a quote", () => {
    for (const s of [morning, afternoon, 7_777, 99_999_999]) {
      expect(slideOf(new Date(s), { since: s }, true, tz)).toEqual({
        kind: "weather",
        view: "now",
      });
    }
  });

  it("puts the weather first from midnight to noon: two views, then a passage", () => {
    expect(letters(kinds(morning, 9))).toBe("WWPWWPWWP");
    expect(weatherFirst(Date.parse("2026-11-18T00:00:00-08:00"), tz)).toBe(true);
    expect(weatherFirst(Date.parse("2026-11-18T11:59:59-08:00"), tz)).toBe(true);
    expect(weatherFirst(Date.parse("2026-11-18T12:00:00-08:00"), tz)).toBe(false);
  });

  it("puts the passages first from noon to midnight: one view, then two passages", () => {
    expect(letters(kinds(afternoon, 9))).toBe("WPPWPPWPP");
    expect(letters(kinds(Date.parse("2026-11-18T22:00:00-08:00"), 6))).toBe("WPPWPP");
  });

  it("changes over smoothly at noon and at midnight: no double slide, no view skipped", () => {
    for (const at of ["2026-11-18T12:00:00-08:00", "2026-11-19T00:00:00-08:00"]) {
      const since = Date.parse(at) - 10 * 60_000 + 13_000;
      const all = kinds(since, 60);
      // Each cycle opens on the weather and closes on a passage, either side of the change.
      expect(letters(all)).toMatch(/^(WWP|WPP)+$/);
      expect(letters(all)).toContain(at.includes("T12") ? "WWPWPP" : "WPPWWP");
      // The views go round in order, straight through it.
      const views = all.flatMap((x) => (x.kind === "weather" ? [x.view] : []));
      views.forEach((v, i) => expect(v).toBe(WEATHER_VIEWS[i % WEATHER_VIEWS.length]));
      // And every passage is a new one.
      const ns = all.flatMap((x) => (x.kind === "passage" ? [x.n] : []));
      expect(new Set(ns).size).toBe(ns.length);
      ns.slice(1).forEach((n, i) => expect(n).toBeGreaterThan(ns[i]));
    }
  });

  it("keeps the views in order across a whole day, and across the clocks changing", () => {
    for (const at of [
      "2026-11-18T05:00:00-08:00",
      "2026-11-01T00:30:00-07:00",
      "2026-03-08T00:30:00-08:00",
    ]) {
      const since = Date.parse(at);
      const day = Array.from({ length: 24 * 40 }, (_, i) => since + i * CYCLE_MS);
      let seen = 0;
      for (const t of day) {
        for (let pos = 0; pos < 3; pos++) {
          const s = slideOf(new Date(t + pos * SLIDE_MS), { since }, true, tz);
          if (s.kind === "weather") expect(s.view).toBe(WEATHER_VIEWS[seen++ % 4]);
        }
      }
      // Two views a cycle for half the day, one for the other half.
      expect(Math.abs(seen - 24 * 40 * 1.5)).toBeLessThanOrEqual(41);
    }
  });

  it("brings a new passage every time, never one the deck has shown", () => {
    const ns = kinds(afternoon, 30).flatMap((x) => (x.kind === "passage" ? [x.n] : []));
    expect(ns.slice(1).every((n, i) => n === ns[i] + 1)).toBe(true);
  });

  it("reads passages the snapshot's window holds, for its first 40 minutes", () => {
    const deck = Array.from({ length: 500 }, (_, i) => ({
      id: `q${i}`,
      kind: "quote" as const,
      text: "x",
    }));
    for (const at of [morning, afternoon]) {
      const w = passagesFrom(deck, passageNear(at) - 4);
      for (const s of kinds(at, 80))
        if (s.kind === "passage") expect(passageAt(w, s.n)).not.toBeNull();
    }
  });

  it("without a weather report, stays on passages, each up 45 seconds", () => {
    const at = (ms: number) => slideOf(new Date(afternoon + ms), { since: afternoon }, false, tz);
    const keys = [0, 44_999, 45_000, 89_999, 90_000].map((ms) => slideKey(at(ms)));
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
    expect(keys[3]).toBe(keys[2]);
    expect(keys[4]).not.toBe(keys[3]);
    expect(new Set(keys).size).toBe(3);
    expect(nextTurnIn(afternoon + 10_000, afternoon, false)).toBe(35_000);
    expect(nextTurnIn(afternoon + 50_000, afternoon, false)).toBe(40_000);
  });
});

describe("slide keys", () => {
  it("round-trip", () => {
    for (const s of [
      { kind: "passage", n: 42 } as const,
      { kind: "weather", view: "hours" } as const,
    ])
      expect(slideFromKey(slideKey(s))).toEqual(s);
    expect(slideFromKey("weather-tornado")).toBeUndefined();
  });
});

describe("night turns as day does", () => {
  const now = Date.parse("2026-11-18T17:00:00-08:00");
  it("carries on across sunset and sunrise: day and night are one carousel", () => {
    const start = { since: now - 95_000 };
    expect(startAfter("home", "night", now, start)).toBe(start);
    expect(startAfter("night", "home", now, start)).toBe(start);
  });
  it("starts over, on the weather, coming back from another page", () => {
    expect(startAfter("week", "night", now, { since: 0 })).toEqual({ since: now });
    expect(startAfter("notebook", "home", now, { since: 0 })).toEqual({ since: now });
  });
  it('opens on a passage after the Weather page, and the next view is "now" again', () => {
    for (const t of [morning, now, Date.parse("2026-11-18T23:59:30-08:00")]) {
      const start = startAfter("weather", "night", t, { since: 0 });
      expect(slideOf(new Date(t), start, true, tz).kind).toBe("passage");
      const next = slideOf(new Date(t + SLIDE_MS), start, true, tz);
      expect(next).toEqual({ kind: "weather", view: "now" });
      // And on in order from there.
      const later = kinds(start.since, 14, true, start)
        .slice(2)
        .flatMap((x) => (x.kind === "weather" ? [x.view] : []));
      later.forEach((v, i) => expect(v).toBe(WEATHER_VIEWS[i % 4]));
    }
  });
  it("leaves other pages alone", () => {
    expect(startAfter("home", "week", now, { since: 123 })).toEqual({ since: 123 });
    expect(turns("night")).toBe(true);
    expect(turns("weather")).toBe(false);
  });
  it("keeps a weather slide's name across sunset; a passage turns with the mood", () => {
    const at = (base: "home" | "night", sl: Slide) =>
      targetOf({ base, slide: slideKey(sl), asked: null, fromUrl: "now" });
    const now: Slide = { kind: "weather", view: "now" };
    // The weather slide that's up when the sun sets keeps its place (and its lens).
    expect(at("home", now)).toBe(at("night", now));
    expect(at("night", { kind: "passage", n: 7 })).toBe("night:passage-7");
    expect(at("home", { kind: "passage", n: 7 })).toBe("home:passage-7");
  });
});

describe("the cadence, pinned", () => {
  it("turns every half minute, in cycles of three", () => {
    expect(SLIDE_MS).toBe(30_000);
    expect(CYCLE_MS).toBe(90_000);
  });
  it("lands each turn on its moment, not on the next tick", () => {
    const since = 1_000_000;
    expect(nextTurnIn(since, since)).toBe(SLIDE_MS);
    expect(nextTurnIn(since + 12_000, since)).toBe(SLIDE_MS - 12_000);
    expect(nextTurnIn(since + SLIDE_MS + 1_000, since)).toBe(SLIDE_MS - 1_000);
    expect(nextTurnIn(since - 5_000, since)).toBe(SLIDE_MS);
  });
});

describe("nature", () => {
  // A cycle by the clock that is a nature cycle, and home appearing a cycle before.
  const quarter = Date.parse("2026-11-18T10:15:00-08:00");
  const since = quarter - CYCLE_MS + 7;
  const yes = () => true;
  const at = (ms: number, weather = true, ready = yes) =>
    slideOf(new Date(since + ms), { since }, weather, tz, ready);

  it("takes a cycle's last minute every quarter hour, after the weather", () => {
    expect(isNatureCycle(Math.floor((since + CYCLE_MS) / CYCLE_MS))).toBe(true);
    expect(at(CYCLE_MS).kind).toBe("weather");
    expect(at(CYCLE_MS + SLIDE_MS)).toEqual({
      kind: "nature",
      n: (since + CYCLE_MS - 7) / CYCLE_MS,
    });
    expect(at(CYCLE_MS + 2 * SLIDE_MS).kind).toBe("nature");
    expect(at(2 * CYCLE_MS).kind).toBe("weather");
    // The next is ten cycles on: fifteen minutes.
    const kinds = Array.from({ length: 30 * 3 }, (_, i) => at(i * SLIDE_MS).kind);
    // Cycles 1, 11, and 21 of 30, two slides each.
    expect(kinds.filter((k) => k === "nature")).toHaveLength(6);
  });

  it("never in the first cycle after home appears", () => {
    const s = quarter + 1;
    for (let ms = 0; ms < CYCLE_MS; ms += SLIDE_MS)
      expect(slideOf(new Date(s + ms), { since: s }, true, tz, yes).kind).not.toBe("nature");
  });

  it("is a passage instead when the clip isn't ready", () => {
    expect(at(CYCLE_MS + 2 * SLIDE_MS, true, () => false).kind).toBe("passage");
  });

  it("without the weather, takes the cycle's second half", () => {
    expect(at(CYCLE_MS, false).kind).toBe("passage");
    expect(at(CYCLE_MS + CYCLE_MS / 2, false).kind).toBe("nature");
  });

  it("knows when the next one starts, so its clip can load in time", () => {
    const next = natureNext(since, { since }, true);
    expect(next?.from).toBe(since + CYCLE_MS + SLIDE_MS);
    expect(next?.to).toBe(since + 2 * CYCLE_MS);
    expect(natureNext(since + 2 * CYCLE_MS, { since }, true)?.from).toBe(
      since + 11 * CYCLE_MS + SLIDE_MS,
    );
  });

  it("keys round-trip", () => {
    expect(slideFromKey(slideKey({ kind: "nature", n: 12 }))).toEqual({ kind: "nature", n: 12 });
  });
});

describe("the games on home", () => {
  const games = (ours = false) => ({ any: true, ours });
  /** Each cycle's last slide, for cycles 0 to `n`, counting from `since`. */
  const lasts = (since: number, n: number, cue = games(), nature = () => false) =>
    Array.from({ length: n }, (_, c) => {
      const s = slideOf(
        new Date(since + c * CYCLE_MS + 2 * SLIDE_MS),
        { since },
        true,
        tz,
        nature,
        cue,
      );
      return s.kind === "games" ? Math.floor((since + c * CYCLE_MS) / CYCLE_MS) : null;
    });

  it("takes an afternoon cycle's last slide every fourth cycle, never the first after home appears", () => {
    const got = lasts(afternoon, 16).filter((n) => n !== null) as number[];
    expect(got.length).toBeGreaterThanOrEqual(3);
    for (const n of got) expect(n % 4).toBe(1);
    // The first cycle is weather and passages, whatever the clock.
    const first = Math.floor(afternoon / CYCLE_MS);
    expect(lasts(afternoon, 1)[0]).toBeNull();
    expect(lasts(first * CYCLE_MS - CYCLE_MS + 1, 1)[0]).toBeNull();
  });

  it("comes round every other cycle when a family team plays today", () => {
    const got = lasts(afternoon, 12, games(true)).filter((n) => n !== null) as number[];
    expect(got.length).toBeGreaterThanOrEqual(5);
    for (const n of got) expect(n % 2).toBe(1);
  });

  it("never shows when there are no games, and gives way to nature", () => {
    expect(lasts(afternoon, 30, { any: false, ours: false }).every((n) => n === null)).toBe(true);
    const all = () => true;
    for (const n of lasts(afternoon, 30, games(true), all))
      if (n !== null) expect(n % 10).not.toBe(0);
  });

  it("leaves the morning its one passage, unless a family game is on tonight's page", () => {
    expect(lasts(morning, 16, games(true)).every((n) => n === null)).toBe(true);
    const night = { any: true, ours: true, anyHour: true };
    expect(lasts(morning, 16, night).some((n) => n !== null)).toBe(true);
  });

  it("never takes the weather's slides, morning or afternoon", () => {
    for (const since of [morning, afternoon]) {
      for (let s = 0; s < 36; s++) {
        const slide = slideOf(
          new Date(since + s * SLIDE_MS),
          { since },
          true,
          tz,
          undefined,
          games(true),
        );
        if (slide.kind === "games") expect(s % 3).toBe(2);
      }
    }
  });

  it("keeps its name across sunset, like the weather's", () => {
    const key = slideKey({ kind: "games", n: 7 });
    expect(slideFromKey(key)).toEqual({ kind: "games", n: 7 });
    expect(targetOf({ base: "night", slide: key, asked: null, fromUrl: "now" })).toBe(
      "carousel:games-7",
    );
  });
});

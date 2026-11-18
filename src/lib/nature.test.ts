import { describe, expect, it } from "vitest";
import { natureNext } from "./carousel";
import {
  EXCERPT_S,
  clipFor,
  clipsOf,
  excerptAt,
  pickFor,
  readyFor,
  volumeOf,
  type Clip,
} from "./nature";

const clip = (id: string, seconds = 200): Clip => ({ id, seconds, place: `Place ${id}` });

/** The nature cycles the carousel really reaches, one after another, from home appearing at `since`. */
function slots(since: number, count: number): number[] {
  const out: number[] = [];
  let t = since;
  while (out.length < count) {
    const next = natureNext(t, { since }, true);
    if (!next) break;
    out.push(next.n);
    t = next.to;
  }
  return out;
}

describe("nature clips", () => {
  it("shows a minute from the middle: from 20 s or 15% in, ending 20 s short", () => {
    for (const seconds of [100, 137, 306, 1200]) {
      const c = clip("abcdefgh", seconds);
      for (let n = 0; n < 200; n++) {
        const at = excerptAt(c, n);
        expect(at).toBeGreaterThanOrEqual(Math.max(20, Math.floor(seconds * 0.15)));
        expect(at + EXCERPT_S).toBeLessThanOrEqual(seconds - 20);
      }
    }
    const long = clip("abcdefgh", 306);
    expect(new Set(Array.from({ length: 20 }, (_, n) => excerptAt(long, n))).size).toBeGreaterThan(
      5,
    );
  });

  it("plays every clip once before any comes back, over the slots the carousel reaches", () => {
    const since = Date.parse("2026-11-18T09:00:07-08:00");
    const ns = slots(since, 24);
    expect(ns.every((n) => n % 10 === 0)).toBe(true);
    // Pool sizes that share factors with the ten cycles between slots.
    for (const size of [2, 4, 5, 6, 10, 12]) {
      const all = Array.from({ length: size }, (_, i) => clip(`clip-${i}-xx`));
      const seen = ns.slice(0, size).map((n) => clipFor(all, n)?.id);
      expect(new Set(seen).size).toBe(size);
      expect(clipFor(all, ns[size])?.id).toBe(seen[0]);
    }
    expect(clipFor([], 30)).toBeNull();
  });

  it("reads the manifest: leaves out the excluded, the too short, and the malformed", () => {
    const json = {
      clips: [
        clip("keep-me1"),
        { ...clip("no-place"), place: "" },
        clip("not-this"),
        clip("tooshort", 90),
        { id: "../etc", seconds: 200, place: "x" },
        { id: "noplace1", seconds: 200 },
        null,
      ],
      excluded: ["not-this"],
    };
    expect(clipsOf(json).map((c) => c.id)).toEqual(["keep-me1", "no-place"]);
    expect(clipsOf(null)).toEqual([]);
    expect(clipsOf({ clips: "no" })).toEqual([]);
  });

  it("evens out the clips' loudness with their gain, never past full", () => {
    expect(volumeOf({ ...clip("aaaaaaaa"), gain: 0.5 }, 0.3)).toBeCloseTo(0.15);
    expect(volumeOf({ ...clip("aaaaaaaa"), gain: 4 }, 0.3)).toBe(1);
    expect(volumeOf(clip("aaaaaaaa"), 0.1)).toBe(0.1);
  });
});

describe("a nature slot", () => {
  const clips = ["a", "b", "c"].map((x) => clip(x.repeat(8)));
  const from = 1_000_000;
  const job = pickFor(null, 40, clips)!;

  it("shows its clip only if that clip was ready before the slot began", () => {
    expect(readyFor(40, job, { n: 40, id: job.clip.id, at: from - 5_000 }, from)).toBe(true);
    // Ready late: the slot stays a passage, never turning into a clip halfway.
    expect(readyFor(40, job, { n: 40, id: job.clip.id, at: from + 1 }, from)).toBe(false);
    // Ready for another slot, or another clip.
    expect(readyFor(40, job, { n: 30, id: job.clip.id, at: from - 5_000 }, from)).toBe(false);
    expect(readyFor(40, job, { n: 40, id: "zzzzzzzz", at: from - 5_000 }, from)).toBe(false);
  });

  it("gives itself back when its clip fails mid-slot", () => {
    const ready = { n: 40, id: job.clip.id, at: from - 5_000 };
    // A failed slot has no job (Screen drops it): the slide turns back to a passage.
    expect(readyFor(40, null, ready, from)).toBe(false);
  });

  it("keeps its clip when the manifest is read again mid-slot", () => {
    const refreshed = [clip("dddddddd"), clip("eeeeeeee"), ...clips.reverse()];
    expect(pickFor(job, 40, refreshed)).toBe(job);
    // The next slot picks afresh.
    expect(pickFor(job, 50, refreshed)?.n).toBe(50);
  });
});

import { describe, expect, it } from "vitest";
import { natureNext } from "./carousel";
import {
  EXCERPT_S,
  clipFor,
  clipsOf,
  excerptAt,
  isReady,
  modeFailed,
  modeGivesUp,
  modeJob,
  modeN,
  modeOnward,
  modeReady,
  modeSlot,
  modeStart,
  noteReady,
  pickFor,
  readyFor,
  type Clip,
  type Mode,
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
});

describe("a nature slot", () => {
  const clips = ["a", "b", "c"].map((x) => clip(x.repeat(8)));
  const from = 1_000_000;
  const job = pickFor(null, 40, clips)!;
  const word = (at: number, n = 40, id = job.clip.id) => [{ n, id, at }];

  it("shows its clip only if that very clip was ready before the slot began", () => {
    expect(readyFor(40, job, word(from - 5_000), from)).toBe(true);
    // Ready late: the slot stays a passage, never turning into a clip halfway.
    expect(readyFor(40, job, word(from + 1), from)).toBe(false);
    // Ready for another slot, or another clip.
    expect(readyFor(40, job, word(from - 5_000, 30), from)).toBe(false);
    expect(readyFor(40, job, word(from - 5_000, 40, "zzzzzzzz"), from)).toBe(false);
  });

  it("keeps word of more than one clip at a time, the latest for each key", () => {
    let list = noteReady([], { n: 40, id: "aaaaaaaa", at: 1 });
    list = noteReady(list, { n: -2, id: "bbbbbbbb", at: 2 });
    list = noteReady(list, { n: 40, id: "cccccccc", at: 3 });
    expect(list).toEqual([
      { n: -2, id: "bbbbbbbb", at: 2 },
      { n: 40, id: "cccccccc", at: 3 },
    ]);
    expect(isReady(list, { n: -2, clip: clip("bbbbbbbb"), from: 15 })).toBe(true);
    expect(isReady(list, { n: -3, clip: clip("bbbbbbbb"), from: 15 })).toBe(false);
  });

  it("keeps its clip when the manifest is read again mid-slot", () => {
    const refreshed = [clip("dddddddd"), clip("eeeeeeee"), ...clips.reverse()];
    expect(pickFor(job, 40, refreshed)).toBe(job);
    // The next slot picks afresh.
    expect(pickFor(job, 50, refreshed)?.n).toBe(50);
  });
});

describe("nature mode", () => {
  const clips = ["a", "b", "c"].map((x) => clip(x.repeat(8)));
  const start = (prev: Mode | null = null) => modeStart(prev, 1_000);

  it("plays clips whole, one after another, in the library's order", () => {
    const m = start();
    const first = modeJob(clips, m, 0, 7)!;
    expect(first).toMatchObject({ from: 15, until: 193 });
    const ids = [0, 1, 2, 3].map((k) => modeJob(clips, m, k, 7)!.clip.id);
    expect(new Set(ids.slice(0, 3)).size).toBe(3);
    expect(ids[3]).toBe(ids[0]);
    expect(modeJob([], m, 0, 7)).toBeNull();
  });

  it("gives every session its own keys, never a carousel slot's", () => {
    const a = start();
    const b = start(a);
    expect(b.session).toBe(a.session + 1);
    const keys = [a, b].flatMap((m) => [0, 1, 2].map((k) => modeN(m, k)));
    expect(new Set(keys).size).toBe(6);
    expect(keys.every((n) => n < 0)).toBe(true);
    // Consecutive clips take turns between the two windows.
    expect([0, 1, 2, 3].map((k) => modeSlot(modeN(b, k)))).toEqual([0, 1, 0, 1]);
  });

  it("moves on when the current clip ends, and only then", () => {
    const m = start();
    expect(modeOnward(m, modeN(m, 0)).k).toBe(1);
    // Word from the clip loading ahead, or from an old session, changes nothing.
    expect(modeOnward(m, modeN(m, 1))).toBe(m);
    expect(modeOnward(start(m), modeN(m, 0)).k).toBe(0);
  });

  it("passes over a clip that won't play, counts it, and gives up after five in a row", () => {
    let m = start();
    for (let i = 0; i < 4; i++) m = modeFailed(m, modeN(m, m.k));
    expect(m).toMatchObject({ k: 4, fails: 4 });
    expect(modeGivesUp(m)).toBe(false);
    // One loading ahead that won't: counted, but the current one plays on.
    const ahead = modeFailed(m, modeN(m, m.k + 1));
    expect(ahead).toMatchObject({ k: 4, fails: 5 });
    expect(modeGivesUp(ahead)).toBe(true);
    // A clip that loads ends the run of failures.
    expect(modeReady(m, modeN(m, m.k)).fails).toBe(0);
    // Asking again starts over, whatever happened before.
    expect(start(ahead)).toMatchObject({ k: 0, fails: 0 });
  });

  it("ignores word from another session", () => {
    const old = start();
    const m = start(old);
    expect(modeFailed(m, modeN(old, 0))).toBe(m);
    expect(modeReady({ ...m, fails: 3 }, modeN(old, 0)).fails).toBe(3);
  });
});

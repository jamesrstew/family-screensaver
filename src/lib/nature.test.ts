import { describe, expect, it } from "vitest";
import {
  clipAt,
  clipsOf,
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
  type Clip,
  type Mode,
} from "./nature";

const clip = (id: string, seconds = 200): Clip => ({ id, seconds, place: `Place ${id}` });

describe("nature clips", () => {
  it("walks the library in one shuffled order, every clip before any comes back", () => {
    const all = ["a", "b", "c", "d", "e"].map((x) => clip(x.repeat(8)));
    const seen = [0, 1, 2, 3, 4].map((i) => clipAt(all, i)?.id);
    expect(new Set(seen).size).toBe(5);
    expect(clipAt(all, 5)?.id).toBe(seen[0]);
    // The order is the clips' own, whatever order the manifest lists them in.
    expect(clipAt([...all].reverse(), 2)?.id).toBe(seen[2]);
    expect(clipAt([], 3)).toBeNull();
  });

  it("reads the manifest: leaves out the excluded, the too short, and the malformed", () => {
    const json = {
      clips: [
        clip("keep-me1"),
        { ...clip("no-place"), place: "" },
        clip("not-this"),
        clip("tooshort", 45),
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

  it("keeps word of more than one clip at a time, the latest for each key", () => {
    const m = start();
    const [a, b] = [modeN(m, 0), modeN(m, 1)];
    let list = noteReady([], { n: a, id: "aaaaaaaa", at: 1 });
    list = noteReady(list, { n: b, id: "bbbbbbbb", at: 2 });
    list = noteReady(list, { n: a, id: "cccccccc", at: 3 });
    expect(list).toEqual([
      { n: b, id: "bbbbbbbb", at: 2 },
      { n: a, id: "cccccccc", at: 3 },
    ]);
    const job = (n: number, id: string) => ({ n, clip: clip(id), from: 15, until: 193 });
    expect(isReady(list, job(b, "bbbbbbbb"))).toBe(true);
    expect(isReady(list, job(a, "aaaaaaaa"))).toBe(false);
  });

  it("gives every session its own keys", () => {
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

import { beforeEach, describe, expect, it } from "vitest";
import { LEVEL_DAY, LEVEL_NIGHT, LEVEL_TWILIGHT, VOLUME } from "./nature";
import { PRE_GAIN_MAX, SHELF_DB, ambientFor, resetAmbient, soundOf } from "./ambient";

describe("the clips' level", () => {
  it("is a notch quieter, softer at twilight, softest at night", () => {
    expect(VOLUME).toEqual({ day: 0.22, twilight: 0.13, night: 0.07 });
    expect(LEVEL_DAY > LEVEL_TWILIGHT && LEVEL_TWILIGHT > LEVEL_NIGHT).toBe(true);
  });

  it("through the graph: the clip's gain first (capped), the hour's level last", () => {
    expect(soundOf(0.5, LEVEL_DAY, true)).toEqual({ pre: 0.5, out: LEVEL_DAY, volume: 1 });
    expect(soundOf(14, LEVEL_NIGHT, true).pre).toBe(PRE_GAIN_MAX);
    expect(soundOf(undefined, LEVEL_TWILIGHT, true).pre).toBe(1);
  });

  it("without it: the element's volume alone, never past full", () => {
    expect(soundOf(0.5, LEVEL_DAY, false).volume).toBeCloseTo(0.11);
    expect(soundOf(14, LEVEL_DAY, false).volume).toBe(1);
    expect(soundOf(-3, LEVEL_NIGHT, false).volume).toBe(LEVEL_NIGHT);
  });
});

// A stand-in AudioContext that records how the graph is wired.
type Node = { connect: (n: Node) => Node; [k: string]: unknown };
function fakeContext(opts: { failSource?: boolean } = {}) {
  const wired: string[] = [];
  const node = (name: string, extra: Record<string, unknown> = {}): Node => {
    const n: Node = {
      ...extra,
      connect: (to: Node) => {
        wired.push(`${name}→${String(to.name)}`);
        return to;
      },
      name,
    };
    return n;
  };
  const param = () => ({ value: 0 });
  const ctx = {
    state: "suspended",
    destination: node("out"),
    resume: () => Promise.resolve(),
    createMediaElementSource: () => {
      if (opts.failSource) throw new Error("already wired");
      return node("source");
    },
    createGain: (() => {
      let i = 0;
      return () => node(i++ === 0 ? "pre" : "level", { gain: param() });
    })(),
    createBiquadFilter: () => node("shelf", { frequency: param(), gain: param(), type: "" }),
    createDynamicsCompressor: () =>
      node("compressor", {
        threshold: param(),
        knee: param(),
        ratio: param(),
        attack: param(),
        release: param(),
      }),
  };
  return { ctx, wired };
}

describe("the ambient graph", () => {
  beforeEach(() => resetAmbient());
  const video = () => ({}) as HTMLMediaElement;

  it("wires clip → gain → shelf → compressor → level → speakers, once per element", () => {
    const { ctx, wired } = fakeContext();
    const el = video();
    const make = () => ctx as never;
    const g = ambientFor(el, make);
    expect(g).not.toBeNull();
    expect(wired).toEqual([
      "source→pre",
      "pre→shelf",
      "shelf→compressor",
      "compressor→level",
      "level→out",
    ]);
    // Asked again (the next clip in the same window), the same graph: never wired twice.
    expect(ambientFor(el, make)).toBe(g);
    expect(wired).toHaveLength(5);
    expect(SHELF_DB).toBeLessThan(0);
  });

  it("falls back to the element's volume where there's no Web Audio", () => {
    expect(ambientFor(video(), () => null)).toBeNull();
    resetAmbient();
    expect(
      ambientFor(video(), () => {
        throw new Error("no audio");
      }),
    ).toBeNull();
  });

  it("falls back when the element can't be wired", () => {
    const { ctx } = fakeContext({ failSource: true });
    expect(ambientFor(video(), () => ctx as never)).toBeNull();
  });
});

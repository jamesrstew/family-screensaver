import { beforeEach, describe, expect, it } from "vitest";
import { LEVEL_DAY, LEVEL_NIGHT, LEVEL_TWILIGHT, levelAt } from "./nature";
import {
  PRE_GAIN_MAX,
  ambientOf,
  prepareAmbient,
  resetAmbient,
  setAudible,
  soundOf,
  type Ctx,
} from "./ambient";

describe("the clips' level", () => {
  it("follows the paper: the day's, twilight's while the sky changes, night's once dark", () => {
    const dusk = { side: "dusk", depth: 0.3 };
    expect(levelAt("afternoon", null)).toBe(LEVEL_DAY);
    expect(levelAt("evening", dusk)).toBe(LEVEL_TWILIGHT);
    // Past the turn the paper is night's, twilight or not: the softest.
    expect(levelAt("night", dusk)).toBe(LEVEL_NIGHT);
    expect(levelAt("night", null)).toBe(LEVEL_NIGHT);
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

// A stand-in AudioContext that records what's made and how it's wired.
type Fake = { connect: (to: Fake) => Fake; name: string; [k: string]: unknown };
function fakeContext(opts: { state?: AudioContextState; failAt?: string; wakes?: boolean } = {}) {
  const made: string[] = [];
  const wired: string[] = [];
  const param = () => ({
    value: 0,
    cancelScheduledValues: () => {},
    setValueAtTime: () => {},
    linearRampToValueAtTime: () => {},
  });
  const node = (name: string, extra: Record<string, unknown> = {}): Fake => {
    if (opts.failAt === name) throw new Error(`no ${name}`);
    made.push(name);
    const n: Fake = {
      ...extra,
      name,
      connect: (to: Fake) => {
        if (opts.failAt === `${name}→${to.name}`) throw new Error("won't wire");
        wired.push(`${name}→${to.name}`);
        return to;
      },
    };
    return n;
  };
  let gains = 0;
  const ctx = {
    state: opts.state ?? "running",
    currentTime: 0,
    destination: { name: "speakers", connect: () => ({}) } as unknown as Fake,
    resume() {
      if (opts.wakes) this.state = "running";
      return Promise.resolve();
    },
    suspend() {
      this.state = "suspended";
      return Promise.resolve();
    },
    createMediaElementSource: () => node("source"),
    createGain: () => node(gains++ === 0 ? "pre" : "level", { gain: param() }),
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
  return { ctx: ctx as unknown as Ctx & { state: string }, made, wired };
}

describe("the ambient graph", () => {
  beforeEach(() => resetAmbient());
  const video = () => ({}) as HTMLMediaElement;

  it("builds everything first and takes the clip last, then wires it through", async () => {
    const { ctx, made, wired } = fakeContext();
    const el = video();
    const g = await prepareAmbient(el, () => ctx);
    expect(g).not.toBeNull();
    expect(made.at(-1)).toBe("source");
    expect(wired).toEqual([
      "pre→shelf",
      "shelf→compressor",
      "compressor→level",
      "level→speakers",
      "source→pre",
    ]);
    // The next clip in the same window: the same graph, never captured twice.
    expect(await prepareAmbient(el, () => ctx)).toBe(g);
    expect(made.filter((m) => m === "source")).toHaveLength(1);
    expect(ambientOf(el)).toBe(g);
  });

  it("never takes the clip if the graph fails to build: the element plays as before", async () => {
    const { ctx, made } = fakeContext({ failAt: "compressor" });
    const el = video();
    expect(await prepareAmbient(el, () => ctx)).toBeNull();
    expect(made).not.toContain("source");
    expect(ambientOf(el)).toBeNull();
  });

  it("sends the clip straight to the speakers if wiring it fails after it's taken", async () => {
    const { ctx, wired } = fakeContext({ failAt: "source→pre" });
    expect(await prepareAmbient(video(), () => ctx)).toBeNull();
    expect(wired).toContain("source→speakers");
  });

  it("never takes the clip into a context that won't run", async () => {
    const { ctx, made } = fakeContext({ state: "suspended", wakes: false });
    expect(await prepareAmbient(video(), () => ctx)).toBeNull();
    expect(made).not.toContain("source");
  });

  it("wakes a sleeping context before taking the clip", async () => {
    const { ctx, made } = fakeContext({ state: "suspended", wakes: true });
    expect(await prepareAmbient(video(), () => ctx)).not.toBeNull();
    expect(made).toContain("source");
  });

  it("falls back to the element's volume where there's no Web Audio", async () => {
    expect(await prepareAmbient(video(), () => null)).toBeNull();
    resetAmbient();
    expect(
      await prepareAmbient(video(), () => {
        throw new Error("no audio");
      }),
    ).toBeNull();
  });

  it("lets the context sleep once nothing is audible", async () => {
    const { ctx } = fakeContext();
    const a = video();
    const b = video();
    await prepareAmbient(a, () => ctx);
    setAudible(a, true);
    setAudible(b, true);
    setAudible(a, false);
    expect(ctx.state).toBe("running");
    setAudible(b, false);
    expect(ctx.state).toBe("suspended");
  });
});

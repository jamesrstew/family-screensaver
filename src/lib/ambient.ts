/*
 * A nature clip's sound, made ambient without re-encoding: through Web Audio,
 * its gain evens it with the library, a high shelf softens shrill birdsong,
 * and a gentle compressor tames bursts; then the hour's level and the fades.
 *
 *   clip → gain (the clip's own) → high shelf → compressor → gain (the level)
 *
 * Asked for full sound, the shelf and compressor go flat and both gains go
 * to 1: the clip just as it was recorded, at the TV's own volume.
 *
 * Tuned by measurement (ffmpeg's equivalent chain over bird-heavy and water
 * clips): true peaks of birdsong fall 4–11 dB and every clip's peaks land
 * near the same height, while waterfalls and rivers lose only about 2 dB of
 * their top end against their low end, so water and wind don't go dull.
 *
 * Never silent by mistake: an element is captured (createMediaElementSource)
 * only into a running context, last, after the rest of the graph is built;
 * if wiring it fails after that, it goes straight to the speakers. Where Web
 * Audio isn't there, won't run, or won't build, the element's own volume
 * does the level, as before. A media element can be captured only once, ever,
 * so each <video> keeps its graph across clips. The context sleeps whenever
 * nothing is audible, and while the app is hidden.
 */

import type { Sound } from "./nature";

export const SHELF_HZ = 4000;
export const SHELF_DB = -4;
export const COMPRESSOR = { threshold: -28, knee: 10, ratio: 4, attack: 0.015, release: 0.4 };

/** The most the clip's own gain may lift a quiet clip (+12 dB), so its hiss stays down. */
export const PRE_GAIN_MAX = 4;

type Param = Pick<
  AudioParam,
  "value" | "cancelScheduledValues" | "setValueAtTime" | "linearRampToValueAtTime"
>;

export type AmbientGraph = {
  /** The clip's own gain, before the shelf and compressor. */
  pre: { value: number };
  /** Flatten the shelf and compressor (full sound), or give them back. */
  plain: (on: boolean) => void;
  /** Move the hour's level (the last gain) to `to` over `ms`, smoothly, on the audio clock. */
  fade: (to: number, ms: number) => void;
};

export type Ctx = Pick<
  AudioContext,
  | "createMediaElementSource"
  | "createGain"
  | "createBiquadFilter"
  | "createDynamicsCompressor"
  | "destination"
  | "resume"
  | "suspend"
  | "state"
  | "currentTime"
>;

let shared: Ctx | null | undefined;
// An element's graph once captured; null if it was captured but couldn't be
// wired (it plays straight through); absent while it's never been captured.
const graphs = new WeakMap<HTMLMediaElement, AmbientGraph | null>();
const audible = new Set<HTMLMediaElement>();

/** The one AudioContext, made on first need; null where there's none. */
function contextFrom(make: () => Ctx | null): Ctx | null {
  if (shared === undefined) {
    try {
      shared = make();
    } catch {
      shared = null;
    }
  }
  return shared;
}

const browserContext = (): Ctx | null => {
  const AC =
    typeof window === "undefined"
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  return AC ? new AC() : null;
};

/**
 * Wire one element into a graph on a running `ctx`: everything else first,
 * the element last. Throws only before the element is captured (then it's
 * untouched); after, a failure sends it straight to the speakers.
 */
export function buildGraph(ctx: Ctx, el: HTMLMediaElement): AmbientGraph | null {
  const pre = ctx.createGain();
  const shelf = ctx.createBiquadFilter();
  shelf.type = "highshelf";
  shelf.frequency.value = SHELF_HZ;
  shelf.gain.value = SHELF_DB;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = COMPRESSOR.threshold;
  comp.knee.value = COMPRESSOR.knee;
  comp.ratio.value = COMPRESSOR.ratio;
  comp.attack.value = COMPRESSOR.attack;
  comp.release.value = COMPRESSOR.release;
  const out = ctx.createGain();
  out.gain.value = 0;
  pre.connect(shelf).connect(comp).connect(out).connect(ctx.destination);
  const source = ctx.createMediaElementSource(el);
  try {
    source.connect(pre);
  } catch {
    source.connect(ctx.destination);
    return null;
  }
  const level: Param = out.gain;
  return {
    pre: pre.gain,
    plain: (on) => {
      shelf.gain.value = on ? 0 : SHELF_DB;
      // A ratio of 1 compresses nothing, whatever the threshold.
      comp.ratio.value = on ? 1 : COMPRESSOR.ratio;
    },
    fade: (to, ms) => {
      const t = ctx.currentTime;
      level.cancelScheduledValues(t);
      level.setValueAtTime(level.value, t);
      level.linearRampToValueAtTime(to, t + ms / 1000);
    },
  };
}

/**
 * Ready an element to play: wake the context, and if it's running and the
 * element was never captured, capture it. Resolves to its graph, or null for
 * the element's own volume (no Web Audio, a context that won't run, or
 * wiring that failed). Never captures into a suspended context.
 */
export async function prepareAmbient(
  el: HTMLMediaElement,
  make: () => Ctx | null = browserContext,
): Promise<AmbientGraph | null> {
  const ctx = contextFrom(make);
  if (!ctx) return graphs.get(el) ?? null;
  if (ctx.state !== "running") await ctx.resume().catch(() => {});
  if (graphs.has(el)) return graphs.get(el) ?? null;
  if (ctx.state !== "running") return null;
  try {
    const graph = buildGraph(ctx, el);
    graphs.set(el, graph);
    return graph;
  } catch {
    // Failed before the element was captured: it's untouched, and may try again.
    return null;
  }
}

/** The element's graph, if it has one now (else its own volume does the level). */
export const ambientOf = (el: HTMLMediaElement): AmbientGraph | null => graphs.get(el) ?? null;

/** Whether this element is sounding: the context sleeps once none is. */
export function setAudible(el: HTMLMediaElement, on: boolean) {
  if (on) audible.add(el);
  else audible.delete(el);
  if (!audible.size) sleepAmbient();
}

/** Let the context sleep (nothing audible, or the app hidden). */
export function sleepAmbient() {
  if (shared && shared.state === "running") shared.suspend().catch(() => {});
}

/** Tests only: forget the shared context and what's audible. */
export function resetAmbient() {
  shared = undefined;
  audible.clear();
}

/**
 * How a clip with gain `gain` sounds at the hour's `level`, gently: through
 * the graph, its own gain (capped) before the compressor and the level
 * after; without it, the element's volume alone, never past full. Full: the
 * clip as recorded (no gain, a flat graph). Off: silent.
 */
export function soundOf(
  gain: number | undefined,
  level: number,
  graph: boolean,
  sound: Sound = "soft",
) {
  if (sound === "full") return { pre: 1, out: 1, volume: 1, plain: true };
  if (sound === "off") return { pre: 1, out: 0, volume: 0, plain: false };
  const g = typeof gain === "number" && gain > 0 ? gain : 1;
  return graph
    ? { pre: Math.min(g, PRE_GAIN_MAX), out: level, volume: 1, plain: false }
    : { pre: 1, out: 1, volume: Math.min(1, level * g), plain: false };
}

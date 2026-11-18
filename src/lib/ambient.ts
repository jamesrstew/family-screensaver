/*
 * A nature clip's sound, made ambient without re-encoding: through Web Audio,
 * its gain evens it with the library, a high shelf softens shrill birdsong,
 * and a gentle compressor tames bursts; then the hour's level and the fades.
 *
 *   clip → gain (the clip's own) → high shelf → compressor → gain (the level)
 *
 * Tuned by measurement (ffmpeg's equivalent chain over bird-heavy and water
 * clips): true peaks of birdsong fall 4–11 dB and every clip's peaks land
 * near the same height, while waterfalls and rivers lose only about 2 dB of
 * their top end against their low end, so water and wind don't go dull.
 *
 * Where Web Audio isn't there or won't build, the element's own volume does
 * the level, as before. A media element can feed only one source node, ever,
 * so each <video> gets its graph once and keeps it across clips.
 */

export const SHELF_HZ = 4000;
export const SHELF_DB = -4;
export const COMPRESSOR = { threshold: -28, knee: 10, ratio: 4, attack: 0.015, release: 0.4 };

/** The most the clip's own gain may lift a quiet clip (+12 dB), so its hiss stays down. */
export const PRE_GAIN_MAX = 4;

export type AmbientGraph = {
  /** Resume the context (it may start suspended until something plays). */
  resume: () => void;
  /** The clip's own gain, before the shelf and compressor. */
  pre: { value: number };
  /** The hour's level and the fades, last. */
  out: { value: number };
};

type Ctx = Pick<
  AudioContext,
  | "createMediaElementSource"
  | "createGain"
  | "createBiquadFilter"
  | "createDynamicsCompressor"
  | "destination"
  | "resume"
  | "state"
>;

let shared: Ctx | null | undefined;
const graphs = new WeakMap<HTMLMediaElement, AmbientGraph | null>();

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

/** Wire one element into a graph on `ctx`. Throws if it can't (the caller falls back). */
export function buildGraph(ctx: Ctx, el: HTMLMediaElement): AmbientGraph {
  const source = ctx.createMediaElementSource(el);
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
  source.connect(pre).connect(shelf).connect(comp).connect(out).connect(ctx.destination);
  return {
    resume: () => {
      if (ctx.state !== "running") ctx.resume().catch(() => {});
    },
    pre: pre.gain,
    out: out.gain,
  };
}

/**
 * The element's graph, made once and kept (a media element can be wired only
 * once). Null where Web Audio isn't there or the wiring fails: then the
 * element's own volume does the work.
 */
export function ambientFor(
  el: HTMLMediaElement,
  make: () => Ctx | null = browserContext,
): AmbientGraph | null {
  if (graphs.has(el)) return graphs.get(el) ?? null;
  let graph: AmbientGraph | null = null;
  const ctx = contextFrom(make);
  if (ctx) {
    try {
      graph = buildGraph(ctx, el);
    } catch {
      graph = null;
    }
  }
  graphs.set(el, graph);
  return graph;
}

/** Tests only: forget the shared context. */
export function resetAmbient() {
  shared = undefined;
}

/**
 * How a clip with gain `gain` sounds at the hour's `level`: through the
 * graph, its own gain (capped) before the compressor and the level after;
 * without it, the element's volume alone, never past full.
 */
export function soundOf(gain: number | undefined, level: number, graph: boolean) {
  const g = typeof gain === "number" && gain > 0 ? gain : 1;
  return graph
    ? { pre: Math.min(g, PRE_GAIN_MAX), out: level, volume: 1 }
    : { pre: 1, out: 1, volume: Math.min(1, level * g) };
}

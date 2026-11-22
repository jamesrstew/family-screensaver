import { hashOf } from "./organic";

/*
 * Nature: asked for (Siri, the voice, the remote), the screen plays real
 * places one after another, with their own natural sound, softly. The clips
 * are the family's own and never live in this repo or online: the TV shell
 * serves them from the TV's storage at /nature/ (manifest.json and <id>.mp4).
 * Where nothing answers there (a phone, a browser), nature is simply home.
 *
 * Everything here is pure: which clip, which part of it, how loud.
 */

/** The clip's level, a fraction of the TV's: gentle by day, softer at twilight, softest at night. */
export const LEVEL_DAY = 0.22;
export const LEVEL_TWILIGHT = 0.13;
export const LEVEL_NIGHT = 0.07;
export const VOLUME = { day: LEVEL_DAY, twilight: LEVEL_TWILIGHT, night: LEVEL_NIGHT } as const;

/**
 * How nature sounds, as the family last asked: gentle (the hour's level,
 * evened and softened), full (just as it was recorded), or off. Gentle
 * until asked otherwise; the TV keeps the last asking (SOUND_KEY).
 */
export const SOUNDS = ["soft", "full", "off"] as const;
export type Sound = (typeof SOUNDS)[number];
export const SOUND_KEY = "family:nature-sound";

/** The sounds, by the names people say. */
export const SOUND_WORDS: Record<string, Sound> = {
  soft: "soft",
  gentle: "soft",
  mellow: "soft",
  quiet: "soft",
  quieter: "soft",
  low: "soft",
  usual: "soft",
  // Sound back after a mute is the usual sound, never full by surprise.
  on: "soft",
  unmute: "soft",
  full: "full",
  "full sound": "full",
  "as recorded": "full",
  off: "off",
  mute: "off",
  muted: "off",
  silent: "off",
  none: "off",
  "no sound": "off",
};

/** A sound as kept or said, or null for anything else. */
export const soundNamed = (s: unknown): Sound | null =>
  typeof s === "string" && Object.prototype.hasOwnProperty.call(SOUND_WORDS, s.trim().toLowerCase())
    ? SOUND_WORDS[s.trim().toLowerCase()]
    : null;

/**
 * The clips' level for the paper's mood: night's once the paper has turned
 * dark, twilight's while the sky is changing before that, else the day's.
 */
export const levelAt = (paper: string, twilight: unknown) =>
  paper === "night" ? LEVEL_NIGHT : twilight ? LEVEL_TWILIGHT : LEVEL_DAY;

/**
 * A clip as manifest.json lists it. `place` is its caption, where it was
 * filmed (the owner's to edit; empty for none). `gain` brings its sound to
 * the library's one loudness (measured when the manifest is written); the
 * volume is the hour's level times it.
 */
export type Clip = { id: string; seconds: number; place: string; gain?: number };

export const MANIFEST_URL = "/nature/manifest.json";
export const srcOf = (c: Clip) => `/nature/${encodeURIComponent(c.id)}.mp4`;

/**
 * The clips manifest.json lists, less the excluded ones and any too short to
 * show past their opening. Anything malformed is left out, never thrown.
 */
export function clipsOf(json: unknown): Clip[] {
  const m = (json ?? {}) as { clips?: unknown; excluded?: unknown };
  const out = new Set(Array.isArray(m.excluded) ? m.excluded : []);
  const list = Array.isArray(m.clips) ? (m.clips as Partial<Clip>[]) : [];
  return list.flatMap((c) => {
    const ok =
      typeof c?.id === "string" &&
      /^[\w-]{1,64}$/.test(c.id) &&
      typeof c.seconds === "number" &&
      typeof c.place === "string";
    return ok && !out.has(c.id) && (c.seconds as number) >= SHORTEST_S ? [c as Clip] : [];
  });
}

/** The `i`th clip in the library's one shuffled order, round and round. */
export function clipAt(clips: Clip[], i: number): Clip | null {
  const pool = [...clips].sort((a, b) => hashOf(a.id) - hashOf(b.id));
  return pool.length ? pool[((i % pool.length) + pool.length) % pool.length] : null;
}

/** Where clip `id` stands in that order (-1 if it isn't there). */
export const orderOf = (clips: Clip[], id: string) =>
  [...clips].sort((a, b) => hashOf(a.id) - hashOf(b.id)).findIndex((c) => c.id === id);

/**
 * A clip to play and the stretch of it, fixed once picked: from `from`
 * seconds until `until`.
 */
export type Picked = { n: number; clip: Clip; from: number; until: number };

// Nature mode plays clips whole, from just after the opening credit (gone by
// about 13 seconds) to a few seconds before the end, so it sinks while it
// still plays, never on a frozen last frame.
const WHOLE_FROM_S = 15;
const WHOLE_TAIL_S = 7;
/** A clip shorter than this has too little left to show past its opening. */
const SHORTEST_S = 60;
/** In nature mode, the next clip starts loading this long before the current one ends. */
export const MODE_PRELOAD_S = 20;
/** Clips in a row that won't play before nature mode gives up and goes home. */
export const MODE_GIVE_UP = 5;

/**
 * A nature-mode session: asked for at `at`, on its `k`th clip, with `fails`
 * clips in a row that wouldn't play. Each session has its own number, so
 * nothing about one session's clips carries into the next.
 */
export type Mode = { session: number; at: number; k: number; fails: number };

export const modeStart = (prev: Mode | null, at: number): Mode => ({
  session: (prev?.session ?? 0) + 1,
  at,
  k: 0,
  fails: 0,
});

/** The `k`th clip's key in this session: never another session's. */
export const modeN = (m: Mode, k: number) => -(m.session * 1_000_000 + k + 1);

/** Which of the two windows plays the clip keyed `n`: they take turns, so the next can load. */
export const modeSlot = (n: number) => ((-n - 1) % 1_000_000) % 2;

/** The session's `k`th clip, whole, walking the library's order from `first`. */
export function modeJob(clips: Clip[], m: Mode, k: number, first: number): Picked | null {
  const clip = clipAt(clips, first + k);
  return clip
    ? { n: modeN(m, k), clip, from: WHOLE_FROM_S, until: clip.seconds - WHOLE_TAIL_S }
    : null;
}

/** The current clip has played out (or was given up): on to the next. Anything else changes nothing. */
export const modeOnward = (m: Mode, n: number): Mode =>
  n === modeN(m, m.k) ? { ...m, k: m.k + 1 } : m;

/** A clip wouldn't play: the current one is passed over; one loading ahead is tried again in its turn. */
export function modeFailed(m: Mode, n: number): Mode {
  if (n === modeN(m, m.k)) return { ...m, k: m.k + 1, fails: m.fails + 1 };
  if (n === modeN(m, m.k + 1)) return { ...m, fails: m.fails + 1 };
  return m;
}

/** A clip of this session is ready: the run of failures is over. */
export const modeReady = (m: Mode, n: number): Mode =>
  m.fails && (n === modeN(m, m.k) || n === modeN(m, m.k + 1)) ? { ...m, fails: 0 } : m;

export const modeGivesUp = (m: Mode) => m.fails >= MODE_GIVE_UP;

/** Word from a window: this clip, loaded for key `n`, at `at` on the screen's clock. */
export type Ready = { n: number; id: string; at: number };

/** Keep word of the last few clips ready (two windows, one loading ahead). */
export const noteReady = (list: Ready[], r: Ready): Ready[] =>
  [...list.filter((x) => x.n !== r.n), r].slice(-4);

/** That very clip is loaded for its key. */
export const isReady = (list: Ready[], job: Picked | null) =>
  Boolean(job && list.some((r) => r.n === job.n && r.id === job.clip.id));

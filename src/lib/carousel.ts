import { parts } from "./time";

// Home turns between pieces every half minute, always opening on the
// weather's "now", never on a quote. Night turns the same way, in night's ink
// (the night page with its one dim piece in place of home).
//
// The mix follows the family's day. From midnight to noon the weather comes
// first: two views of it, then a passage (a quote, or an idea). From noon to
// midnight the weather matters less: one view, then two passages (and from
// 2 to 6 p.m. the question for the table comes round every few minutes).
// The slides go in threes, a cycle of 90 seconds, each cycle taking its mix
// from the hour it starts in, so the change at noon and at midnight is smooth:
// every cycle opens on the weather and closes on a passage (or, now and
// then, a minute of nature: below).
//
// It counts from the moment home appeared; which quote and which view come up
// follow the clock, so a reload doesn't repeat the same ones.

export const SLIDE_MS = 30_000;
/** Three slides: weather, weather, passage (morning) or weather, passage, passage (afternoon). */
export const CYCLE_MS = 3 * SLIDE_MS;

/** The approved weather views, in the order home shows them. */
export const WEATHER_VIEWS = ["now", "hours", "days", "ribbon"] as const;
export type WeatherView = (typeof WEATHER_VIEWS)[number];

export type Slide =
  | { kind: "passage"; n: number }
  | { kind: "weather"; view: WeatherView }
  | { kind: "nature"; n: number }
  | { kind: "games"; n: number };

// Every so often a cycle's last minute is a window onto a real place (a
// nature clip, nature.ts) in place of its other slides: every tenth cycle by
// the clock, about one minute in fifteen, never the first cycle after home
// appears, and only when the screen has a clip ready for it.
export const NATURE_EVERY = 10;
export const isNatureCycle = (n: number) => n % NATURE_EVERY === 0;

/** Asks the screen whether nature slot `n` has its clip ready. */
export type NatureReady = (n: number) => boolean;

// The games (the sports page's first leaf) take a cycle's last slide, in
// place of a passage: every third cycle by the clock, every other one on a
// day one of the family's teams plays. Never the first cycle after home
// appears (it opens on the weather and a passage), never a nature cycle, and
// only when there are games within the page's few days.
export const GAMES_EVERY = { usual: 3, ours: 2 } as const;

/** What the screen knows of the games: any to show, and whether a family team plays today. */
export type GamesCue = { any: boolean; ours: boolean };

export const isGamesCycle = (n: number, ours: boolean) =>
  n % (ours ? GAMES_EVERY.ours : GAMES_EVERY.usual) === 1;

/** Midnight to noon, by the family's clock: the weather's half of the day. */
export const weatherFirst = (t: number, timeZone: string) => parts(new Date(t), timeZone).hour < 12;

/** Weather slides in a cycle: two in the weather's half of the day, else one. */
const weathersIn = (start: number, timeZone: string) => (weatherFirst(start, timeZone) ? 2 : 1);

const HOUR = 3_600_000;

/** The next local noon or midnight after `t` (DST-safe). */
function nextHalfAt(t: number, timeZone: string): number {
  const p = parts(new Date(t), timeZone);
  let b = Math.floor(t / 60_000) * 60_000 + (720 - (p.hour % 12) * 60 - p.minute) * 60_000;
  // Across a DST change the estimate is an hour off; nudge it onto the hour.
  const q = parts(new Date(b), timeZone);
  const h = q.hour % 12;
  if (h !== 0) b += (h < 6 ? -h : 12 - h) * HOUR;
  return b > t ? b : t + 12 * HOUR;
}

/** Weather slides in the cycles before cycle `c`, counting from `since`. */
function weathersBefore(c: number, since: number, timeZone: string): number {
  let n = 0;
  let a = since;
  let k = 0;
  // Stretch by stretch: within a half of the day, every cycle has the same mix.
  while (k < c) {
    const b = nextHalfAt(a, timeZone);
    const next = Math.min(c, Math.ceil((b - since) / CYCLE_MS));
    n += (next - k) * weathersIn(a, timeZone);
    k = next;
    a = b;
  }
  return n;
}

/**
 * Where the carousel counts from: when home appeared, and whether it came
 * back from the Weather page (it then opens on a passage, a cycle in).
 */
export type Start = { since: number; back?: boolean };

/**
 * What home shows at `now`, having appeared at `start`. No weather report:
 * passages only. Passage n is about two per 90 seconds since 1970 (each
 * cycle's first passage is even, its second odd), so it's never the same
 * one twice, and the snapshot's window (passageNear) can find it.
 */
export function slideOf(
  now: Date,
  start: Start,
  hasWeather: boolean,
  timeZone: string,
  nature: NatureReady = () => false,
  games: GamesCue = { any: false, ours: false },
): Slide {
  const { since } = start;
  const elapsed = Math.max(now.getTime() - since, 0);
  const slot = Math.floor(elapsed / SLIDE_MS);
  const c = Math.floor(slot / 3);
  const pos = slot % 3;
  const at = since + c * CYCLE_MS;
  const w = weathersIn(at, timeZone);
  const base = 2 * Math.floor(at / CYCLE_MS);
  const n = Math.floor(at / CYCLE_MS);
  // A nature cycle: the weather's now (or a passage), then the clip.
  const wild = c >= 1 && isNatureCycle(n) && nature(n);
  // No weather: the cycle's two passages, 45 seconds each.
  if (!hasWeather) {
    const second = elapsed % CYCLE_MS >= CYCLE_MS / 2;
    return wild && second ? { kind: "nature", n } : { kind: "passage", n: base + (second ? 1 : 0) };
  }
  if (wild && pos >= 1) return { kind: "nature", n };
  if (pos === 2 && c >= 1 && games.any && isGamesCycle(n, games.ours)) return { kind: "games", n };
  if (pos < w) {
    // Back from the Weather page, the first cycle's views were never shown:
    // the next one is "now" again.
    const skipped = start.back ? weathersIn(since, timeZone) : 0;
    const i = Math.max(weathersBefore(c, since, timeZone) - skipped, 0) + pos;
    return { kind: "weather", view: WEATHER_VIEWS[i % WEATHER_VIEWS.length] };
  }
  return { kind: "passage", n: base + (pos - w) };
}

/**
 * The next nature slot from `now` (or the one playing): its cycle number,
 * when it starts, and when it ends. Null if no nature cycle comes within
 * the next NATURE_EVERY cycles (it always does).
 */
export function natureNext(
  now: number,
  start: Start,
  hasWeather: boolean,
): { n: number; from: number; to: number } | null {
  const { since } = start;
  const c0 = Math.max(Math.floor(Math.max(now - since, 0) / CYCLE_MS), 1);
  const lead = hasWeather ? SLIDE_MS : CYCLE_MS / 2;
  for (let c = c0; c <= c0 + NATURE_EVERY; c++) {
    const at = since + c * CYCLE_MS;
    const n = Math.floor(at / CYCLE_MS);
    if (isNatureCycle(n)) return { n, from: at + lead, to: at + CYCLE_MS };
  }
  return null;
}

/** The passage number the carousel is reading about now (the snapshot's window starts near it). */
export const passageNear = (t: number) => 2 * Math.floor(t / CYCLE_MS);

/** Home by day and the night page turn as one carousel; the rest of the pages don't. */
export const turns = (base: string) => base === "home" || base === "night";

/**
 * When the carousel counts from, after the screen's page changes. Day and
 * night are one carousel: at sunset or sunrise it carries on (the next piece
 * simply comes in the other ink). Coming back from another page starts it
 * over, on the weather; from the Weather page, the weather's just been seen,
 * so it opens on a passage (the first cycle never has a nature clip, so its
 * last slide is always one).
 */
export function startAfter(from: string, to: string, now: number, start: Start): Start {
  if (!turns(to) || turns(from)) return start;
  return from === "weather" ? { since: now - 2 * SLIDE_MS, back: true } : { since: now };
}

/** Milliseconds until the carousel's next turn (a slide boundary). */
export function nextTurnIn(now: number, since: number, hasWeather = true): number {
  const step = hasWeather ? SLIDE_MS : CYCLE_MS / 2;
  return step - (Math.max(now - since, 0) % step);
}

export const slideKey = (s: Slide): string =>
  s.kind === "weather" ? `weather-${s.view}` : `${s.kind}-${s.n}`;

export function slideFromKey(key: string): Slide | undefined {
  const [kind, rest] = key.split("-");
  if ((kind === "passage" || kind === "nature" || kind === "games") && /^\d+$/.test(rest))
    return { kind, n: Number(rest) };
  const view = WEATHER_VIEWS.find((v) => v === rest);
  return kind === "weather" && view ? { kind, view } : undefined;
}

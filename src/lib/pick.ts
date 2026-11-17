// Which notebook entries run today, and which one is up right now.
// Deterministic: every screen in the house agrees, and a reload changes nothing.

import type { NotebookItem } from "./types";

/** Longest entry the TV will set in type. */
export const MAX_CHARS = 600;
/** Longest entry for the home screen. */
export const LEAD_CHARS = 320;
/** Minutes each entry stays on the page. */
export const SLOT_MINUTES = 15;
/** Entries per day: enough for every slot from 5 a.m. to 9:30 p.m. */
export const PER_DAY = 68;

function rng(seed: number) {
  // mulberry32
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], seed: number): T[] {
  const a = [...items];
  const r = rng(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const dayNumber = (key: string) => Math.floor(Date.parse(`${key}T12:00:00Z`) / 86_400_000);

/**
 * Today's run. The whole notebook is shuffled once, in a fixed order, and each
 * day reads the next stretch of it, so nothing repeats until everything has run.
 */
export function forDay(items: NotebookItem[], key: string): NotebookItem[] {
  const fit = items
    .filter((i) => i.text.length <= MAX_CHARS)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (fit.length === 0) return [];
  const deck = shuffled(fit, 3_2_1);
  const start = (dayNumber(key) * PER_DAY) % deck.length;
  const n = Math.min(PER_DAY, deck.length);
  return Array.from({ length: n }, (_, i) => deck[(start + i) % deck.length]);
}

/** The slot number for this moment: changes every SLOT_MINUTES. */
export const slotOf = (now: Date) => Math.floor(now.getTime() / (SLOT_MINUTES * 60_000));

/** A single short paragraph: set alone in the middle of the home screen. */
const heroFit = (i: NotebookItem) => i.text.length <= LEAD_CHARS && !i.text.includes("\n");

/** The home screen's idea or quote right now. */
export function leadFor(today: NotebookItem[], now: Date): NotebookItem | null {
  return leadAt(today, slotOf(now));
}

/** The nth idea or quote of the day's run (home's carousel counts its passages). */
export function leadAt(today: NotebookItem[], n: number): NotebookItem | null {
  const pool = today.filter((i) => i.kind !== "question" && heroFit(i));
  return pool.length ? pool[n % pool.length] : null;
}

/*
 * Home's and night's carousel shows a passage or two every 90 seconds, far
 * more than a day's run of entries. So the carousel reads its own deck: every
 * short idea and quote in the notebook, shuffled once in a fixed order,
 * passage n reading the nth, round and round. The numbers run by the clock,
 * two to a 90-second cycle (carousel.ts), so nothing repeats until the deck
 * comes round: about nine hours for 700 passages. It isn't a day's promise:
 * the afternoon reads every number, and the morning, with one passage a
 * cycle, every other one, so what the morning passes over waits for a later
 * round. The snapshot carries only a window of it, the next 40 minutes or so.
 */

/** Passages the snapshot carries: the next 40 minutes or more, refreshed every few minutes. */
export const PASSAGE_WINDOW = 60;
/** The afternoon's question comes round once in this many passages: every nine minutes. */
export const QUESTION_EVERY = 12;

/** The carousel's deck: every short idea and quote (that `fits` its rooms), in a fixed shuffled order. */
export function leadDeck(
  items: NotebookItem[],
  fits: (i: NotebookItem) => boolean = () => true,
): NotebookItem[] {
  const leads = items
    .filter((i) => i.kind !== "question" && heroFit(i) && fits(i))
    .sort((a, b) => a.id.localeCompare(b.id));
  return shuffled(leads, 3_2_1_2);
}

/** A window of the deck: passages `from` to `from + length`. */
export type Passages = { from: number; items: NotebookItem[] };
export function passagesFrom(
  deck: NotebookItem[],
  from: number,
  length = PASSAGE_WINDOW,
): Passages {
  if (!deck.length) return { from, items: [] };
  const at = (n: number) => deck[((n % deck.length) + deck.length) % deck.length];
  return { from, items: Array.from({ length }, (_, i) => at(from + i)) };
}

/** Passage n, if the window holds it. */
export const passageAt = (w: Passages | undefined, n: number): NotebookItem | null =>
  w && n >= w.from && n < w.from + w.items.length ? w.items[n - w.from] : null;

/** The evening's question for the table: one per day, so it can be discussed. */
export function questionFor(today: NotebookItem[]): NotebookItem | null {
  return today.find((i) => i.kind === "question" && heroFit(i)) ?? null;
}

/** The entry for the notebook page right now (any length that fits). */
export function entryFor(today: NotebookItem[], now: Date): NotebookItem | null {
  return today.length ? today[slotOf(now) % today.length] : null;
}

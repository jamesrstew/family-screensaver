// The turn at dusk and dawn, as plain decisions (components/Dusk.tsx and
// Screen.tsx carry them out): when the paper turns, when the next page may
// take it, and how the veil of the room's light lies.

import { DUSK_PEAK, veilOf, type Mood, type Twilight } from "./time";

/** How long the paper takes to turn at dusk or dawn (it's empty meanwhile). */
export const PAPER_MS = 3000;

const dark = (m: Mood) => m === "night";

/**
 * Whether a change of mood turns the paper. The paper has two looks, day and
 * night, so only crossing between them does (never 11 a.m. or 5 p.m.), and
 * only once the screen has settled (waking up, it takes its mood at once).
 */
export const turnsPaper = (paper: Mood, mood: Mood, settled: boolean) =>
  settled && dark(paper) !== dark(mood);

/** From the start of a turn: when the page has sunk (the paper changes), and when it has turned. */
export const turnTimes = (leave: number) => ({ sunk: leave, turned: leave + PAPER_MS });

/**
 * How long before the next page takes the paper: not while it turns; at once
 * when a turn has just ended (the old page sank before it began); otherwise
 * after the old page sinks.
 */
export function swapDelay(leaving: boolean, turning: boolean, justTurned: boolean, leave: number) {
  if (!leaving || turning) return null;
  return justTurned ? 0 : leave;
}

/**
 * The veil over the day's paper: how dark, whether it's drawn at all (not
 * while it's clear), and whether it moves quickly (at the turn, over empty
 * paper; over the night's paper; or lifting off a page someone asked for).
 */
export function veilState({
  twilight,
  on,
  turning,
  paper,
}: {
  twilight: Twilight | null;
  on: boolean;
  turning: boolean;
  paper: Mood;
}) {
  const opacity = !on || !twilight ? 0 : turning ? DUSK_PEAK[twilight.side] : veilOf(twilight);
  return { opacity, shown: opacity > 0, quick: turning || dark(paper) || !on };
}

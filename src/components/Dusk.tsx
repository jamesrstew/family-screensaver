"use client";

import { useEffect, useState } from "react";
import { DUSK_PEAK, veilOf, type Mood, type Twilight } from "@/lib/time";
import { ARC, bodyAt } from "@/views/designs/arc";
import { leaveMs } from "./Ink";

/*
 * Dusk and dawn on the screen: when the paper turns, and the veil of the
 * room's light over the day's paper.
 */

/** How long the paper takes to turn at dusk or dawn (it's empty meanwhile). */
export const PAPER_MS = 3000;

/**
 * The paper's mood, held back at the turn so it never changes under words:
 * home's old page sinks, the paper turns (empty, under the veil), and only then
 * may the new page ink in (`turning` is true until it may). Away from home, or
 * waking up, the paper takes the mood at once.
 */
export function useTurn(mood: Mood, slow: boolean) {
  const [paper, setPaper] = useState(mood);
  const [turning, setTurning] = useState(false);
  const [last, setLast] = useState(mood);
  if (mood !== last) {
    setLast(mood);
    if (slow) setTurning(true);
    else setPaper(mood);
  }
  useEffect(() => {
    if (!turning) return;
    const sunk = window.setTimeout(() => setPaper(mood), leaveMs());
    const turned = window.setTimeout(() => setTurning(false), leaveMs() + PAPER_MS);
    return () => {
      window.clearTimeout(sunk);
      window.clearTimeout(turned);
    };
  }, [turning, mood]);
  return { paper, turning };
}

/**
 * The light of dusk and dawn: one veil of the room's dark over the day's
 * paper, words and all, so the light falls without the ink losing the page.
 * Under a clear sky it lies deeper away from the sun, and on home's own piece
 * the sky just above the horizon where the sun went down (or will come up)
 * holds its light longest; under cloud, an even dusk. Never over the night's
 * paper, the voice, or a page someone asked for. Its opacity is set once a
 * minute and glides there on the compositor; at the turn it moves quickly,
 * over empty paper. Nothing repaints.
 */
export function Dusk({
  twilight,
  paper,
  turning,
  on,
  clear,
  glow,
}: {
  twilight: Twilight | null;
  /** The paper's mood (useTurn). */
  paper: Mood;
  turning: boolean;
  /** Home (by day or night) is up. */
  on: boolean;
  /** No cloud or smoke between the family and the sun's side of the sky. */
  clear: boolean;
  /** Home's own piece is up (not a weather view): the horizon may glow. */
  glow: boolean;
}) {
  const side = twilight?.side ?? "dusk";
  const veil = !on || !twilight ? 0 : turning ? DUSK_PEAK[side] : veilOf(twilight);
  const x = bodyAt(side === "dawn" ? 0 : 1).x;
  return (
    <div
      className="dusk"
      aria-hidden
      data-on={twilight ? "1" : "0"}
      data-side={side}
      data-sky={clear ? "clear" : "even"}
      data-quick={turning || paper === "night" ? "" : undefined}
      style={{ opacity: veil }}
    >
      <div
        className="dusk-glow"
        data-on={clear && glow && paper !== "night" ? "1" : "0"}
        // Half a flat glow, sitting on the sheet's horizon (the veil reaches
        // 3 rem past the sheet, for its drift).
        style={{ left: `${(x - 24 + 3).toFixed(1)}rem`, top: `${ARC.cy - 7 + 3}rem` }}
      />
    </div>
  );
}

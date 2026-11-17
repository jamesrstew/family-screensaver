// The land under the Almanac's living sky, drawn as one SVG image on the
// server (src/app/land/[seed]/route.ts), so the TV fetches a cached file
// instead of computing a hundred milliseconds of contours on a weak CPU and
// carrying them in its HTML.
//
// An imaginary eroded country, seen in perspective: each point of the sheet
// below the horizon looks down onto the ground through a camera. The ground
// slopes toward the horizon and toward a main valley up the middle, so its
// drainage gathers from both sides into a trunk that runs toward the words.
// The rivers are the strong lines; the contours sit behind them.

import { ARC } from "@/views/designs/arc";
import { contours, drainage, levelsOf, terrain } from "./organic";

export type Tone = "day" | "night";

/**
 * How many lands there are. The route is public, and each new land costs the
 * server about a tenth of a second to draw, so the set is small and fixed:
 * a day's sky picks one of these, and the cache holds them all (two tones each).
 */
export const LAND_SEEDS = 64;

/** The land for a sky's seed. */
export const landOf = (seed: number) => ((seed % LAND_SEEDS) + LAND_SEEDS) % LAND_SEEDS;

/**
 * The paper tokens the land is drawn in (Almanac's ink-faint and ink-soft,
 * day and night, from src/views/designs/designs.css). An image can't read
 * CSS variables, so they're baked here; a test keeps them in step.
 */
export const LAND_INK: Record<Tone, { faint: string; soft: string }> = {
  day: { faint: "#a1957f", soft: "#64584a" },
  night: { faint: "#4a443a", soft: "#6c6354" },
};

const STEP = 0.6; // rem per grid step on the sheet
/** Where the ground begins (rem from the top of the sheet), just under the horizon. */
export const LAND_TOP = ARC.cy + 0.6;
/** The image's size in sheet units (10 per rem): 126 rem wide, starting 3 rem left of the sheet. */
export const LAND_W = 1260;
export const LAND_H = Math.round((67.5 - LAND_TOP) * 10);
const NEAR = 40; // the ground's distance at the foot of the sheet (rem)
const FOCAL = 40;
const CAMERA = ((67.5 - ARC.cy) * NEAR) / FOCAL;
// Rivers taper from capillaries to trunks (sheet units).
const RIVER_W = [0.32, 0.55, 0.9, 1.35];

type Art = { contours: string[]; rivers: string[] };

function artOf(seed: number): Art {
  const cols = Math.ceil(126 / STEP);
  const rows = Math.ceil((69 - LAND_TOP) / STEP);
  const height = (i: number, j: number) => {
    const x = -3 + i * STEP;
    const y = LAND_TOP + j * STEP;
    // From the sheet down onto the ground: depth, then across.
    const z = (FOCAL * CAMERA) / (y - ARC.cy);
    const across = ((x - 60) * z) / FOCAL;
    // Far off, the ground flattens into haze: no lines crowd the horizon.
    const k = Math.exp(-(z - NEAR) / 120);
    const ground = terrain(seed, across / 52, z / 52) * 0.75;
    const valley = 0.55 * Math.min(Math.abs(across) / 70, 1) ** 1.3;
    const slope = 0.3 * (NEAR / z);
    return (ground + valley) * k + slope;
  };
  const levels = levelsOf(height, cols, rows, 11);
  return {
    contours: contours(height, cols, rows, levels, STEP * 10, 15),
    rivers: drainage(height, cols, rows, STEP * 10, 22, 4, seed),
  };
}

// One drawing at a time: the TV asks for one seed a day, in two tones.
let last: { seed: number; art: Art } | null = null;

/** The land as a standalone SVG document, in a tone's inks. */
export function landSvg(seed: number, tone: Tone): string {
  if (last?.seed !== seed) last = { seed, art: artOf(seed) };
  const { art } = last;
  const ink = LAND_INK[tone];
  const contourPaths = art.contours.map((d) => `<path d="${d}"/>`).join("");
  const riverPaths = art.rivers
    .map((d, i) => (d ? `<path d="${d}" stroke-width="${RIVER_W[i]}"/>` : ""))
    .join("");
  // The far ground melts into the haze: a mask, clean paper just under the horizon.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LAND_W} ${LAND_H}" ` +
    `width="${LAND_W}" height="${LAND_H}" fill="none" stroke-linejoin="round" stroke-linecap="round">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="${LAND_H}" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0.13" stop-color="#fff" stop-opacity="0"/>` +
    `<stop offset="0.3" stop-color="#fff" stop-opacity="0.35"/>` +
    `<stop offset="0.75" stop-color="#fff" stop-opacity="1"/></linearGradient>` +
    `<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${LAND_W}" height="${LAND_H}">` +
    `<rect width="${LAND_W}" height="${LAND_H}" fill="url(#g)"/></mask></defs>` +
    `<g mask="url(#m)">` +
    `<g stroke="${ink.faint}" stroke-width="0.75" opacity="0.5">${contourPaths}</g>` +
    `<g stroke="${ink.soft}">${riverPaths}</g>` +
    `</g></svg>`
  );
}

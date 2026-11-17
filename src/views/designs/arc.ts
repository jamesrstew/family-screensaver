import type { Weather } from "@/lib/types";
import { sunProgress } from "./common";

/*
 * The day's sky as one arc across the head of the sheet, from sunrise at the
 * left to sunset at the right; after sunset the moon takes it. Measured in rem
 * on the 120 x 67.5 rem sheet, so the living sky and the words beside the sun
 * agree on where it is.
 */

// rx keeps the sun's disc inside the 5.5 rem margins even at its largest.
export const ARC = { cx: 60, cy: 26.5, rx: 48, ry: 20 } as const;

/** A point on the arc, 0 at the left end and 1 at the right. */
export function arcAt(t: number): { x: number; y: number } {
  const a = Math.PI * (1 - Math.min(Math.max(t, 0), 1));
  return { x: ARC.cx + ARC.rx * Math.cos(a), y: ARC.cy - ARC.ry * Math.sin(a) };
}

export type SkyBody = { t: number; body: "sun" | "moon"; from: Date; to: Date };

/** Where we are on today's arc, and which body is riding it. */
export function skyNow(w: Weather, now: Date): SkyBody {
  const rise = Date.parse(w.today.sunrise);
  const set = Date.parse(w.today.sunset);
  const t = sunProgress(w, now);
  const DAY = 86_400_000;
  if (t >= 0 && t <= 1) return { t, body: "sun", from: new Date(rise), to: new Date(set) };
  // Night: from last sunset to next sunrise (tomorrow's real one, if known).
  const next = w.today.nextSunrise ? Date.parse(w.today.nextSunrise) : rise + DAY;
  const [from, to] = t > 1 ? [set, next] : [set - DAY, rise];
  return {
    t: (now.getTime() - from) / (to - from),
    body: "moon",
    from: new Date(from),
    to: new Date(to),
  };
}

/** Where the body is drawn: kept off the very ends, so it never sits on a label. */
export const bodyAt = (t: number) => arcAt(Math.min(Math.max(t, 0.04), 0.96));

const LOW_MS = 40 * 60_000;

export type Place = {
  x: number;
  y: number;
  /** The disc's drawn size, rem. */
  size: number;
  /** 0 by day; rising to 1 in the last (and first) 40 minutes of daylight. */
  low: number;
  body: SkyBody;
};

/**
 * Where the sun or moon is drawn, and how big. In the last and first 40
 * minutes of daylight the sun swells and sinks toward the horizon, which
 * hides it as it sets (the sky above the horizon clips it).
 */
export function placeOf(w: Weather, now: Date): Place {
  const body = skyNow(w, now);
  const p = bodyAt(body.t);
  if (body.body === "moon") return { ...p, size: 11, low: 0, body };
  const fromEdge = Math.min(now.getTime() - body.from.getTime(), body.to.getTime() - now.getTime());
  const low = Math.min(Math.max(1 - fromEdge / LOW_MS, 0), 1);
  const sink = Math.pow(low, 1.5);
  return { x: p.x, y: p.y + (ARC.cy + 1.5 - p.y) * sink, size: 15 + 4 * low, low, body };
}

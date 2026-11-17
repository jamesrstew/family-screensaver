import type { Weather } from "@/lib/types";
import { sunProgress } from "./common";

/*
 * The day's sky as one arc across the head of the sheet, from sunrise at the
 * left to sunset at the right; after sunset the moon takes it. Measured in rem
 * on the 120 x 67.5 rem sheet, so the living sky and the words beside the sun
 * agree on where it is.
 */

export const ARC = { cx: 60, cy: 26.5, rx: 53, ry: 20 } as const;

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
  // Night: from last sunset to next sunrise.
  const [from, to] = t > 1 ? [set, rise + DAY] : [set - DAY, rise];
  return {
    t: (now.getTime() - from) / (to - from),
    body: "moon",
    from: new Date(from),
    to: new Date(to),
  };
}

/** Where the body is drawn: kept off the very ends, so it never sits on a label. */
export const bodyAt = (t: number) => arcAt(Math.min(Math.max(t, 0.05), 0.95));

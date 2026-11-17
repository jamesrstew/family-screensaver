"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { LENSES, compass, hourKind, lensAt, type Figure, type Lens } from "@/lib/lenses";

/*
 * The lenses, drawn. Hours and Days each show a stretch of time as a row of
 * columns; a lens draws one plate across the whole row (an hour-by-hour chart
 * engraved in fine ink) with each column's figures under it.
 *
 *  rain and snow: the hours' water as stepped silhouettes, rain hatched in
 *                 slanting strokes, snow stippled in dots, the way an
 *                 engraver would set them.
 *  wind:          the sustained wind as one stroke; the gusts above it as a
 *                 fine line, the space between hatched.
 *  UV:            the sun's strength as a hatched hill each day.
 *
 * Every chart is drawn once, in plain SVG: nothing moves but the ink.
 */

// The plate: 109 x 13.6 rem at 10 units per rem, the same box the sky's engravings fill.
export const PW = 1090;
export const PH = 136;
const TOP = 10;
const BASE = 126;

/** The lens to show: turning every half minute from the moment the view appeared. */
export function useLens(now: Date, lenses: readonly Lens[]): Lens {
  const forced = useForced();
  const t = now.getTime();
  // When the view appeared. A clock that jumps (the page waking, or catching
  // up from the server's time) starts the count again, on the sky.
  const [clock, setClock] = useState({ since: t, last: t });
  if (t !== clock.last) {
    const jumped = t < clock.last || t - clock.last > 60_000;
    setClock({ since: jumped ? t : clock.since, last: t });
  }
  if (forced) return forced;
  // To the second: the screen's ten-second tick lands a hair short of each turn.
  return lensAt(Math.round((t - clock.since) / 1000) * 1000, lenses);
}

const noop = () => () => {};
/** Dev only: ?lens=wind holds one lens still, for design review. */
function useForced(): Lens | null {
  const asked = useSyncExternalStore(
    noop,
    () =>
      process.env.NODE_ENV !== "production"
        ? (new URLSearchParams(window.location.search).get("lens") ?? "")
        : "",
    () => "",
  );
  return LENSES.find((l) => l === asked) ?? null;
}

/** The lens's name, set small over its sentence. The sky needs none. */
export function captionOf(lens: Lens, kinds: { rain: boolean; snow: boolean }): string | null {
  if (lens === "precip") {
    return kinds.rain && kinds.snow ? "Rain and snow" : kinds.snow ? "Snow" : "Rain";
  }
  if (lens === "wind") return "Wind, mph";
  if (lens === "uv") return "UV index";
  return null;
}

/* ------------------------------------------------------------------ plate */

/** x of the middle of hour `i` when `n` hours fill the plate. */
const xOf = (i: number, n: number) => ((i + 0.5) * PW) / n;
const r1 = (x: number) => x.toFixed(1);

/** One smooth stroke through the points (Catmull-Rom), never dipping below the baseline. */
function smooth(pts: Array<[number, number]>): string {
  if (!pts.length) return "";
  const c = (y: number) => Math.min(y, BASE);
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[Math.max(i - 1, 0)];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const [x3, y3] = pts[Math.min(i + 2, pts.length - 1)];
    d += ` C${r1(x1 + (x2 - x0) / 6)} ${r1(c(y1 + (y2 - y0) / 6))} ${r1(x2 - (x3 - x1) / 6)} ${r1(c(y2 - (y3 - y1) / 6))} ${r1(x2)} ${r1(y2)}`;
  }
  return d;
}

/** The plate's frame: a fine baseline, and a tick where each column begins. */
function Frame({ cols }: { cols: number }) {
  return (
    <g className="text-ink-faint" strokeWidth={1}>
      <line x1={0} y1={BASE} x2={PW} y2={BASE} />
      {Array.from({ length: cols + 1 }, (_, i) => (
        <line key={i} x1={(i * PW) / cols} y1={BASE} x2={(i * PW) / cols} y2={BASE + 7} />
      ))}
    </g>
  );
}

/**
 * The engraver's fills. Rain: short slanting strokes in a staggered lattice.
 * Snow: a stipple of dots. Hatch: fine upright lines, for gusts and the sun.
 * `scale` sets the hand: bolder for a day's hours, finer for a week's.
 */
function Fills({ id, scale }: { id: string; scale: number }) {
  const t = `scale(${scale})`;
  return (
    <defs>
      <pattern
        id={`${id}-rain`}
        width={7}
        height={12}
        patternUnits="userSpaceOnUse"
        patternTransform={t}
      >
        <g stroke="currentColor" strokeWidth={1.1 / Math.sqrt(scale)} strokeLinecap="round">
          <line x1={5} y1={0.8} x2={3} y2={5.2} />
          <line x1={1.5} y1={6.8} x2={-0.5} y2={11.2} />
          <line x1={8.5} y1={6.8} x2={6.5} y2={11.2} />
        </g>
      </pattern>
      <pattern
        id={`${id}-snow`}
        width={8}
        height={8}
        patternUnits="userSpaceOnUse"
        patternTransform={t}
      >
        <g fill="currentColor" stroke="none">
          <circle cx={2} cy={2} r={0.75} />
          <circle cx={6} cy={6} r={0.75} />
        </g>
      </pattern>
      <pattern
        id={`${id}-hatch`}
        width={4}
        height={4}
        patternUnits="userSpaceOnUse"
        patternTransform={t}
      >
        <line x1={2} y1={-1} x2={2} y2={5} stroke="currentColor" strokeWidth={0.7} />
      </pattern>
    </defs>
  );
}

type PlateProps = {
  lens: Exclude<Lens, "sky">;
  /** Hour by hour across the plate; `undefined` where the forecast runs out. */
  hours: Array<
    { precip: number; snow: number; wind: number; gust: number; uv: number } | undefined
  >;
  /** Columns under the plate (8 slots of hours, or 7 days). */
  cols: number;
  scale: number;
};

/** One lens's chart across the whole row. */
export function Plate({ lens, hours, cols, scale }: PlateProps) {
  const id = `plate-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg
      viewBox={`0 0 ${PW} ${PH}`}
      className="absolute inset-x-0 top-0 h-[13.6rem] w-full text-ink"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <Fills id={id} scale={scale} />
      <Frame cols={cols} />
      {lens === "precip" ? <Precip id={id} hours={hours} /> : null}
      {lens === "wind" ? <Wind id={id} hours={hours} /> : null}
      {lens === "uv" ? <Sun id={id} hours={hours} /> : null}
    </svg>
  );
}

/** Rain and snow: each run of wet hours as a stepped silhouette, filled by its kind. */
function Precip({ id, hours }: { id: string; hours: PlateProps["hours"] }) {
  const n = hours.length;
  const w = PW / n;
  const most = Math.max(0.1, ...hours.map((h) => h?.precip ?? 0));
  const y = (water: number) => BASE - Math.max((water / most) * (BASE - TOP), 4);
  // Runs of neighboring hours of the same kind.
  const runs: Array<{ kind: "rain" | "snow"; from: number; to: number }> = [];
  hours.forEach((h, i) => {
    const kind = h ? hourKind(h.precip, h.snow) : null;
    const last = runs.at(-1);
    if (!kind) return;
    if (last && last.kind === kind && last.to === i) last.to = i + 1;
    else runs.push({ kind, from: i, to: i + 1 });
  });
  return (
    <g>
      {runs.map((r) => {
        let d = `M${r1(r.from * w)} ${BASE}`;
        for (let i = r.from; i < r.to; i++) {
          const top = r1(y(hours[i]!.precip));
          d += ` L${r1(i * w)} ${top} L${r1((i + 1) * w)} ${top}`;
        }
        d += ` L${r1(r.to * w)} ${BASE} Z`;
        return (
          <path
            key={r.from}
            d={d}
            fill={`url(#${id}-${r.kind})`}
            strokeWidth={r.kind === "snow" ? 0.9 : 1.2}
            className={r.kind === "snow" ? "text-ink-soft" : undefined}
            stroke="currentColor"
          />
        );
      })}
    </g>
  );
}

/** Wind: the sustained speed, one stroke; the gusts a fine line above it, hatched between. */
function Wind({ id, hours }: { id: string; hours: PlateProps["hours"] }) {
  const n = hours.length;
  const known = hours
    .map((h, i) => (h ? { i, ...h } : null))
    .filter((h): h is NonNullable<typeof h> => Boolean(h));
  if (known.length < 2) return null;
  const top = Math.max(20, Math.ceil(Math.max(...known.map((h) => h.gust)) / 10) * 10);
  const y = (v: number) => BASE - (v / top) * (BASE - TOP);
  const speed = known.map((h) => [xOf(h.i, n), y(h.wind)] as [number, number]);
  const gust = known.map((h) => [xOf(h.i, n), y(Math.max(h.gust, h.wind))] as [number, number]);
  const band = `${smooth(gust)} L${r1(speed.at(-1)![0])} ${r1(speed.at(-1)![1])} ${smooth(
    [...speed].reverse(),
  ).replace(/^M/, "L")} Z`;
  return (
    <g>
      <path d={band} fill={`url(#${id}-hatch)`} stroke="none" className="text-ink-soft" />
      <path d={smooth(gust)} strokeWidth={0.9} className="text-ink-soft" />
      <path d={smooth(speed)} strokeWidth={2.4} />
    </g>
  );
}

const UV_BANDS = [
  { at: 3, word: "moderate" },
  { at: 6, word: "high" },
  { at: 8, word: "very high" },
  { at: 11, word: "extreme" },
];

/** The UV thresholds' names, set at the plate's right edge over their dotted lines. */
export function uvBands(peak: number): Array<{ word: string; top: string }> {
  const top = Math.max(9, peak);
  return UV_BANDS.filter((b) => b.at <= top).map((b) => ({
    word: b.word,
    top: `${(((BASE - (b.at / top) * (BASE - TOP)) / PH) * 13.6).toFixed(2)}rem`,
  }));
}

/** The sun: the UV index as a hatched hill each day, the peak marked with a dot. */
function Sun({ id, hours }: { id: string; hours: PlateProps["hours"] }) {
  const n = hours.length;
  const known = hours
    .map((h, i) => (h ? { i, ...h } : null))
    .filter((h): h is NonNullable<typeof h> => Boolean(h));
  if (known.length < 2) return null;
  const top = Math.max(9, Math.max(...known.map((h) => h.uv)));
  const y = (v: number) => BASE - (v / top) * (BASE - TOP);
  const pts = known.map((h) => [xOf(h.i, n), y(h.uv)] as [number, number]);
  const line = smooth(pts);
  const area = `${line} L${r1(pts.at(-1)![0])} ${BASE} L${r1(pts[0][0])} ${BASE} Z`;
  // Each day's peak, where it rises above nothing (not where the forecast simply ends).
  const peaks = known.filter((h, k) => {
    const prev = known[k - 1];
    const next = known[k + 1];
    return prev && next && Math.round(h.uv) >= 1 && h.uv >= prev.uv && h.uv > next.uv;
  });
  return (
    <g>
      {/* The EPA's thresholds, dotted, so a low hill reads as low. */}
      {UV_BANDS.filter((b) => b.at <= top).map((b) => (
        <line
          key={b.at}
          x1={0}
          y1={r1(y(b.at))}
          x2={PW}
          y2={r1(y(b.at))}
          strokeWidth={1}
          strokeDasharray="1 7"
          className="text-ink-faint"
        />
      ))}
      <path d={area} fill={`url(#${id}-hatch)`} stroke="none" className="text-ink-soft" />
      <path d={line} strokeWidth={2.2} />
      {peaks.map((h) => (
        <circle
          key={h.i}
          cx={r1(xOf(h.i, n))}
          cy={r1(y(h.uv))}
          r={4}
          fill="currentColor"
          stroke="none"
        />
      ))}
    </g>
  );
}

/* ---------------------------------------------------------------- figures */

/** A column's figures under the plate, in the same places as the sky's temperatures. */
export function Figures({ f, act }: { f: Figure; act: boolean }) {
  return (
    <div className="flex flex-col items-center text-center">
      <p
        className={`h-[5rem] text-[5rem] leading-none whitespace-nowrap ${f.quiet ? "text-ink-faint" : "text-ink"}`}
      >
        {f.big}
      </p>
      <p
        className={`mt-[0.6rem] flex h-[3rem] items-center gap-[0.6rem] text-[3rem] leading-none whitespace-nowrap ${
          act ? "text-accent" : f.quiet ? "text-ink-faint italic" : "text-ink-soft"
        }`}
      >
        {f.kind ? <Mark kind={f.kind} /> : null}
        {f.sub}
      </p>
      <p className="mt-[1rem] flex h-[3.2rem] items-center gap-[0.5rem] text-[2.5rem] text-ink-faint">
        {f.dir != null && !f.quiet ? (
          <>
            <Vane dir={f.dir} />
            {compass(f.dir)}
          </>
        ) : null}
      </p>
    </div>
  );
}

/**
 * Rain's or snow's key, as an almanac's legend sets one: a small box of the
 * plate's own fill. Slanting strokes for rain, a stipple for snow, half and
 * half for a mix.
 */
function Mark({ kind }: { kind: "rain" | "snow" | "mix" }) {
  const id = `mark-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const strokes = [-6, -1, 4, 9].map((x) => <line key={x} x1={x} y1={-8} x2={x - 5} y2={8} />);
  const dots = [-5.5, -1.5, 2.5, 6.5].flatMap((y, row) =>
    [-5, -1, 3, 7].map((x) => (
      <circle
        key={`${x} ${y}`}
        cx={x - (row % 2) * 2}
        cy={y}
        r={0.95}
        stroke="none"
        fill="currentColor"
      />
    )),
  );
  return (
    <svg
      viewBox="-9 -9 18 18"
      className="size-[2.3rem]"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.1}
      strokeLinecap="round"
      aria-hidden
    >
      <defs>
        <clipPath id={`${id}-a`}>
          <rect x={-8} y={-8} width={kind === "mix" ? 8 : 16} height={16} />
        </clipPath>
        <clipPath id={`${id}-b`}>
          <rect x={kind === "mix" ? 0 : -8} y={-8} width={kind === "mix" ? 8 : 16} height={16} />
        </clipPath>
      </defs>
      {kind !== "snow" ? <g clipPath={`url(#${id}-a)`}>{strokes}</g> : null}
      {kind !== "rain" ? <g clipPath={`url(#${id}-b)`}>{dots}</g> : null}
      <rect x={-8} y={-8} width={16} height={16} strokeWidth={0.9} />
    </svg>
  );
}

/** A small engraved arrow, flying the way the wind blows (from `dir`). */
function Vane({ dir }: { dir: number }) {
  return (
    <svg
      viewBox="-13 -13 26 26"
      className="size-[2.4rem]"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <g transform={`rotate(${dir})`}>
        {/* The shaft runs downwind; the fletching sits upwind, where the wind comes from. */}
        <line x1={0} y1={-8} x2={0} y2={10} strokeWidth={1.4} />
        <path d="M-4 5 L0 10.5 L4 5" strokeWidth={1.4} />
        <path
          d="M0 -8 L-3.5 -11.5 M0 -4.5 L-3.5 -8 M0 -8 L3.5 -11.5 M0 -4.5 L3.5 -8"
          strokeWidth={1}
        />
      </g>
    </svg>
  );
}

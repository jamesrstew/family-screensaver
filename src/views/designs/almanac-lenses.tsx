"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import {
  LENSES,
  LENS_MS,
  hourKind,
  lensOrder,
  nextLens,
  type Figure,
  type Lens,
} from "@/lib/lenses";

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
 *  the air:       the AQI as a hatched hill, a dotted line where it turns
 *                 unhealthy for sensitive groups; it stops where the air
 *                 forecast ends.
 *  feels like:    the thermometer dashed, the feel bold, the chill or the
 *                 heat hatched between.
 *  humidity:      the relative humidity as a hatched hill, very dry dotted.
 *  UV:            the sun's strength as a hatched hill each day, a dotted
 *                 line at "high", where the EPA's advice gets firm.
 *
 * No words sit on a plate: the figures under it say them.
 *
 * Every chart is drawn once, in plain SVG: nothing moves but the ink.
 */

// The plate: 109 x 13.6 rem at 10 units per rem, the same box the sky's engravings fill.
export const PW = 1090;
export const PH = 136;
const TOP = 10;
const BASE = 126;

/** The last lens each view showed, so the next visit carries on from it. */
const lastSeen = new Map<string, Lens>();

/**
 * The lens to show: the sky first, then the next lens every half minute
 * from the moment the view appeared, carrying on after the one last seen.
 * A lens only ever changes at a turn: if the snapshot refreshes mid-turn
 * and the list changes (UV gone at dusk), the lens showing stays its time.
 */
export function useLens(now: Date, lenses: readonly Lens[], view: string): Lens {
  const forced = useForced();
  const t = now.getTime();
  // When the view appeared. A clock that jumps (the page waking, or catching
  // up from the server's time) starts the count again, on the sky.
  const [clock, setClock] = useState({ since: t, last: t });
  if (t !== clock.last) {
    const jumped = t < clock.last || t - clock.last > 60_000;
    setClock({ since: jumped ? t : clock.since, last: t });
  }
  const [after] = useState(() => lastSeen.get(view) ?? null);
  // To the second: the screen's ten-second tick lands a hair short of each turn.
  const turn = Math.floor((Math.round((t - clock.since) / 1000) * 1000) / LENS_MS);
  const [shown, setShown] = useState<{ turn: number; lens: Lens }>({ turn: 0, lens: "sky" });
  if (turn !== shown.turn) {
    setShown({ turn, lens: turn === 0 ? "sky" : nextLens(lensOrder(lenses, after), shown.lens) });
  }
  const lens = forced ?? shown.lens;
  useEffect(() => {
    if (lens !== "sky") lastSeen.set(view, lens);
  }, [lens, view]);
  return lens;
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
  if (lens === "feels") return "Feels like";
  if (lens === "humidity") return "Humidity and dew point";
  if (lens === "air") return "Air quality, US AQI";
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

/** One hour on the plate. The newer readings may be missing from an older report. */
export type PlateHour = {
  precip: number;
  snow: number;
  wind: number;
  gust: number;
  uv: number;
  temp?: number;
  feels?: number;
  rh?: number;
  aqi?: number | null;
  /** A fair chance (30% or more) of what falls: drawn in full; otherwise faint. */
  sure?: boolean;
};

type PlateProps = {
  lens: Exclude<Lens, "sky">;
  /** Hour by hour across the plate; `undefined` where the forecast runs out. */
  hours: Array<PlateHour | undefined>;
  /** Columns under the plate (8 slots of hours, or the days). */
  cols: number;
  scale: number;
  /** Hours to a bar of rain or snow: a week's hours are binned by three, too thin alone. */
  bin?: number;
};

/** One lens's chart across the whole row. */
export function Plate({ lens, hours, cols, scale, bin = 1 }: PlateProps) {
  const id = `plate-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const values = (pick: (h: PlateHour) => number | null | undefined) =>
    hours.map((h) => (h ? (pick(h) ?? undefined) : undefined));
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
      {lens === "precip" ? <Precip id={id} hours={binned(hours, bin)} /> : null}
      {lens === "wind" ? <Wind id={id} hours={hours} /> : null}
      {lens === "feels" ? <Feels id={id} hours={hours} /> : null}
      {lens === "uv" || lens === "air" || lens === "humidity" ? (
        <Hill
          id={id}
          lens={lens}
          values={values((h) => (lens === "uv" ? h.uv : lens === "air" ? h.aqi : h.rh))}
          dots={lens === "uv"}
        />
      ) : null}
    </svg>
  );
}

/** Hours summed in bins of `n`: water and snow added, sure if any hour was. */
function binned(hours: PlateProps["hours"], n: number): PlateProps["hours"] {
  if (n <= 1) return hours;
  return Array.from({ length: Math.ceil(hours.length / n) }, (_, b) => {
    const some = hours.slice(b * n, b * n + n).filter((h): h is PlateHour => Boolean(h));
    if (!some.length) return undefined;
    return {
      ...some[0],
      precip: some.reduce((a, h) => a + h.precip, 0),
      snow: some.reduce((a, h) => a + h.snow, 0),
      sure: some.some((h) => h.sure !== false),
    };
  });
}

/**
 * Rain and snow: each run of wet hours as a stepped silhouette, filled by its
 * kind. What has only a slim chance is drawn faint.
 */
function Precip({ id, hours }: { id: string; hours: PlateProps["hours"] }) {
  const n = hours.length;
  const w = PW / n;
  const most = Math.max(0.1, ...hours.map((h) => h?.precip ?? 0));
  const y = (water: number) => BASE - Math.max((water / most) * (BASE - TOP), 4);
  // Runs of neighboring hours of the same kind and the same certainty.
  const runs: Array<{ kind: "rain" | "snow"; sure: boolean; from: number; to: number }> = [];
  hours.forEach((h, i) => {
    const kind = h ? hourKind(h.precip, h.snow) : null;
    const sure = h?.sure !== false;
    const last = runs.at(-1);
    if (!kind) return;
    if (last && last.kind === kind && last.sure === sure && last.to === i) last.to = i + 1;
    else runs.push({ kind, sure, from: i, to: i + 1 });
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
            className={!r.sure ? "text-ink-faint" : r.kind === "snow" ? "text-ink-soft" : undefined}
            stroke="currentColor"
          />
        );
      })}
    </g>
  );
}

/** Two smooth strokes and the space between them hatched: a band. */
function bandPath(upper: Array<[number, number]>, lower: Array<[number, number]>): string {
  return `${smooth(upper)} L${r1(lower.at(-1)![0])} ${r1(lower.at(-1)![1])} ${smooth(
    [...lower].reverse(),
  ).replace(/^M/, "L")} Z`;
}

/** The hours that have a reading for `pick`, with their place on the plate. */
function knownOf<T extends object>(hours: Array<T | undefined>, pick: (h: T) => boolean) {
  const out: Array<{ i: number; h: T }> = [];
  hours.forEach((h, i) => {
    if (h && pick(h)) out.push({ i, h });
  });
  return out;
}

/** Wind: the sustained speed, one stroke; the gusts a fine line above it, hatched between. */
function Wind({ id, hours }: { id: string; hours: PlateProps["hours"] }) {
  const n = hours.length;
  const known = knownOf(hours, () => true);
  if (known.length < 2) return null;
  const top = Math.max(20, Math.ceil(Math.max(...known.map(({ h }) => h.gust)) / 10) * 10);
  const y = (v: number) => BASE - (v / top) * (BASE - TOP);
  const speed = known.map(({ i, h }) => [xOf(i, n), y(h.wind)] as [number, number]);
  const gust = known.map(
    ({ i, h }) => [xOf(i, n), y(Math.max(h.gust, h.wind))] as [number, number],
  );
  return (
    <g>
      <path
        d={bandPath(gust, speed)}
        fill={`url(#${id}-hatch)`}
        stroke="none"
        className="text-ink-soft"
      />
      <path d={smooth(gust)} strokeWidth={0.9} className="text-ink-soft" />
      <path d={smooth(speed)} strokeWidth={2.4} />
    </g>
  );
}

/**
 * How it feels: the thermometer as a fine line, the feel as one bold stroke,
 * and the difference (the wind's chill, or the heat's weight) hatched between.
 */
function Feels({ id, hours }: { id: string; hours: PlateProps["hours"] }) {
  const n = hours.length;
  const known = knownOf(hours, (h) => h.temp != null && h.feels != null);
  if (known.length < 2) return null;
  const all = known.flatMap(({ h }) => [h.temp!, h.feels!]);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = Math.max(hi - lo, 15);
  const y = (v: number) => BASE - 4 - ((v - lo) / span) * (BASE - TOP - 8);
  const air = known.map(({ i, h }) => [xOf(i, n), y(h.temp!)] as [number, number]);
  const feel = known.map(({ i, h }) => [xOf(i, n), y(h.feels!)] as [number, number]);
  return (
    <g>
      <path
        d={bandPath(air, feel)}
        fill={`url(#${id}-hatch)`}
        stroke="none"
        className="text-ink-soft"
      />
      <path d={smooth(air)} strokeWidth={0.9} strokeDasharray="5 4" className="text-ink-soft" />
      <path d={smooth(feel)} strokeWidth={2.4} />
    </g>
  );
}

/**
 * One dotted line across each hill, where the advice begins: UV 6 (the EPA's
 * "high"), AQI 101 (unhealthy for sensitive groups), humidity 15% (very dry).
 * No words on the plate; the figures say them.
 */
const LINE: Record<"uv" | "air" | "humidity", number> = { uv: 6, air: 101, humidity: 15 };

/** The top of a hill's scale: room for its line, and the peak. */
const topOf = (lens: "uv" | "air" | "humidity", peak: number) =>
  lens === "uv" ? Math.max(9, peak) : lens === "air" ? Math.max(170, peak * 1.1) : 100;

/**
 * A reading drawn as a hatched hill: the sun's UV (each day's peak dotted),
 * the AQI, the humidity. Hours with no reading (past the end of the air
 * forecast) are left bare: the line simply stops.
 */
function Hill({
  id,
  lens,
  values,
  dots,
}: {
  id: string;
  lens: "uv" | "air" | "humidity";
  values: Array<number | undefined>;
  dots: boolean;
}) {
  const n = values.length;
  const known = knownOf(
    values.map((v) => (v == null ? undefined : { v })),
    () => true,
  ).map(({ i, h }) => ({ i, v: h.v }));
  if (known.length < 2) return null;
  const top = topOf(lens, Math.max(...known.map((k) => k.v)));
  const y = (v: number) => BASE - (Math.min(v, top) / top) * (BASE - TOP);
  const pts = known.map((k) => [xOf(k.i, n), y(k.v)] as [number, number]);
  const line = smooth(pts);
  const area = `${line} L${r1(pts.at(-1)![0])} ${BASE} L${r1(pts[0][0])} ${BASE} Z`;
  // Each day's peak, where it rises above nothing (not where the forecast simply ends).
  const peaks = dots
    ? known.filter((k, j) => {
        const prev = known[j - 1];
        const next = known[j + 1];
        return prev && next && Math.round(k.v) >= 1 && k.v >= prev.v && k.v > next.v;
      })
    : [];
  return (
    <g>
      <line
        x1={0}
        y1={r1(y(LINE[lens]))}
        x2={PW}
        y2={r1(y(LINE[lens]))}
        strokeWidth={1}
        strokeDasharray="1 7"
        className="text-ink-faint"
      />
      <path d={area} fill={`url(#${id}-hatch)`} stroke="none" className="text-ink-soft" />
      <path d={line} strokeWidth={2.2} />
      {peaks.map((k) => (
        <circle
          key={k.i}
          cx={r1(xOf(k.i, n))}
          cy={r1(y(k.v))}
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
        className={`mt-[0.6rem] h-[3rem] leading-none whitespace-nowrap ${f.small ? "text-[2.6rem]" : "text-[3rem]"} ${
          act ? "text-accent" : f.quiet ? "text-ink-faint italic" : "text-ink-soft"
        }`}
      >
        {f.sub}
      </p>
      <div className="mt-[0.6rem] flex h-[3.6rem] items-center text-[2.5rem] whitespace-nowrap text-ink-faint">
        {f.dir != null && !f.quiet ? <Vane dir={f.dir} /> : f.note}
      </div>
    </div>
  );
}

/**
 * An arrow flying the way the wind blows: downwind, as a person feels it and
 * as a map draws it (`dir` is where the wind comes from). A plain shaft and
 * an open head, big enough to read across the room; the sentence names the
 * direction in words.
 */
function Vane({ dir }: { dir: number }) {
  return (
    <svg
      viewBox="-13 -13 26 26"
      className="size-[4rem] text-ink-soft"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.9}
      aria-hidden
    >
      <g transform={`rotate(${dir})`}>
        <line x1={0} y1={-10} x2={0} y2={10} />
        <path d="M-5 4 L0 10.5 L5 4" />
      </g>
    </svg>
  );
}

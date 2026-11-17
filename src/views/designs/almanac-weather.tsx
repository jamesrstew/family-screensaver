"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Ink } from "@/components/Ink";
import {
  CHANCE,
  hourFall,
  hoursLine,
  outlook,
  partFromDay,
  precipKind,
  skyOf,
  weekLine,
  type Outlook,
} from "@/lib/forecast";
import {
  daysPrecipLine,
  daysUvLine,
  daysWindLine,
  hoursPrecipLine,
  hoursUvLine,
  hoursWindLine,
  airFigure,
  daysAirLine,
  daysFeelsLine,
  daysHumidityLine,
  feelsDayFigure,
  feelsFigure,
  hoursAirLine,
  hoursFeelsLine,
  hoursHumidityLine,
  humidityDayFigure,
  humidityFigure,
  hazeOf,
  hourNow,
  lensesFor,
  restOfDay,
  type LensDay,
  meanDir,
  precipFigure,
  kindsIn,
  uvFigure,
  windFigure,
  type Figure,
  type Lens,
} from "@/lib/lenses";
import { dayFeels, hourFeel } from "@/lib/feel";
import { airNow, ozoneLeads, smokeOf, smokeOver } from "@/lib/smoke";
import { addDays, dayKey, parts, weekdayOf } from "@/lib/time";
import type { Condition } from "@/lib/wear";
import type { Weather as Sky } from "@/lib/types";
import { Engraving, Moon, moonAge } from "../Engraving";
import type { ViewProps } from "../parts";
import { Figures, Plate, captionOf, useLens, type PlateHour } from "./almanac-lenses";
import { fitStyle, hourWord } from "./common";

/*
 * The weather, four views. Each stands alone: as the Weather page (Now is the
 * default) and as a turn in home's carousel between quotes and photographs.
 * No header, no clock: one idea each.
 *
 * Every view answers in the same words (from `forecast.ts`). The oxblood
 * accent marks the one thing to act on: rain or snow when it's coming,
 * otherwise bad air when there is some, otherwise what to wear.
 *
 *  now:    the sky that matters, engraved; what it's like and what to wear.
 *  ribbon: the next 24 hours as one band of time; night shaded, rain falling in it.
 *  days:   the week as a row of engraved days, the weekend marked.
 *  hours:  the next day as a row of engraved hours, the night marked.
 *
 * ?weather= picks one on the Weather page (old letters still work).
 */

export type WeatherStyle = "now" | "ribbon" | "days" | "hours";
const STYLES: Record<string, WeatherStyle> = {
  now: "now",
  answer: "now",
  sky: "now",
  a: "now",
  c: "now",
  ribbon: "ribbon",
  b: "ribbon",
  days: "days",
  d: "days",
  hours: "hours",
  e: "hours",
};

const noop = () => () => {};
/** The view the weather page was asked for (?weather=), Now by default. */
export function useAsked(): WeatherStyle {
  const asked = useSyncExternalStore(
    noop,
    () => new URLSearchParams(window.location.search).get("weather") ?? "",
    () => "",
  );
  return STYLES[asked.toLowerCase()] ?? "now";
}

/** The weather page (?weather= picks a view), or one view of it as a slide on home. */
export function Weather({ view, ...props }: ViewProps & { view?: WeatherStyle }) {
  const asked = useAsked();
  const style = view ?? asked;
  const w = props.snapshot.weather;
  // The day's advice is held on the TV (not on the server, which renders afresh).
  const o = w
    ? outlook(
        w,
        props.now,
        props.snapshot.timeZone,
        typeof window === "undefined" ? undefined : HOLD,
      )
    : null;
  const key = o?.held.key;
  const condition = o?.held.condition;
  useEffect(() => {
    if (key && condition) HOLD.set(key, condition);
  }, [key, condition]);
  if (!w || !o) {
    return (
      <Ink className="flex h-full items-center justify-center">
        <p className="text-[3rem] text-ink-soft italic">The sky hasn&rsquo;t reported in yet.</p>
      </Ink>
    );
  }
  if (style === "ribbon") return <Ribbon {...props} w={w} o={o} />;
  if (style === "days") return <Days {...props} w={w} o={o} />;
  if (style === "hours") return <Hours {...props} w={w} o={o} />;
  return <Now {...props} w={w} o={o} />;
}

type Drawn = ViewProps & { w: Sky; o: Outlook };

/**
 * What the day's coat line was chosen for, kept for the session so it can't
 * flip back and forth on a forecast hovering at a line (wear.ts). Empty at
 * first load, so the TV's first drawing matches the server's.
 */
const HOLD = new Map<string, Condition>();

/** Rain or snow on the way: that's the news. Otherwise, what to wear. */
const urgent = (o: Outlook) => Boolean(o.spell);

/* ------------------------------------------------------------------ b */

// The ribbon: 109 x 27 rem at 10 units per rem.
const RW = 1090;
const RH = 270;
const BAND = { top: 168, bottom: 228 };
const CURVE = { top: 34, bottom: 132 };
const HOUR = 3_600_000;

function Ribbon({ w, o, now, snapshot }: Drawn) {
  const tz = snapshot.timeZone;
  const hours = w.hours.filter((h) => Date.parse(h.time) + HOUR > now.getTime()).slice(0, 24);
  const act = urgent(o);
  return (
    <div className="flex h-full flex-col">
      <Ink order={0} className="pt-[2rem] text-center">
        <p className="mx-auto max-w-[106rem] text-balance" style={headline(o.line, 106, 15)}>
          {nb(o.line)}
        </p>
      </Ink>
      <div className="flex flex-1 items-center">
        {hours.length > 3 ? (
          <Ink order={1} mode="seep" className="w-full">
            <Band w={w} hours={hours} now={now} tz={tz} />
          </Ink>
        ) : null}
      </div>
      <Ink order={2} className="text-center">
        <p className="text-[3.6rem] leading-[1.22] text-balance italic">
          {o.timing ? (
            <span className={act ? "text-accent" : "text-ink-soft"}>{nb(o.timing)} </span>
          ) : null}
          <span className={act ? "text-ink-soft" : "text-accent"}>{o.air ?? o.wear}</span>
        </p>
      </Ink>
      {o.ahead ? (
        <Ink order={3} mode="seep" className="mt-[1.4rem] text-center">
          <p className="text-[2.6rem] text-ink-faint italic">{o.ahead && nb(o.ahead)}</p>
        </Ink>
      ) : null}
    </div>
  );
}

/** A stretch of hours under one sky: all day, or all night. */
type Stretch = { from: number; to: number; day: boolean };

function stretches(w: Sky, hours: Sky["hours"]): Stretch[] {
  const rise = Date.parse(w.today.sunrise);
  const set = Date.parse(w.today.sunset);
  const DAY = 86_400_000;
  const isDay = (t: number) => {
    const k = Math.floor((t - rise) / DAY);
    const r = rise + k * DAY;
    const s = set + k * DAY;
    return t >= r && t < s;
  };
  const out: Stretch[] = [];
  hours.forEach((h, i) => {
    const d = h.isDay ?? isDay(Date.parse(h.time) + HOUR / 2);
    const last = out.at(-1);
    if (last && last.day === d) last.to = i + 1;
    else out.push({ from: i, to: i + 1, day: d });
  });
  return out;
}

function Band({ w, hours, now, tz }: { w: Sky; hours: Sky["hours"]; now: Date; tz: string }) {
  const n = hours.length;
  const col = RW / n;
  const xc = (i: number) => (i + 0.5) * col;
  // The line starts where the sentence does: at the temperature right now.
  const temps = hours.map((h, i) => (i === 0 ? w.now.temp : h.temp));
  const lo = Math.min(...temps);
  const hi = Math.max(...temps);
  const span = Math.max(hi - lo, 8);
  const y = (t: number) => CURVE.bottom - ((t - lo) / span) * (CURVE.bottom - CURVE.top);

  // One smooth stroke through every hour (Catmull-Rom as cubic Béziers).
  const pts = temps.map((t, i) => [xc(i), y(t)] as const);
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[Math.max(i - 1, 0)];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const [x3, y3] = pts[Math.min(i + 2, pts.length - 1)];
    d += ` C${(x1 + (x2 - x0) / 6).toFixed(1)} ${(y1 + (y2 - y0) / 6).toFixed(1)} ${(x2 - (x3 - x1) / 6).toFixed(1)} ${(y2 - (y3 - y1) / 6).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }

  // The temperatures worth writing down: now, the turning points, the end.
  const marks = new Set<number>([0, n - 1]);
  const hiAt = temps.indexOf(hi);
  const loAt = temps.indexOf(lo);
  for (const i of [hiAt, loAt]) if (i > 2 && i < n - 3) marks.add(i);
  const sorted = [...marks].sort((a, b) => a - b);
  const kept = sorted.filter((i, k) => k === 0 || i - sorted[k - 1] >= 4 || i === n - 1);

  const spans = stretches(w, hours);
  const pctX = (x: number) => `${((x / RW) * 100).toFixed(3)}%`;
  const pctY = (v: number) => `${((v / RH) * 100).toFixed(3)}%`;

  return (
    <div className="relative h-[27rem] w-full">
      <svg
        viewBox={`0 0 ${RW} ${RH}`}
        className="absolute inset-0 h-full w-full text-ink"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        aria-hidden
      >
        <defs>
          {spans.map((s, i) =>
            s.day ? null : (
              <clipPath key={i} id={`night${i}`}>
                <rect
                  x={s.from * col}
                  y={BAND.top}
                  width={(s.to - s.from) * col}
                  height={BAND.bottom - BAND.top}
                />
              </clipPath>
            ),
          )}
        </defs>
        {/* The band's edges: two fine rules. */}
        <line
          x1={0}
          y1={BAND.top}
          x2={RW}
          y2={BAND.top}
          strokeWidth={1}
          className="text-ink-faint"
        />
        <line
          x1={0}
          y1={BAND.bottom}
          x2={RW}
          y2={BAND.bottom}
          strokeWidth={1}
          className="text-ink-faint"
        />
        {/* Night: the engraver's shading, fine horizontal lines. */}
        {spans.map((s, i) =>
          s.day ? null : (
            <g key={i} clipPath={`url(#night${i})`} strokeWidth={0.8} className="text-ink-soft">
              {Array.from({ length: Math.ceil((BAND.bottom - BAND.top) / 4) }, (_, k) => (
                <line key={k} x1={0} y1={BAND.top + 2 + k * 4} x2={RW} y2={BAND.top + 2 + k * 4} />
              ))}
            </g>
          ),
        )}
        {/* The moon rides each long night, in its true phase. */}
        {spans.map((s, i) =>
          s.day || s.to - s.from < 4 ? null : (
            <g key={i} className="text-ink" strokeWidth={1}>
              <circle
                cx={((s.from + s.to) / 2) * col}
                cy={(BAND.top + BAND.bottom) / 2}
                r={21}
                fill="var(--paper)"
                stroke="none"
              />
              <Moon
                age={moonAge(now)}
                cx={((s.from + s.to) / 2) * col}
                cy={(BAND.top + BAND.bottom) / 2}
                r={16}
              />
            </g>
          ),
        )}
        {/* Rain, snow, and storms fall through the band in the hours they're due. */}
        {hours.map((h, i) => {
          const f = hourFall(h);
          if (!f || f.sure === "slight") return null;
          const dense = f.sure === "likely" ? 1 : 0.5;
          return <Fall key={h.time} kind={f.kind} x={i * col} w={col} dense={dense} seed={i} />;
        })}
        {/* The temperature, one stroke of ink. */}
        <path d={d} strokeWidth={2.4} />
        {kept.map((i) => (
          <circle key={i} cx={pts[i][0]} cy={pts[i][1]} r={4} fill="currentColor" stroke="none" />
        ))}
      </svg>
      {/* Numbers on the line. */}
      {kept.map((i) => (
        <p
          key={i}
          className="absolute -translate-x-1/2 -translate-y-full pb-[1.2rem] text-[3.6rem] leading-none text-ink"
          style={{ left: pctX(Math.min(Math.max(pts[i][0], 30), RW - 30)), top: pctY(pts[i][1]) }}
        >
          {temps[i]}°
        </p>
      ))}
      {/* The hours, every three. */}
      {hours.map((h, i) => {
        if (i % 3 !== 0) return null;
        const label = i === 0 ? "now" : hourWord(h.time, tz);
        return (
          <p
            key={h.time}
            className="absolute -translate-x-1/2 pt-[1rem] text-[2.5rem] whitespace-nowrap text-ink-soft italic"
            style={{ left: pctX(Math.max(xc(i), 24)), top: pctY(BAND.bottom) }}
          >
            {label}
          </p>
        );
      })}
    </div>
  );
}

/** What falls in one hour's column of the band. */
function Fall({
  kind,
  x,
  w,
  dense,
  seed,
}: {
  kind: "rain" | "snow" | "storms";
  x: number;
  w: number;
  dense: number;
  seed: number;
}) {
  const count = dense === 1 ? 3 : 2;
  const top = BAND.top + 10;
  const h = BAND.bottom - BAND.top - 20;
  // A regular hand: marks in a staggered lattice, as an engraver would set them.
  return (
    <g>
      {Array.from({ length: count }, (_, k) => {
        const cx = x + w / 2 + (k % 2 === seed % 2 ? -w / 4 : w / 4);
        const cy = top + (k / (count - 1)) * h;
        if (kind === "snow") {
          return (
            <g key={k} strokeWidth={1.2}>
              <circle cx={cx} cy={cy} r={6.5} fill="var(--paper)" stroke="none" />
              {[0, 60, 120].map((a) => (
                <line
                  key={a}
                  x1={cx - 5}
                  y1={cy}
                  x2={cx + 5}
                  y2={cy}
                  transform={`rotate(${a} ${cx} ${cy})`}
                />
              ))}
            </g>
          );
        }
        const len = 13;
        return (
          <g key={k}>
            <line
              x1={cx + 3}
              y1={cy - len / 2}
              x2={cx - 3}
              y2={cy + len / 2}
              stroke="var(--paper)"
              strokeWidth={4.5}
            />
            <line x1={cx + 3} y1={cy - len / 2} x2={cx - 3} y2={cy + len / 2} strokeWidth={1.6} />
          </g>
        );
      })}
      {kind === "storms" && seed % 2 === 0 ? (
        <path
          d={`M${x + w * 0.55} ${BAND.top + 8} l-9 22 h8 l-6 20 l16 -26 h-8 l6 -16 Z`}
          fill="currentColor"
          stroke="var(--paper)"
          strokeWidth={1.5}
        />
      ) : null}
    </g>
  );
}

/* ------------------------------------------------------------------ now */

/**
 * Now: the answer, set large under the living sky (which is itself the
 * weather, so no icon). The sentence says what it's like and where it's
 * going; the two italic lines say what's coming and what to wear. The rest
 * of the day sits along the foot in words.
 */
function Now({ o }: Drawn) {
  const act = urgent(o);
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-[6rem] text-center">
        <Ink order={1}>
          <p
            className="max-w-[104rem] text-balance"
            style={headline(o.line, 104, o.timing ? 30 : 36)}
          >
            {nb(o.line)}
          </p>
        </Ink>
        {o.timing ? (
          <Ink order={2} className="mt-[2.2rem]">
            <p
              className={`text-[3.8rem] leading-[1.2] text-balance italic ${act ? "text-accent" : "text-ink-soft"}`}
            >
              {nb(o.timing)}
            </p>
          </Ink>
        ) : null}
        <Ink order={3} className={o.timing ? "mt-[1.2rem]" : "mt-[2.2rem]"}>
          <p
            className={`leading-[1.2] text-balance italic ${act ? "text-ink-soft" : "text-accent"}`}
            // As large as keeps it to one line across the page (3.8 rem at most).
            style={{ ...fitStyle(o.air ?? o.wear, { w: 94, h: 4.8 }, ADVICE), lineHeight: 1.2 }}
          >
            {/* Bad air takes the coat's place: it's the thing to act on. */}
            {o.air ?? o.wear}
          </p>
        </Ink>
      </div>
      {/* The rest of the day, in words, under one fine rule. */}
      <Ink order={4} mode="seep" className="grid grid-cols-3 border-t border-rule pt-[1.8rem]">
        {/* Set like an almanac's table: when, then what, two short lines each. */}
        {o.parts.map((p, i) => (
          <div
            key={p.label}
            className={`text-[2.6rem] leading-[1.25] whitespace-nowrap text-ink-soft ${i === 0 ? "text-left" : i === 1 ? "text-center" : "text-right"}`}
          >
            <p className="text-ink-faint italic">{p.label}</p>
            <p>
              <span className="text-ink">{p.temp}°</span> {p.high ? "high" : "low"},{" "}
              {lower(p.words)}
            </p>
          </div>
        ))}
      </Ink>
      {o.ahead ? (
        <Ink order={5} mode="seep" className="mt-[1rem] text-center">
          <p className="text-[2.5rem] text-ink-faint italic">{nb(o.ahead)}</p>
        </Ink>
      ) : null}
    </div>
  );
}

const lower = (s: string) => s[0].toLowerCase() + s.slice(1);

/** The advice line: one line across the page, 3.8 rem when it fits, never under 2.8. */
const ADVICE = { max: 3.8, min: 2.8, italic: true };

/**
 * Each view's sentence, as large as its space allows (fit.ts): a short answer
 * is set big, a long one still fits. `w` and `h` are the room it has, in rem.
 */
const headline = (text: string, w: number, h: number) =>
  fitStyle(nb(text), { w, h }, { max: 8, min: 4.4 });

/** Keep "10 p.m.", "17 mph", and "about 7" together on one line. */
const nb = (s: string) =>
  s.replace(/(\d) (a\.m\.|p\.m\.|mph)/g, "$1\u00a0$2").replace(/about (\d)/g, "about\u00a0$1");

/* ------------------------------------------------------------------ lenses */

/*
 * Days and Hours turn slowly through their lenses (lenses.ts): the sky, then
 * rain and snow, the air, how it feels, wind, humidity, and UV, each for half
 * a minute, skipping any with nothing to say. The row's labels stay put, and
 * so does the lens's name when it doesn't change. A turn goes in order, so
 * one lens's sentence never sits over another's figures: the plate sinks,
 * leaving the old sentence over a bare row; then the sentence turns; then
 * the new plate soaks in under it. The page is never blank.
 */

/** The sentence holds this long after the plate starts to sink. */
const SENTENCE_LAG_MS = 1200;
/** The plate's paper stays bare this long, so the new sentence comes first. */
const PLATE_REST_MS = 1600;

type Column = { key: string; label: string; rule: boolean; strong: boolean };

/** As many columns as there are days or slots: a short forecast still fills the row. */
const gridOf = (n: number) => ({ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` });

/** The row's labels, which stay still while the lenses turn under them. */
function Labels({ cols }: { cols: Column[] }) {
  return (
    <Ink order={1} mode="seep" className="grid" style={gridOf(cols.length)}>
      {cols.map((c) => (
        <div key={c.key} className="relative text-center">
          {/* The weekend, or the night: one fine rule over its columns. */}
          {c.rule ? <div className="absolute inset-x-0 -top-[2.6rem] h-px bg-rule" /> : null}
          <p
            className={`text-[2.7rem] whitespace-nowrap italic ${c.strong ? "text-ink" : "text-ink-soft"}`}
          >
            {c.label}
          </p>
        </div>
      ))}
    </Ink>
  );
}

/**
 * The sentence over the row, with the lens's name above it (the sky goes
 * unnamed). The name has its own ink, so it holds when it doesn't change.
 * Its box leaves the row's fine rule room to breathe.
 */
function Sentence({ lens, line, caption }: { lens: Lens; line: string; caption: string | null }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-[3rem] text-center">
      <Ink k={caption ?? ""} lag={SENTENCE_LAG_MS} plain order={0}>
        {caption ? (
          <p className="mb-[1.2rem] text-[2.6rem] text-ink-faint italic in-data-[mood=night]:text-ink-soft">
            {caption}
          </p>
        ) : null}
      </Ink>
      <Ink k={lens} lag={SENTENCE_LAG_MS} plain order={0}>
        <p
          className="max-w-[102rem] text-balance"
          style={headline(line, 102, caption ? 16.5 : 20.5)}
        >
          {nb(line)}
        </p>
      </Ink>
    </div>
  );
}

/**
 * A lens's plate and its columns of figures. The plate keeps to the row's
 * columns even when the forecast runs short (the missing hours are blank),
 * and the accent goes to the strongest column that needs it.
 */
function LensBody({
  lens,
  hours,
  figures,
  scale,
  bin,
}: {
  lens: Exclude<Lens, "sky">;
  /** Hour by hour, the same number for each column, in order. */
  hours: Array<PlateHour | undefined>;
  figures: Figure[];
  scale: number;
  bin?: number;
}) {
  const acted = figures.reduce(
    (best, f, i) => (f.act && (best < 0 || (f.score ?? 0) > (figures[best].score ?? 0)) ? i : best),
    -1,
  );
  return (
    <>
      <Plate lens={lens} hours={hours} cols={figures.length} scale={scale} bin={bin} />
      <div className="grid pt-[13.6rem]" style={gridOf(figures.length)}>
        {figures.map((f, i) => (
          <Figures key={i} f={f} act={i === acted} />
        ))}
      </div>
    </>
  );
}

/** A Weather hour or a day's hour as the plate wants it. */
const plateHour = (
  h: {
    precip?: number;
    snow?: number;
    wind?: number;
    gust?: number;
    uv?: number;
    temp?: number;
    feels?: number;
    rh?: number;
    aqi?: number | null;
  },
  sure: boolean,
  past = false,
): PlateHour => ({
  precip: h.precip ?? 0,
  snow: h.snow ?? 0,
  wind: h.wind ?? 0,
  gust: h.gust ?? 0,
  uv: h.uv ?? 0,
  temp: h.temp,
  feels: h.feels,
  rh: h.rh,
  aqi: h.aqi,
  sure,
  past,
});

const r2 = (x: number) => Math.round(x * 100) / 100;

/* ------------------------------------------------------------------ d */

function Days({ w, now, snapshot }: Drawn) {
  const tz = snapshot.timeZone;
  const today = dayKey(now, tz);
  // After 5 p.m. today is done: the week starts tomorrow, as the sentence does.
  const late = parts(now, tz).hour >= 17;
  const days = w.days.filter((d) => d.date > today || (d.date === today && !late)).slice(0, 7);
  const weekend = (k: string) => {
    const wd = new Date(`${k}T12:00:00Z`).getUTCDay();
    return wd === 0 || wd === 6;
  };
  const labelOf = (k: string) =>
    k === today ? "Today" : k === addDays(today, 1) ? "Tomorrow" : weekdayOf(k);
  const nameOf = (k: string) =>
    k === today || k === addDays(today, 1) ? lower(labelOf(k)) : labelOf(k);

  // The lenses look ahead: today counts only its hours still to come, with
  // the chance of those hours (the day's own chance includes the morning).
  const todayChance = Math.max(
    0,
    ...w.hours.filter((h) => dayKey(new Date(h.time), tz) === today).map((h) => h.precipChance),
  );
  const ahead: LensDay[] = days.map((d) =>
    d.date === today ? restOfDay(d, hourNow(now, tz), todayChance) : { ...d, from: 0 },
  );
  const left = <T,>(d: LensDay, xs?: T[]) => xs?.slice(d.from) ?? [];
  const lo = (xs: number[]) => (xs.length ? Math.min(...xs) : undefined);
  const hi = (xs: number[]) => (xs.length ? Math.max(...xs) : undefined);

  // The lenses need every day's hours; an older report has none, and shows the sky alone.
  const samples = ahead.map((d) =>
    d.hourly
      ? {
          precip: d.precip,
          snow: d.snow,
          chance: d.precipChance,
          wind: d.wind,
          gust: d.gust,
          uv: d.uv,
          temp: d.high,
          feels: d.hourly.temp && d.feelsHigh,
          tempLow: d.low,
          feelsLow: d.hourly.temp && d.feelsLow,
          rh: lo(left(d, d.hourly.rh)),
          dew: hi(left(d, d.hourly.dew)),
          aqi: d.aqi,
          haze: left(d, d.hourly.pm).reduce<number>((a, pm) => a + hazeOf(pm), 0),
        }
      : {},
  );
  const lens = useLens(now, lensesFor(samples), "days");
  const cols: Column[] = days.map((d) => ({
    key: d.date,
    label: labelOf(d.date),
    rule: weekend(d.date),
    strong: weekend(d.date),
  }));

  const named = ahead.map((d, i) => ({ d, s: samples[i], name: nameOf(d.date) }));
  const line =
    lens === "precip"
      ? daysPrecipLine(
          named.map(({ d, name }) => ({
            name,
            precip: d.precip ?? 0,
            snow: d.snow ?? 0,
            chance: d.precipChance,
            guess: precipKind(d.code),
          })),
        )
      : lens === "wind"
        ? daysWindLine(
            named.map(({ d, name }) => ({
              name,
              lo: lo(left(d, d.hourly?.wind)) ?? 0,
              hi: d.wind ?? 0,
              gust: d.gust ?? 0,
              dir: d.dir,
            })),
          )
        : lens === "uv"
          ? daysUvLine(named.map(({ d, name }) => ({ name, uv: d.uv ?? 0 })))
          : lens === "air"
            ? daysAirLine(
                named.map(({ d, s, name }) => ({
                  name,
                  aqi: d.aqi,
                  haze: s.haze,
                  ozone: d.ozone != null && d.ozone >= (d.aqi ?? 0),
                })),
              )
            : lens === "feels"
              ? daysFeelsLine(
                  named.map(({ d, name }) => ({
                    name,
                    high: d.high,
                    low: d.low,
                    feelsHigh: d.feelsHigh ?? d.high,
                    feelsLow: d.feelsLow ?? d.low,
                  })),
                )
              : lens === "humidity"
                ? daysHumidityLine(
                    named.map(({ d, s, name }) => ({
                      name,
                      rhLow: s.rh ?? 100,
                      dew: s.dew ?? 0,
                      gust: d.gust,
                    })),
                  )
                : weekLine(w, now, tz);

  const figureOf = (d: LensDay, s: (typeof samples)[number]): Figure => {
    if (lens === "precip")
      return precipFigure(d.precip ?? 0, d.snow ?? 0, d.precipChance, precipKind(d.code));
    if (lens === "wind")
      return windFigure(
        lo(left(d, d.hourly?.wind)) ?? d.wind ?? 0,
        d.wind ?? 0,
        d.gust ?? 0,
        d.dir,
      );
    if (lens === "air") return airFigure(d.aqi);
    if (lens === "feels")
      return feelsDayFigure(d.high, d.low, d.feelsHigh ?? d.high, d.feelsLow ?? d.low);
    if (lens === "humidity") return humidityDayFigure(s.rh ?? 0, s.dew ?? 0);
    return uvFigure(d.uv ?? 0);
  };

  return (
    <div className="flex h-full flex-col">
      <Sentence lens={lens} line={line} caption={captionOf(lens, kindsIn(ahead))} />
      <div className="pb-[3rem]">
        <Labels cols={cols} />
        <Ink
          k={lens}
          rest={PLATE_REST_MS}
          plain
          order={2}
          mode="seep"
          className="relative h-[26.4rem]"
        >
          {lens === "sky" ? (
            <div className="grid" style={gridOf(days.length)}>
              {days.map((d) => {
                const p = partFromDay(labelOf(d.date), d);
                // A smoky day's sun is veiled, a hazy day's softened, as the living sky
                // draws them: by fine particles alone (a high-ozone day is clear).
                const smoke = smokeOver(d.hourly?.pm ?? []);
                const veil = smoke === "none" ? undefined : smoke === "haze" ? "haze" : "smoke";
                return (
                  <div key={d.date} className="flex flex-col items-center text-center">
                    <Engraving
                      code={p.code}
                      isDay
                      date={now}
                      veil={veil}
                      className="fine-ink my-[0.8rem] size-[12rem] text-ink"
                    />
                    <p className="text-[5rem] leading-none text-ink">{d.high}°</p>
                    <p className="mt-[0.6rem] text-[3rem] leading-none text-ink-soft">{d.low}°</p>
                    <p className="mt-[1rem] h-[3.2rem] text-[2.5rem] whitespace-nowrap text-ink-soft">
                      {p.wet ? p.words : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <LensBody
              lens={lens}
              scale={1.5}
              bin={3}
              // Each day's 24 hours from midnight, by the family's clock (weather.ts
              // places each hour by its real instant); today's past hours are drawn faint.
              hours={ahead.flatMap((d) => {
                const feels = d.hourly && dayFeels(d.hourly);
                return Array.from({ length: 24 }, (_, h): PlateHour | undefined => {
                  const day = d.hourly;
                  if (!day || h >= day.wind.length) return undefined;
                  return plateHour(
                    {
                      precip: day.precip[h],
                      snow: day.snow[h],
                      wind: day.wind[h],
                      gust: day.gust[h],
                      uv: day.uv[h],
                      temp: day.temp?.[h],
                      feels: feels?.[h],
                      rh: day.rh?.[h],
                      aqi: day.aqi?.[h],
                    },
                    d.precipChance >= CHANCE,
                    h < d.from,
                  );
                });
              })}
              figures={ahead.map((d, i) => figureOf(d, samples[i]))}
            />
          )}
        </Ink>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ hours */

const STEP = 3;
const COLS = 8;

/** Hours: Days' sibling. The next day every three hours, the night marked. */
function Hours({ w, now, snapshot }: Drawn) {
  const tz = snapshot.timeZone;
  // How each hour feels is figured here from its readings (the snapshot doesn't carry it).
  const hours = w.hours
    .filter((h) => Date.parse(h.time) + HOUR > now.getTime())
    .map((h) => ({ ...h, feels: hourFeel(h) }));
  const slots = Array.from({ length: COLS }, (_, i) =>
    hours.slice(i * STEP, i * STEP + STEP),
  ).filter((s) => s.length > 0);
  const span = slots.flat();

  const samples = span.map((h) => ({
    precip: h.precip,
    snow: h.snow,
    chance: h.precipChance,
    wind: h.wind,
    gust: h.gust,
    uv: h.uv,
    temp: h.temp,
    feels: h.feels,
    rh: h.rh,
    dew: h.dew,
    aqi: h.aqi,
    haze: hazeOf(h.pm),
  }));
  const lens = useLens(now, lensesFor(samples), "hours");
  const cols: Column[] = slots.map((slot, i) => {
    const night = !(i === 0 ? w.now.isDay : (slot[0].isDay ?? true));
    return {
      key: slot[0].time,
      label: i === 0 ? "Now" : nb(hourWord(slot[0].time, tz)),
      rule: night,
      strong: night,
    };
  });

  const sum = (xs: Array<number | undefined>) => r2(xs.reduce<number>((a, x) => a + (x ?? 0), 0));
  const most = (xs: Array<number | undefined>) => Math.max(...xs.map((x) => x ?? 0));
  const known = (h: Sky["hours"][number]) => ({
    time: h.time,
    wind: h.wind ?? 0,
    gust: h.gust ?? 0,
    dir: h.dir,
    uv: h.uv ?? 0,
  });
  // Each slot's rain and snow: its sums, and its best chance.
  const wet = slots.map((slot) => ({
    from: slot[0].time,
    to: new Date(Date.parse(slot.at(-1)!.time) + HOUR).toISOString(),
    precip: sum(slot.map((h) => h.precip)),
    snow: sum(slot.map((h) => h.snow)),
    chance: most(slot.map((h) => h.precipChance)),
  }));
  // Each slot's air: its worst hour, and for the slot under way, the air right
  // now (the NowCast), so the sentence and the Now column say the same number.
  const current = slots[0] && Date.parse(slots[0][0].time) <= now.getTime();
  const nowAir = airNow(w.now);
  const air = slots.map((slot, i) => {
    if (i === 0 && current && nowAir != null)
      return { time: slot[0].time, aqi: nowAir, ozone: ozoneLeads(w.now) };
    const known = slot.filter((h) => h.aqi != null);
    const worst = known.length ? known.reduce((a, b) => (b.aqi! > a.aqi! ? b : a)) : slot[0];
    // Ozone makes the hour what it is when its index is the blended one.
    return {
      time: worst.time,
      aqi: worst.aqi,
      ozone: worst.ozone != null && worst.ozone >= (worst.aqi ?? 0),
    };
  });
  // Each slot's feel: its coldest hour (or hottest, when it's the heat that
  // strays), so the sentence quotes a number the columns show.
  const chill =
    Math.max(...span.map((h) => h.temp - (h.feels ?? h.temp))) >=
    Math.max(...span.map((h) => (h.feels ?? h.temp) - h.temp));
  const feel = slots.map((slot) =>
    slot.reduce((a, b) => {
      const fa = a.feels ?? a.temp;
      const fb = b.feels ?? b.temp;
      return chill ? (fb < fa ? b : a) : fb > fa ? b : a;
    }),
  );

  const line =
    lens === "precip"
      ? hoursPrecipLine(
          span.map((h) => ({
            time: h.time,
            precip: h.precip ?? 0,
            snow: h.snow ?? 0,
            chance: h.precipChance,
          })),
          now,
          tz,
        )
      : lens === "wind"
        ? hoursWindLine(span.map(known), now, tz)
        : lens === "uv"
          ? hoursUvLine(span.map(known), now, tz)
          : lens === "air"
            ? hoursAirLine(air, now, tz, {
                smoky: span.some((h) => hazeOf(h.pm)),
                current: Boolean(current && nowAir != null),
              })
            : lens === "feels"
              ? hoursFeelsLine(
                  feel.map((h) => ({ time: h.time, temp: h.temp, feels: h.feels ?? h.temp })),
                  now,
                  tz,
                )
              : lens === "humidity"
                ? hoursHumidityLine(
                    span.map((h) => ({
                      time: h.time,
                      rh: h.rh ?? 50,
                      dew: h.dew ?? 0,
                      gust: h.gust,
                    })),
                    now,
                    tz,
                  )
                : hoursLine(w, now, tz);

  const figures = slots.map((slot, i): Figure => {
    if (lens === "precip") {
      const code = slot.find((h) => h.code != null && precipKind(h.code))?.code;
      return precipFigure(
        wet[i].precip,
        wet[i].snow,
        wet[i].chance,
        code != null ? precipKind(code) : null,
      );
    }
    if (lens === "wind") {
      const hi = most(slot.map((h) => h.wind));
      const dir = meanDir(
        slot.map((h) => h.dir ?? 0),
        slot.map((h) => (h.dir == null ? 0 : (h.wind ?? 0))),
      );
      return windFigure(hi, hi, most(slot.map((h) => h.gust)), dir);
    }
    if (lens === "air") return airFigure(air[i].aqi);
    if (lens === "feels") return feelsFigure(feel[i].feels ?? feel[i].temp, feel[i].temp);
    // The air's water: as the slot begins, like its temperature.
    const first = slot[0];
    if (lens === "humidity") return humidityFigure(first.rh ?? 0, first.dew ?? 0);
    return uvFigure(most(slot.map((h) => h.uv)));
  });
  // UV's words only where they change: "very high" three times running crowds the row.
  const said = figures.map((f, i) =>
    lens === "uv" && i > 0 && f.sub && f.sub === figures[i - 1].sub ? { ...f, sub: "" } : f,
  );

  return (
    <div className="flex h-full flex-col">
      <Sentence lens={lens} line={line} caption={captionOf(lens, kindsIn(span))} />
      <div className="pb-[3rem]">
        <Labels cols={cols} />
        <Ink
          k={lens}
          rest={PLATE_REST_MS}
          plain
          order={2}
          mode="seep"
          className="relative h-[26.4rem]"
        >
          {lens === "sky" ? (
            <div className="grid" style={gridOf(slots.length)}>
              {slots.map((slot, i) => {
                const first = slot[0];
                // The first slot is now: the sky and temperature as they are.
                const code = i === 0 ? w.now.code : skyOf(slot);
                const isDay = i === 0 ? w.now.isDay : (first.isDay ?? true);
                const temp = i === 0 ? w.now.temp : first.temp;
                // Rain or snow only where it counts, with its chance.
                const falls = slot.map(hourFall).filter((f) => f && f.sure !== "slight");
                const chance = falls.length ? Math.max(...slot.map((h) => h.precipChance)) : 0;
                const kind = falls[0]?.kind;
                // Smoke or haze veils the sun, as the living sky draws it.
                const smoke = smokeOf(
                  i === 0 ? w.now : { pm: Math.max(...slot.map((h) => h.pm ?? 0)) },
                );
                const veil = smoke === "haze" ? "haze" : smoke === "none" ? undefined : "smoke";
                return (
                  <div key={first.time} className="flex flex-col items-center text-center">
                    <Engraving
                      code={code}
                      isDay={isDay}
                      date={now}
                      veil={veil}
                      className="fine-ink my-[0.8rem] size-[12rem] text-ink"
                    />
                    <p className="text-[5rem] leading-none text-ink">{temp}°</p>
                    <p className="mt-[1rem] h-[3.2rem] text-[2.5rem] whitespace-nowrap text-ink-soft">
                      {kind ? `${cap(kind === "storms" ? "storms" : kind)} ${chance}%` : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <LensBody
              lens={lens}
              scale={1.7}
              hours={Array.from({ length: slots.length * STEP }, (_, i) => {
                const h = span[i];
                return h ? plateHour(h, h.precipChance >= CHANCE) : undefined;
              })}
              figures={said}
            />
          )}
        </Ink>
      </div>
    </div>
  );
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

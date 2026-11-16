"use client";

import { useSyncExternalStore } from "react";
import { Ink } from "@/components/Ink";
import { hourFall, outlook, partFromDay, weekLine, type Outlook, type Part } from "@/lib/forecast";
import { addDays, dayKey, parts, weekdayOf } from "@/lib/time";
import type { Weather as Sky } from "@/lib/types";
import { Engraving, Moon, moonAge } from "../Engraving";
import type { ViewProps } from "../parts";
import { hourWord } from "./common";

/*
 * The weather page, three ways (under review; ?weather=a|b|c).
 *
 * Every version answers the same questions first, in the same words (from
 * `outlook`): what it's like now and where it's going, whether rain or snow is
 * coming and when, and what to wear. The oxblood accent marks the one thing to
 * act on: the rain or snow when there is some, otherwise what to wear.
 *
 *  a. Answer: the answer in words, then three engraved panes (the rest of the day).
 *  b. Ribbon: the next 24 hours as one band of time; night is shaded, rain falls in it.
 *  c. One Sky: one large engraving of the sky that matters, the answer beneath it.
 *  d. Days: the week ahead as a row of engraved days, the weekend marked.
 *
 * c and d are also built to stand alone in home's slow rotation (between
 * photographs and quotes): no header, no clock, one idea each.
 */

export type WeatherStyle = "answer" | "ribbon" | "sky" | "days";
const STYLES: Record<string, WeatherStyle> = {
  a: "answer",
  b: "ribbon",
  c: "sky",
  d: "days",
  days: "days",
  answer: "answer",
  ribbon: "ribbon",
  sky: "sky",
};

const noop = () => () => {};
function useStyle(): WeatherStyle {
  const asked = useSyncExternalStore(
    noop,
    () => new URLSearchParams(window.location.search).get("weather") ?? "",
    () => "",
  );
  return STYLES[asked.toLowerCase()] ?? "answer";
}

export function Weather(props: ViewProps) {
  const style = useStyle();
  const w = props.snapshot.weather;
  if (!w) {
    return (
      <Ink className="flex h-full items-center justify-center">
        <p className="text-[3rem] text-ink-soft italic">The sky hasn&rsquo;t reported in yet.</p>
      </Ink>
    );
  }
  const o = outlook(w, props.now, props.snapshot.timeZone);
  if (style === "ribbon") return <Ribbon {...props} w={w} o={o} />;
  if (style === "sky") return <OneSky {...props} w={w} o={o} />;
  if (style === "days") return <Days {...props} w={w} o={o} />;
  return <Answer {...props} w={w} o={o} />;
}

type Drawn = ViewProps & { w: Sky; o: Outlook };

/** Rain or snow on the way: that's the news. Otherwise, what to wear. */
const urgent = (o: Outlook) => Boolean(o.spell);

/* ------------------------------------------------------------------ a */

function Answer({ o, now }: Drawn) {
  const act = urgent(o);
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-[6rem] text-center">
        <Ink order={0}>
          <p className="max-w-[88rem] text-[4.6rem] leading-[1.18] text-balance">{nb(o.line)}</p>
        </Ink>
        {o.timing ? (
          <Ink order={1} className="mt-[2.4rem]">
            <p
              className={`text-[3.2rem] leading-[1.2] italic ${act ? "text-accent" : "text-ink-soft"}`}
            >
              {nb(o.timing)}
            </p>
          </Ink>
        ) : null}
        <Ink order={2} className="mt-[1.6rem]">
          <p
            className={`text-[3.2rem] leading-[1.2] italic ${act ? "text-ink-soft" : "text-accent"}`}
          >
            {o.wear}
          </p>
        </Ink>
      </div>
      <Ink order={3} mode="seep" className="grid grid-cols-3 border-t border-rule pt-[2.6rem]">
        {o.parts.map((p, i) => (
          <Pane key={p.label} p={p} first={i === 0} now={now} />
        ))}
      </Ink>
      {o.ahead ? (
        <Ink order={4} mode="seep" className="mt-[1.6rem] text-center">
          <p className="text-[1.85rem] text-ink-faint italic">{o.ahead && nb(o.ahead)}</p>
        </Ink>
      ) : null}
    </div>
  );
}

function Pane({ p, first, now }: { p: Part; first: boolean; now: Date }) {
  return (
    <div
      className={`flex items-center justify-center gap-[1.8rem] ${first ? "" : "border-l border-rule"}`}
    >
      <Engraving
        code={p.code}
        isDay={p.isDay}
        date={now}
        className="size-[8.5rem] shrink-0 text-ink"
      />
      <div>
        <p className="text-[1.85rem] leading-tight text-ink-soft italic">{p.label}</p>
        <p className="text-[3.6rem] leading-[1.05] text-ink">
          {p.temp}°
          <span className="ml-[0.6rem] text-[1.6rem] text-ink-faint italic">
            {p.high ? "high" : "low"}
          </span>
        </p>
        <p className="text-[1.85rem] leading-tight text-ink-soft">{p.words}</p>
      </div>
    </div>
  );
}

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
        <p className="mx-auto max-w-[96rem] text-[4.4rem] leading-[1.18] text-balance">
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
        <p className="text-[3rem] leading-[1.25] italic">
          {o.timing ? (
            <span className={act ? "text-accent" : "text-ink-soft"}>{nb(o.timing)} </span>
          ) : null}
          <span className={act ? "text-ink-soft" : "text-accent"}>{o.wear}</span>
        </p>
      </Ink>
      {o.ahead ? (
        <Ink order={3} mode="seep" className="mt-[1.4rem] text-center">
          <p className="text-[1.85rem] text-ink-faint italic">{o.ahead && nb(o.ahead)}</p>
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
  const temps = hours.map((h) => h.temp);
  const lo = Math.min(...temps);
  const hi = Math.max(...temps);
  const span = Math.max(hi - lo, 8);
  const y = (t: number) => CURVE.bottom - ((t - lo) / span) * (CURVE.bottom - CURVE.top);

  // One smooth stroke through every hour (Catmull-Rom as cubic Béziers).
  const pts = hours.map((h, i) => [xc(i), y(h.temp)] as const);
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
          className="absolute -translate-x-1/2 -translate-y-full pb-[1.2rem] text-[2.6rem] leading-none text-ink"
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
            className="absolute -translate-x-1/2 pt-[1rem] text-[1.6rem] whitespace-nowrap text-ink-soft italic"
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

/* ------------------------------------------------------------------ c */

/** The sky worth drawing big: what's coming if it's wet, otherwise the focus. */
function heroSky(w: Sky, o: Outlook, now: Date): { code: number; isDay: boolean } {
  if (o.spell) {
    const from = Date.parse(o.spell.from);
    const h = w.hours.find((x) => Date.parse(x.time) === from) ?? w.hours[0];
    const f = hourFall(h);
    const code =
      h.code != null && f
        ? h.code
        : o.spell.kind === "snow"
          ? 73
          : o.spell.kind === "storms"
            ? 95
            : 63;
    return { code, isDay: h.isDay ?? true };
  }
  if (o.focus === "tomorrow") {
    const next = o.parts.find((p) => p.label === "Tomorrow" || p.label === "Today");
    if (next) return { code: next.code, isDay: true };
  }
  void now;
  return { code: w.now.code, isDay: w.now.isDay };
}

function OneSky({ w, o, now }: Drawn) {
  const act = urgent(o);
  const sky = heroSky(w, o, now);
  const notes = o.parts.slice(o.focus === "today" ? 1 : 0);
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-[8rem] text-center">
        <Ink order={0} mode="seep" k={`${sky.code}${sky.isDay}`} className="mb-[2.4rem]">
          <Engraving
            code={sky.code}
            isDay={sky.isDay}
            date={now}
            className="size-[16rem] text-ink"
          />
        </Ink>
        <Ink order={1}>
          <p className="max-w-[86rem] text-[4.6rem] leading-[1.16] text-balance">{nb(o.line)}</p>
        </Ink>
        <Ink order={2} className="mt-[2rem]">
          <p className="max-w-[90rem] text-[3rem] leading-[1.25] text-balance italic">
            {o.timing ? (
              <span className={act ? "text-accent" : "text-ink-soft"}>{nb(o.timing)} </span>
            ) : null}
            <span className={act ? "text-ink-soft" : "text-accent"}>{o.wear}</span>
          </p>
        </Ink>
      </div>
      {/* Corner notes: what comes next, written small. */}
      <Ink order={3} mode="seep" className="grid grid-cols-[1fr_auto_1fr] items-end gap-[3rem]">
        {[notes[0], null, notes[1]].map((p, i) =>
          i === 1 ? (
            <p key="ahead" className="text-[1.85rem] text-ink-faint italic">
              {o.ahead && nb(o.ahead)}
            </p>
          ) : p ? (
            <p
              key={p.label}
              className={`text-[1.85rem] text-ink-soft ${i === 2 ? "text-right" : ""}`}
            >
              <span className="text-ink-faint italic">{p.label}, </span>
              {p.temp}° {p.high ? "high" : "low"}, {lower(p.words)}
            </p>
          ) : (
            <span key={i} />
          ),
        )}
      </Ink>
    </div>
  );
}

const lower = (s: string) => s[0].toLowerCase() + s.slice(1);

/** Keep "10 p.m." and "about 7" together on one line. */
const nb = (s: string) =>
  s.replace(/(\d) (a\.m\.|p\.m\.)/g, "$1\u00a0$2").replace(/about (\d)/g, "about\u00a0$1");

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
  return (
    <div className="flex h-full flex-col">
      <Ink order={0} className="flex flex-1 items-center justify-center px-[8rem] text-center">
        <p className="max-w-[88rem] text-[4.4rem] leading-[1.18] text-balance">
          {nb(weekLine(w, now, tz))}
        </p>
      </Ink>
      <Ink order={1} mode="seep" className="grid grid-cols-7 pb-[3rem]">
        {days.map((d) => {
          const label =
            d.date === today
              ? "Today"
              : d.date === addDays(today, 1)
                ? "Tomorrow"
                : weekdayOf(d.date);
          const p = partFromDay(label, d);
          const end = weekend(d.date);
          return (
            <div key={d.date} className="relative flex flex-col items-center text-center">
              {/* The weekend: one fine rule over Saturday and Sunday. */}
              {end ? <div className="absolute inset-x-0 -top-[2.2rem] h-px bg-rule" /> : null}
              <p className={`text-[2rem] italic ${end ? "text-ink" : "text-ink-soft"}`}>{label}</p>
              <Engraving
                code={p.code}
                isDay
                date={now}
                className="my-[0.6rem] size-[9rem] text-ink"
              />
              <p className="text-[3.4rem] leading-none text-ink">{d.high}°</p>
              <p className="mt-[0.5rem] text-[2rem] leading-none text-ink-faint">{d.low}°</p>
              <p className="mt-[1rem] h-[2.4rem] text-[1.85rem] text-ink-soft">
                {p.wet ? p.words : ""}
              </p>
            </div>
          );
        })}
      </Ink>
    </div>
  );
}

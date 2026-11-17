import { memo, type CSSProperties, type ReactNode } from "react";
import { LAND_H, LAND_TOP, landOf } from "@/lib/land";
import { rng } from "@/lib/organic";
import { precipKind } from "@/lib/forecast";
import type { Mood } from "@/lib/time";
import type { Weather } from "@/lib/types";
import { CLOUD, CLOUD_BOX, Cloud, Moon, Star, moonAge } from "../Engraving";
import { ARC, arcAt, placeOf, type Place } from "./arc";

/*
 * The living sky: the Almanac's sheet is a window onto an engraved country.
 *
 * Below the horizon, the land: an imaginary eroded country whose drainage
 * branches like veins toward the horizon, its contours behind, seen in
 * perspective, drifting a little as if from a slow balloon, with the shadows
 * of clouds sliding over it. Above, the real sky: the sun or the moon on its
 * arc, high wisps, cumulus at two depths and long stratus banks, stars that
 * breathe (a few shimmer), rain in fine streaks, snow as dots with a few big
 * crystals, mist, now and then birds or a shooting star, and at the day's
 * ends the sun swelling and sinking behind long horizontal strokes.
 *
 * The sky tells the truth: under overcast or rain there is no blazing sun
 * (a dot on the arc keeps the hour), and no stars through snow.
 *
 * Performance is the design (the TV's GPU is weak): every shape is drawn once,
 * and only whole layers move or fade (CSS transform and opacity, on the
 * compositor). Durations are prime-ish and phases seeded, so nothing visibly
 * repeats; the seed is fixed for the session so the server and the TV draw
 * the same sky. Layers are always present and switched with data-on, so
 * weather changes fade in and out instead of cutting (see living.css).
 */

export type LivingSkyProps = {
  w: Weather | null;
  now: Date;
  mood: Mood;
  /** Home and night draw the sun or moon on its arc; the weather views don't. */
  arc: boolean;
  /** The weather pages whose words sit high (hours, days, ribbon): the sky draws back. */
  quiet: boolean;
  seed: number;
  /**
   * The wall clock at first paint, in seconds (the same on server and TV).
   * Every drift's phase is taken from it, so the sky carries on across a
   * reload instead of starting over from the same place.
   */
  epoch: number;
  /** Week and Ideas draw no sky: it fades out and waits. */
  hidden?: boolean;
};

/** Where a cycle of `dur` seconds stands at the wall clock, offset by `phase0` (0..1). */
const cycleAt = (epoch: number, dur: number, phase0: number) =>
  (((epoch / dur + phase0) % 1) + 1) % 1;

const rem = (n: number) => `${+n.toFixed(3)}rem`;
const on = (b: boolean) => (b ? "1" : "0");
const PRIMES = [
  5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101,
];

/* ---------------------------------------------------------------- the weather, drawn */

export type Cover = "clear" | "fair" | "partly" | "over";

type SkyState = {
  cover: Cover;
  fall: null | "rain" | "snow" | "storms";
  hard: boolean;
  fog: boolean;
  cumulus: number;
  stratus: number;
  wisps: number;
};

export function skyOf(code: number | null): SkyState {
  if (code === null)
    return { cover: "fair", fall: null, hard: false, fog: false, cumulus: 3, stratus: 0, wisps: 3 };
  const fall = precipKind(code) ?? null;
  const fog = code === 45 || code === 48;
  const hard = [63, 65, 67, 73, 75, 77, 81, 82, 86, 95, 96, 99].includes(code);
  const cover: Cover = code === 0 ? "clear" : code === 1 ? "fair" : code === 2 ? "partly" : "over";
  return {
    cover,
    fall,
    hard,
    fog,
    // Never fewer than three moving things in any weather.
    cumulus: { clear: 2, fair: 3, partly: 5, over: fog ? 1 : 2 }[cover],
    stratus: cover === "over" ? (fall ? 3 : 2) : 0,
    wisps: { clear: 3, fair: 3, partly: 2, over: 0 }[cover],
  };
}

/** How the sun or moon shows through the cover: whole, softened, or only a dot on the arc. */
export const bodyLook = (code: number | null, newMoon = false) => {
  const { cover, fall, fog } = skyOf(code);
  if (newMoon || fall || fog || cover === "over") return "dot" as const;
  return cover === "partly" ? ("soft" as const) : ("full" as const);
};

/** Within a day and a half of new moon there's no moon to draw: only the dot. */
export function nearNewMoon(now: Date): boolean {
  const days = moonAge(now) * 29.530588853;
  return days < 1.5 || days > 29.530588853 - 1.5;
}

/** The look of whatever rides the arc right now. */
export const lookOf = (w: Weather, place: Place, now: Date) =>
  bodyLook(w.now.code, place.body.body === "moon" && nearNewMoon(now));

/**
 * How many stars: all on a clear or fair night, the brightest few through
 * partly cloudy skies, none through overcast, fog, rain, or snow, and none
 * when there's no report at all (a quiet sky).
 */
export function starsOf(code: number | null): "all" | "few" | "none" {
  if (code === null) return "none";
  const { cover, fall, fog } = skyOf(code);
  if (fall || fog || cover === "over") return "none";
  return cover === "partly" ? "few" : "all";
}

export function LivingSky({
  w,
  now,
  mood,
  arc,
  quiet,
  seed,
  epoch,
  hidden = false,
}: LivingSkyProps) {
  const sky = skyOf(w ? w.now.code : null);
  const place = w ? placeOf(w, now) : null;
  const look = w && place ? lookOf(w, place, now) : bodyLook(null);
  const night = mood === "night";
  const sun = place?.body.body === "sun";
  const low = sun ? place!.low : 0;
  const dawn = sun && place!.body.t < 0.5 && low > 0;
  const starsLevel = starsOf(w ? w.now.code : null);
  const day = !night;

  return (
    <div
      className="sky"
      aria-hidden
      data-heavy={sky.cover === "over" ? "" : undefined}
      data-quiet={quiet ? "" : undefined}
      data-hidden={hidden ? "" : undefined}
    >
      {/* What never moves is painted first, into the paper itself. Anything
          static painted above a moving layer would need a layer of its own. */}
      <div className="sky-vignette" />
      <Still.Stars seed={seed} show={night} level={starsLevel} part="dust" />
      <Arc place={place} show={arc && Boolean(place)} />
      {/* Then everything alive, back to front. */}
      <Still.Land seed={seed} />
      <Still.Shadows seed={seed} epoch={epoch} show={day && !sky.fall && sky.cover !== "over"} />
      <Light place={place} show={arc && night && look !== "dot"} />
      <Still.Stars seed={seed} show={night} level={starsLevel} part="twinkle" />
      <Still.ShootingStar seed={seed} epoch={epoch} show={night && starsLevel === "all"} />
      <Above>
        <Body place={place} look={look} now={now} show={arc && Boolean(place)} />
        <Streaks place={place} show={arc && low > 0 && look !== "dot"} />
      </Above>
      <Still.Wisps seed={seed} epoch={epoch} count={sky.wisps} />
      <Still.Clouds
        seed={seed}
        epoch={epoch}
        count={sky.cumulus}
        flash={day && sky.fall === "storms"}
        depth="far"
      />
      <Still.Stratus seed={seed} epoch={epoch} count={sky.stratus} />
      <Still.Clouds
        seed={seed}
        epoch={epoch}
        count={sky.cumulus}
        flash={day && sky.fall === "storms"}
        depth="near"
      />
      <Still.Birds seed={seed} epoch={epoch} show={day && !sky.fall && sky.cover !== "over"} />
      <Still.Mist seed={seed} fog={sky.fog} dawn={dawn && !sky.fall} />
      <Still.Fall kind={sky.fall} hard={sky.hard} quiet={quiet} night={night} />
      {/* A quiet clearing of paper behind the words, painted once. */}
      <Layer show={arc} className="sky-clearing sky-clearing-hero" />
      <Layer show={arc} className="sky-clearing sky-clearing-notes" />
      <Layer show={!arc} className="sky-clearing sky-clearing-wide" />
    </div>
  );
}

/** A layer that can come and go: fades in and out when its data-on changes. */
function Layer({
  show,
  className = "",
  style,
  children,
}: {
  show: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div className={`sky-layer ${className}`} data-on={on(show)} style={style}>
      {children}
    </div>
  );
}

/** The sky above the horizon: what sets behind the land is clipped here. */
function Above({ children }: { children: ReactNode }) {
  return (
    <div className="sky-above" style={{ height: rem(ARC.cy) }}>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- the land */

// Below the horizon, the paper is land (src/lib/land.ts): rivers branching
// like veins toward the horizon, contours behind, drawn on the server as one
// cached image, so the TV computes nothing and its HTML stays small. Two
// bands of the same image, far and near, drift at their own speeds
// (parallax); each holds the day and the night drawing, which cross-fade with
// the paper. If the image can't load, there's simply no land.
const SPLIT = 45; // rem: the far land above, the near land below

function Land({ seed }: { seed: number }) {
  const band = (from: number, to: number, className: string) => (
    <div
      className={`sky-land-band ${className}`}
      style={{ top: rem(from), height: rem(to - from) }}
    >
      {(["day", "night"] as const).map((tone) => (
        // eslint-disable-next-line @next/next/no-img-element -- a fixed SVG drawing, no optimizing to do
        <img
          key={tone}
          src={`/land/${landOf(seed)}?tone=${tone}`}
          alt=""
          decoding="async"
          className={`sky-land-img sky-land-${tone}`}
          style={{ top: rem(LAND_TOP - from), height: rem(LAND_H / 10) }}
        />
      ))}
    </div>
  );
  return (
    <div className="sky-land">
      {band(LAND_TOP, SPLIT, "sky-land-far")}
      {band(SPLIT, 67.5, "sky-land-near")}
    </div>
  );
}

/** The shadows of clouds sliding over the land, squashed by perspective. */
function Shadows({ seed, epoch, show }: { seed: number; epoch: number; show: boolean }) {
  const r = rng(seed ^ 0x3c6ef372);
  // Centers, sizes in rem. All fall below the clean band of paper under the
  // horizon (the land's first lines begin about 6 rem below it).
  const lanes = [
    { y: 36, w: 28, h: 5, dur: 900 },
    { y: 41, w: 40, h: 7, dur: 700 },
    { y: 49, w: 52, h: 10, dur: 520 },
    { y: 58, w: 64, h: 12, dur: 410 },
  ];
  return (
    <Layer show={show} className="sky-fill">
      {lanes.map((l, i) => {
        const dur = l.dur * (0.9 + r() * 0.2);
        return (
          <div
            key={i}
            className="sky-shadow"
            style={{
              top: rem(l.y - l.h / 2),
              width: rem(l.w),
              height: rem(l.h),
              animationDuration: `${dur.toFixed(0)}s`,
              animationDelay: `${(-cycleAt(epoch, dur, r()) * dur).toFixed(0)}s`,
            }}
          />
        );
      })}
    </Layer>
  );
}

/* ---------------------------------------------------------------- light */

/** The moon's faint halo of light on the dark paper. */
function Light({ place, show }: { place: Place | null; show: boolean }) {
  const at: CSSProperties = place
    ? { transform: `translate(${rem(place.x - 25)}, ${rem(place.y - 25)})` }
    : { transform: "translate(15rem, -20rem)" };
  return (
    <Layer show={show} className="sky-glow-at" style={at}>
      <div className="sky-glow sky-glow-moon" />
    </Layer>
  );
}

/* ---------------------------------------------------------------- the arc */

function Arc({ place, show }: { place: Place | null; show: boolean }) {
  const { cx, cy, rx, ry } = ARC;
  const u = (n: number) => +(n * 10).toFixed(1);
  const end = place ? arcAt(Math.min(Math.max(place.body.t, 0.04), 0.96)) : arcAt(0);
  return (
    <Layer show={show} className="sky-fill">
      <svg viewBox="0 0 1200 675" className="sky-fill" fill="none" stroke="currentColor">
        <line
          x1={u(3)}
          y1={u(cy)}
          x2={u(117)}
          y2={u(cy)}
          strokeWidth={1.2}
          className="text-ink-faint"
        />
        <path
          d={`M${u(cx - rx)} ${u(cy)} A${u(rx)} ${u(ry)} 0 0 1 ${u(cx + rx)} ${u(cy)}`}
          strokeWidth={2.2}
          strokeDasharray="0.1 11"
          strokeLinecap="round"
          className="text-ink-faint"
        />
        <path
          d={`M${u(cx - rx)} ${u(cy)} A${u(rx)} ${u(ry)} 0 0 1 ${u(end.x)} ${u(end.y)}`}
          strokeWidth={3}
          strokeDasharray="0.1 11"
          strokeLinecap="round"
          className="text-ink-soft"
        />
      </svg>
    </Layer>
  );
}

/* ---------------------------------------------------------------- sun and moon */

function Body({
  place,
  look,
  now,
  show,
}: {
  place: Place | null;
  look: "full" | "soft" | "dot";
  now: Date;
  show: boolean;
}) {
  const at = place ?? { x: 60, y: 10, size: 15 };
  const moon = place?.body.body === "moon";
  // Under cover, only the hour survives: a dot of ink where the body is.
  const size = look === "dot" ? 1.3 : at.size;
  return (
    <Layer
      show={show}
      className="sky-body"
      style={{ transform: `translate(${rem(at.x - size / 2)}, ${rem(at.y - size / 2)})` }}
    >
      {look === "dot" ? (
        <div className="sky-dot" style={{ width: rem(size), height: rem(size) }} />
      ) : moon ? (
        <MoonBody size={size} now={now} ring={look === "soft" || look === "full"} />
      ) : (
        <Sun size={size} soft={look === "soft"} />
      )}
    </Layer>
  );
}

/** The sun, engraved: a ring of fine dotted halo that turns, rays that breathe. */
function Sun({ size, soft }: { size: number; soft: boolean }) {
  const rays = Array.from({ length: 28 }, (_, i) => {
    const a = (i / 28) * Math.PI * 2;
    const long = i % 2 === 0;
    const r0 = 26;
    const r1 = long ? 44 : 35;
    const w = long ? 1.7 : 1;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return `M${(50 + c * r0 - s * w).toFixed(2)} ${(50 + s * r0 + c * w).toFixed(2)} L${(50 + c * r1).toFixed(2)} ${(50 + s * r1).toFixed(2)} L${(50 + c * r0 + s * w).toFixed(2)} ${(50 + s * r0 - c * w).toFixed(2)} Z`;
  });
  return (
    <div className="relative" style={{ width: rem(size), height: rem(size) }}>
      {soft ? null : (
        <svg
          viewBox="0 0 100 100"
          className="sky-fill sky-halo text-ink-faint"
          fill="none"
          stroke="currentColor"
        >
          <circle
            cx={50}
            cy={50}
            r={48}
            strokeWidth={0.5}
            strokeDasharray="0.1 2.6"
            strokeLinecap="round"
          />
          <circle
            cx={50}
            cy={50}
            r={45.5}
            strokeWidth={0.35}
            strokeDasharray="0.1 3.9"
            strokeLinecap="round"
          />
        </svg>
      )}
      <svg
        viewBox="0 0 100 100"
        className={`sky-fill sky-rays text-ink ${soft ? "sky-rays-soft" : ""}`}
        fill="currentColor"
      >
        {rays.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </svg>
      <svg viewBox="0 0 100 100" className="sky-fill text-ink" fill="none" stroke="currentColor">
        {/* An opaque disc: nothing behind (the arc, a wisp) shows through. */}
        <circle cx={50} cy={50} r={21} strokeWidth={1.6} fill="var(--paper)" fillOpacity={1} />
        <circle cx={50} cy={50} r={16.5} strokeWidth={0.5} />
        {/* The engraver's shading on the disc: a few fine arcs off to the lower
            left, about a hundred degrees each. (Centered under the middle, they
            read as a smile.) */}
        {[13.5, 11, 8.5].map((r) => {
          const cx = 47;
          const cy = 53;
          const a0 = (100 * Math.PI) / 180;
          const a1 = (200 * Math.PI) / 180;
          const p = (a: number) =>
            `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
          return (
            <path
              key={r}
              d={`M${p(a0)} A${r} ${r} 0 0 1 ${p(a1)}`}
              strokeWidth={0.35}
              opacity={0.7}
            />
          );
        })}
      </svg>
    </div>
  );
}

/** The moon in its true phase; through thin cloud, a faint ring around it. */
function MoonBody({ size, now, ring }: { size: number; now: Date; ring: boolean }) {
  return (
    <div className="relative" style={{ width: rem(size), height: rem(size) }}>
      {ring ? (
        <svg
          viewBox="0 0 100 100"
          className="sky-fill sky-moon-halo text-ink-faint"
          fill="none"
          stroke="currentColor"
        >
          <circle
            cx={50}
            cy={50}
            r={47}
            strokeWidth={0.45}
            strokeDasharray="0.1 3.1"
            strokeLinecap="round"
          />
        </svg>
      ) : null}
      <svg viewBox="0 0 100 100" className="sky-fill text-ink" fill="none" stroke="currentColor">
        <Moon age={moonAge(now)} cx={50} cy={50} r={30} />
      </svg>
    </div>
  );
}

/**
 * At the day's ends: long horizontal strokes along the horizon, fanning from
 * the low sun toward the middle of the sheet, as an engraver draws a sunset.
 */
function Streaks({ place, show }: { place: Place | null; show: boolean }) {
  const x = place?.x ?? 60;
  const left = x < 60;
  const strokes = [
    [0.8, 68, 0.8],
    [1.6, 52, 0.6],
    [2.5, 61, 0.7],
    [3.5, 40, 0.5],
    [4.6, 47, 0.55],
    [5.8, 31, 0.4],
    [7.1, 36, 0.45],
  ];
  return (
    <Layer show={show} className="sky-fill">
      {/* Only the band just above the horizon: a small layer, not a whole screen. */}
      <div className="sky-streaks" style={{ top: rem(ARC.cy - 8), height: "8rem" }}>
        <svg
          viewBox={`0 ${(ARC.cy - 8) * 10} 1200 80`}
          className="sky-fill text-ink-faint"
          fill="none"
          stroke="currentColor"
        >
          {strokes.map(([dy, len, wpx], i) => {
            const y = (ARC.cy - dy) * 10;
            const from = x * 10 + (left ? 40 : -40);
            const to = from + (left ? 1 : -1) * len * 10;
            return (
              <path
                key={i}
                d={`M${from.toFixed(0)} ${y.toFixed(0)}L${to.toFixed(0)} ${y.toFixed(0)}`}
                strokeWidth={wpx / 1.6}
                strokeDasharray={`${((40 + i * 23) % 140) + 60} ${8 + ((i * 7) % 20)}`}
                strokeLinecap="round"
              />
            );
          })}
        </svg>
      </div>
    </Layer>
  );
}

/* ---------------------------------------------------------------- clouds */

const CUMULUS = 6;

type CloudSlot = {
  far: boolean;
  w: number;
  h: number;
  y: number;
  dur: number;
  delay: number;
  rest: number;
  flip: boolean;
  id: string;
};

function cloudSlots(seed: number, epoch: number): CloudSlot[] {
  const r = rng(seed ^ 0x9e3779b9);
  // Lanes (the top of each cloud, in rem), dealt out so the first clouds to
  // appear are spread apart. As in a real sky, the near clouds ride high and
  // big, some cut off by the top of the sheet; the far ones sit lower, smaller
  // and slower, toward the horizon. All keep clear of the words.
  const lanes = [8, -0.5, 10.5, 2.5, 6.5, 1];
  return Array.from({ length: CUMULUS }, (_, i) => {
    const far = i % 2 === 0;
    const w = far ? 10 + r() * 5 : 16 + r() * 7;
    // Not far from the forecast cloud's own proportions, so it isn't stretched thin.
    const h = w * (far ? 0.48 : 0.52);
    const dur = (far ? 11 : 6.5) * PRIMES[12 + Math.floor(r() * 10)] * (0.9 + r() * 0.2);
    const phase = cycleAt(epoch, dur, (i * 0.382 + r() * 0.2) % 1);
    return {
      far,
      w,
      h,
      y: lanes[i] + (r() - 0.5) * 1.5,
      dur,
      delay: -phase * dur,
      rest: -50 + phase * 175,
      // Mirrored now and then, so the same drawing never reads as a stamp.
      flip: i % 4 >= 2,
      id: `c${seed % 997}x${i}`,
    };
  });
}

function Clouds({
  seed,
  epoch,
  count,
  flash,
  depth,
}: {
  seed: number;
  epoch: number;
  count: number;
  flash: boolean;
  depth: "far" | "near";
}) {
  return (
    <>
      {cloudSlots(seed, epoch).map((c, i) => {
        if (c.far !== (depth === "far")) return null;
        // The forecast's own engraved cloud, drawn big; its lines stay hairline.
        const box = {
          width: rem(c.w),
          height: rem(c.h),
          transform: c.flip ? "scaleX(-1)" : undefined,
        };
        return (
          <Layer
            key={i}
            show={i < count}
            className={`sky-cloud ${c.far ? "sky-cloud-far" : "sky-cloud-near"}`}
            style={{ top: rem(c.y) }}
          >
            <div
              className="sky-drift"
              style={{
                animationDuration: `${c.dur.toFixed(1)}s`,
                animationDelay: `${c.delay.toFixed(1)}s`,
                transform: `translateX(${rem(c.rest)})`,
              }}
            >
              <svg
                viewBox={CLOUD_BOX}
                preserveAspectRatio="none"
                style={box}
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
              >
                <Cloud id={c.id} fine />
              </svg>
              {/* Sheet lightning, by day in a storm: once in a long while the
                  cloud is lit from within (its shadow briefly paled). */}
              {flash && !c.far && i === 1 ? (
                <svg
                  viewBox={CLOUD_BOX}
                  preserveAspectRatio="none"
                  className="sky-flash"
                  style={box}
                >
                  <path d={CLOUD} fill="var(--paper)" />
                </svg>
              ) : null}
            </div>
          </Layer>
        );
      })}
    </>
  );
}

/** Long, low banks of stratus for overcast skies: layered horizontal strokes. */
function Stratus({ seed, epoch, count }: { seed: number; epoch: number; count: number }) {
  const r = rng(seed ^ 0x6a09e667);
  // High enough that the banks never cross the weather pages' headlines.
  const lanes = [2.5, 6, -1.5];
  return (
    <>
      {lanes.map((y, i) => {
        const w = 70 + r() * 40;
        const h = 6 + r() * 3;
        const W = w * 10;
        const H = h * 10;
        const rows = Math.round(h / 0.62);
        const strokes = Array.from({ length: rows }, (_, j) => {
          const v = (j - (rows - 1) / 2) / ((rows - 1) / 2);
          const half = (W / 2) * Math.sqrt(Math.max(1 - v * v, 0)) * (0.8 + r() * 0.2);
          const cx = W / 2 + (r() - 0.5) * W * 0.12;
          const yy = ((j + 0.5) / rows) * H;
          // Lower rows darker: the bank's shadowed underside.
          const o = 0.25 + 0.55 * ((v + 1) / 2);
          return {
            d: `M${(cx - half).toFixed(0)} ${yy.toFixed(1)}L${(cx + half).toFixed(0)} ${yy.toFixed(1)}`,
            o,
            dash: `${(60 + r() * 220).toFixed(0)} ${(6 + r() * 40).toFixed(0)}`,
          };
        });
        const dur = 1300 + r() * 600;
        const phase = cycleAt(epoch, dur, (i * 0.41 + r() * 0.2) % 1);
        return (
          <Layer key={i} show={i < count} className="sky-cloud sky-stratus" style={{ top: rem(y) }}>
            <div
              className="sky-drift-wide"
              style={{
                animationDuration: `${dur.toFixed(0)}s`,
                animationDelay: `${(-phase * dur).toFixed(0)}s`,
                transform: `translateX(${rem(-115 + phase * 240)})`,
              }}
            >
              <svg
                viewBox={`0 0 ${W} ${H}`}
                style={{ width: rem(w), height: rem(h) }}
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
              >
                {strokes.map((s, j) => (
                  <path
                    key={j}
                    d={s.d}
                    opacity={s.o.toFixed(2)}
                    strokeWidth={0.8}
                    strokeDasharray={s.dash}
                  />
                ))}
              </svg>
            </div>
          </Layer>
        );
      })}
    </>
  );
}

/** High cirrus wisps: long, thin, broken strokes in the highest, slowest lane. */
function Wisps({ seed, epoch, count }: { seed: number; epoch: number; count: number }) {
  const r = rng(seed ^ 0x510e527f);
  const lanes = [1, 4.5, 2.5];
  return (
    <>
      {lanes.map((y, i) => {
        const w = 30 + r() * 15;
        const h = 2 + r();
        const W = w * 10;
        const H = h * 10;
        const strokes = Array.from({ length: 4 + Math.floor(r() * 3) }, (_, j) => {
          const x0 = r() * W * 0.3;
          const x1 = W - r() * W * 0.3;
          const y0 = (0.15 + r() * 0.7) * H;
          const bow = (r() - 0.5) * H * 0.8;
          return {
            d: `M${x0.toFixed(0)} ${y0.toFixed(1)}Q${((x0 + x1) / 2).toFixed(0)} ${(y0 + bow).toFixed(1)} ${x1.toFixed(0)} ${(y0 - bow * 0.3).toFixed(1)}`,
            dash: `${(30 + r() * 90).toFixed(0)} ${(10 + r() * 30).toFixed(0)}`,
            w: j === 0 ? 0.9 : 0.6,
          };
        });
        const dur = 1100 * (0.9 + r() * 0.25);
        const phase = cycleAt(epoch, dur, (i * 0.37 + 0.15 + r() * 0.2) % 1);
        return (
          <Layer key={i} show={i < count} className="sky-cloud sky-wisp" style={{ top: rem(y) }}>
            <div
              className="sky-drift"
              style={{
                animationDuration: `${dur.toFixed(0)}s`,
                animationDelay: `${(-phase * dur).toFixed(0)}s`,
                transform: `translateX(${rem(-50 + phase * 175)})`,
              }}
            >
              <svg
                viewBox={`0 0 ${W} ${H}`}
                style={{ width: rem(w), height: rem(h) }}
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
              >
                {strokes.map((s, j) => (
                  <path key={j} d={s.d} strokeWidth={s.w} strokeDasharray={s.dash} />
                ))}
              </svg>
            </div>
          </Layer>
        );
      })}
    </>
  );
}

/* ---------------------------------------------------------------- stars */

type StarSpot = { x: number; y: number; s: number; dur: number; delay: number; bright: boolean };

function starSpots(seed: number): { twinkle: StarSpot[]; dust: Array<[number, number, number]> } {
  const r = rng(seed ^ 0x5bd1e995);
  const twinkle = Array.from({ length: 20 }, () => {
    const dur = PRIMES[4 + Math.floor(r() * 9)] * (0.8 + r() * 0.5);
    return {
      x: 3 + r() * 114,
      // Stars only above the horizon.
      y: 1 + Math.pow(r(), 1.2) * (ARC.cy - 3),
      s: 0.55 + r() * 0.9,
      dur,
      delay: -r() * dur,
      bright: r() > 0.7,
    };
  });
  const dust = Array.from(
    { length: 90 },
    () =>
      [r() * 1200, Math.pow(r(), 1.1) * (ARC.cy - 1.5) * 10, 0.6 + r() * 1.2] as [
        number,
        number,
        number,
      ],
  );
  return { twinkle, dust };
}

// Five stars scintillate: mostly steady, with a brief shimmer, staggered so
// at most one shimmers at a time. The rest only breathe.
const SCINTILLATE = 5;
const SCI_PERIOD = 37;

function Stars({
  seed,
  show,
  level,
  part,
}: {
  seed: number;
  show: boolean;
  level: "all" | "few" | "none";
  part: "dust" | "twinkle";
}) {
  const { twinkle, dust } = starSpots(seed);
  if (part === "dust") {
    return (
      <Layer show={show && level === "all"} className="sky-fill">
        <svg viewBox="0 0 1200 675" className="sky-fill text-ink-faint" fill="currentColor">
          {dust.map(([x, y, s], i) => (
            <circle
              key={i}
              cx={x.toFixed(1)}
              cy={y.toFixed(1)}
              r={s.toFixed(2)}
              opacity={0.35 + (i % 5) * 0.12}
            />
          ))}
        </svg>
      </Layer>
    );
  }
  // Through thin cloud, only the brightest few.
  const shown = level === "all" ? twinkle : twinkle.filter((s) => s.bright).slice(0, 5);
  return (
    <Layer show={show && level !== "none"} className="sky-fill">
      {shown.map((s, i) => {
        const sci = level === "all" && i < SCINTILLATE;
        return (
          <svg
            key={i}
            viewBox="-5 -5 10 10"
            className={`sky-star ${sci ? "sky-star-sci" : ""} ${s.bright || sci ? "text-ink-soft" : "text-ink-faint"}`}
            style={{
              left: rem(s.x),
              top: rem(s.y),
              width: rem(s.s * 1.6),
              height: rem(s.s * 1.6),
              animationDuration: sci ? `${SCI_PERIOD}s` : `${s.dur.toFixed(2)}s`,
              animationDelay: sci
                ? `${(-((i * SCI_PERIOD) / SCINTILLATE + 3)).toFixed(1)}s`
                : `${s.delay.toFixed(2)}s`,
            }}
          >
            <Star x={0} y={0} s={1.3} />
          </svg>
        );
      })}
    </Layer>
  );
}

function ShootingStar({ seed, epoch, show }: { seed: number; epoch: number; show: boolean }) {
  const r = rng(seed ^ 0x2545f491);
  const x = 40 + r() * 60;
  const y = 3 + r() * 14;
  const id = `meteor${seed % 997}`;
  return (
    <Layer show={show} className="sky-fill">
      <div
        className="sky-meteor"
        style={{
          left: rem(x),
          top: rem(y),
          animationDelay: `${(-cycleAt(epoch, 431, r()) * 431).toFixed(0)}s`,
        }}
      >
        <svg
          viewBox="0 0 200 10"
          className="text-ink-soft"
          style={{ width: "14rem", height: "0.7rem" }}
        >
          <defs>
            {/* The trail thins and fades behind the head. */}
            <linearGradient id={id} x1={0} x2={1} y1={0} y2={0}>
              <stop offset={0} stopColor="currentColor" stopOpacity={0} />
              <stop offset={1} stopColor="currentColor" stopOpacity={0.95} />
            </linearGradient>
          </defs>
          <path d="M0 5 L196 3.6 Q200 5 196 6.4 Z" fill={`url(#${id})`} />
        </svg>
      </div>
    </Layer>
  );
}

/* ---------------------------------------------------------------- birds */

// Three flocks, each crossing on its own long cycle: three birds, a V of
// five, a skein of seven. Each bird beats its wings to its own count.
const FLOCKS = [
  {
    name: "a",
    // Seconds per cycle; must match .sky-flock-a in living.css.
    period: 157,
    birds: [
      [0, 0],
      [3.4, 1.2],
      [6.1, -0.4],
    ],
  },
  {
    name: "b",
    // Seconds per cycle; must match .sky-flock-b in living.css.
    period: 211,
    birds: [
      [0, 0],
      [2.6, 1.3],
      [2.8, -1.3],
      [5.3, 2.5],
      [5.5, -2.4],
    ],
  },
  {
    name: "c",
    // Seconds per cycle; must match .sky-flock-c in living.css.
    period: 283,
    birds: [
      [0, 0],
      [2.4, 0.7],
      [4.9, 1.3],
      [7.2, 2.1],
      [9.8, 2.6],
      [12.1, 3.4],
      [14.6, 3.9],
    ],
  },
] as const;

function Birds({ seed, epoch, show }: { seed: number; epoch: number; show: boolean }) {
  const r = rng(seed ^ 0x27d4eb2f);
  return (
    <Layer show={show} className="sky-fill">
      {FLOCKS.map((f) => (
        <div
          key={f.name}
          className={`sky-flock sky-flock-${f.name}`}
          style={{
            top: rem(4 + r() * 11),
            animationDelay: `${(-cycleAt(epoch, f.period, r()) * f.period).toFixed(0)}s`,
          }}
        >
          {f.birds.map(([x, y], i) => {
            const s = 0.75 + r() * 0.35;
            return (
              <svg
                key={i}
                viewBox="0 0 20 10"
                className="sky-bird text-ink-soft"
                style={{
                  left: rem(x),
                  top: rem(y),
                  width: rem(1.9 * s),
                  height: rem(0.95 * s),
                  animationDuration: `${(0.9 + r() * 0.7).toFixed(2)}s`,
                  animationDelay: `${(-r() * 2).toFixed(2)}s`,
                }}
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
              >
                <path d="M1 6 q4 -4.5 9 0.4 q4 -4.9 9 -0.4" strokeWidth={1.3} />
              </svg>
            );
          })}
        </div>
      ))}
    </Layer>
  );
}

/* ---------------------------------------------------------------- mist */

function Mist({ seed, fog, dawn }: { seed: number; fog: boolean; dawn: boolean }) {
  const r = rng(seed ^ 0x165667b1);
  // Well clear of the horizon line: one band in the low sky, two over the land.
  const bands = [38, 19, 52];
  return (
    <>
      {bands.map((y, b) => {
        const lines = Array.from({ length: 2 }, (_, k) => {
          const yy = 15 + k * 22 + r() * 6;
          let d = `M0 ${yy.toFixed(1)}`;
          for (let x = 0; x < 1700; x += 170) d += ` q85 ${((r() - 0.5) * 8).toFixed(1)} 170 0`;
          return { d, dash: `${(260 + r() * 300).toFixed(0)} ${(90 + r() * 160).toFixed(0)}` };
        });
        return (
          <Layer
            key={b}
            show={fog || (dawn && b === 0)}
            className="sky-mist-band"
            style={{ top: rem(y) }}
          >
            <div
              className="sky-mist"
              style={{
                animationDuration: `${PRIMES[18 + b]}s`,
                animationDelay: `${(-r() * 80).toFixed(0)}s`,
              }}
            >
              <svg
                viewBox="0 0 1700 60"
                style={{ width: "170rem", height: "6rem" }}
                fill="none"
                stroke="currentColor"
                className="text-ink-faint"
              >
                {lines.map((l, i) => (
                  <path
                    key={i}
                    d={l.d}
                    strokeWidth={1}
                    strokeDasharray={l.dash}
                    strokeLinecap="round"
                  />
                ))}
              </svg>
            </div>
          </Layer>
        );
      })}
    </>
  );
}

/* ---------------------------------------------------------------- rain and snow */

// Each layer is one sheet-wide tile of marks, repeated only downward and
// moved by exactly one tile, so the loop is seamless and nothing repeats
// across. Three depths at different speeds and tile heights. Marks vary in
// length and weight inside the tile.
const RAIN = [
  { th: 19, n: 70, len: 0.6, sw: 0.8, speed: 4, cls: "sky-rain-far" },
  { th: 23, n: 46, len: 0.9, sw: 1, speed: 6, cls: "sky-rain-mid" },
  { th: 29, n: 26, len: 1.3, sw: 1.25, speed: 8, cls: "sky-rain-near" },
];
// Snow is two sheets: fine far dots, and a nearer sheet of larger dots that
// carries a few big engraved crystals by day (so a still frame says snow)
// and, at night, soft dots big enough to see from the couch (a crystal would
// read as a star). Only one of the two near variants shows at a time.
const SNOW_FAR = { th: 23, n: 70, size: [0.075, 0.15], ms: 41000, sway: 9000 };
const SNOW_NEAR = { th: 29, n: 40, size: [0.15, 0.225], ms: 29000, sway: 13000 };
// Rain leans a little, as if there were a wind (shared by every sheet).
const SLANT = 0.12;

function Fall({
  kind,
  hard,
  quiet,
  night,
}: {
  kind: SkyState["fall"];
  hard: boolean;
  quiet: boolean;
  night: boolean;
}) {
  const wet = kind === "rain" || kind === "storms";
  // Never more than two sheets falling at once (each costs the TV a whole
  // screen of drawing): far and mid, or far and near when it's coming down
  // hard. On the weather pages, only the far one, faintly.
  const layerOn = (i: number) => (quiet ? i === 0 : hard ? i !== 1 : i < 2);
  return (
    <>
      {RAIN.map((L, i) => {
        const r = rng(4049 + i);
        const marks = Array.from({ length: L.n }, (_, k) => {
          const len = L.len * 10 * (0.5 + r() * 2.5);
          const x = 4 + r() * 1192;
          const y = 2 + r() * (L.th * 10 - len - 4);
          return (
            <path
              key={k}
              d={`M${x.toFixed(1)} ${y.toFixed(1)}l${(-len * SLANT).toFixed(1)} ${len.toFixed(1)}`}
              opacity={(0.3 + r() * 0.7).toFixed(2)}
            />
          );
        });
        return (
          <Layer key={`r${i}`} show={wet && layerOn(i)} className={`sky-fill ${L.cls}`}>
            <Tiled th={L.th} ms={(L.th / L.speed) * 1000} id={`rain${i}`}>
              <g stroke="currentColor" strokeWidth={L.sw} strokeLinecap="round">
                {marks}
              </g>
            </Tiled>
          </Layer>
        );
      })}
      <SnowSheet
        L={SNOW_FAR}
        seed={7027}
        show={kind === "snow"}
        className="sky-snow-far"
        id="snowfar"
      />
      <SnowSheet
        L={SNOW_NEAR}
        seed={7028}
        show={kind === "snow" && !quiet && !night}
        className="sky-snow-mid"
        id="snowday"
        extra="crystals"
      />
      <SnowSheet
        L={SNOW_NEAR}
        seed={7028}
        show={kind === "snow" && !quiet && night}
        className="sky-snow-mid"
        id="snownight"
        extra="dots"
      />
    </>
  );
}

function SnowSheet({
  L,
  seed,
  show,
  className,
  id,
  extra,
}: {
  L: typeof SNOW_FAR;
  seed: number;
  show: boolean;
  className: string;
  id: string;
  extra?: "crystals" | "dots";
}) {
  const r = rng(seed);
  const at = (s: number) => [
    s + 1 + r() * (1200 - 2 * s - 2),
    s + 1 + r() * (L.th * 10 - 2 * s - 2),
  ];
  const flakes = Array.from({ length: L.n }, (_, k) => {
    const s = (L.size[0] + r() * (L.size[1] - L.size[0])) * 10;
    const [x, y] = at(s);
    return (
      <circle
        key={k}
        cx={x.toFixed(1)}
        cy={y.toFixed(1)}
        r={s.toFixed(2)}
        fill="currentColor"
        opacity={(0.55 + r() * 0.45).toFixed(2)}
      />
    );
  });
  // About four or five crystals on the sheet at a time by day; at night,
  // eight or so soft dots of 0.35 to 0.5 rem.
  const more =
    extra === "crystals"
      ? Array.from({ length: 2 }, (_, k) => {
          const s = (0.65 + r() * 0.25) * 10;
          const [x, y] = at(s);
          return <Crystal key={`c${k}`} x={x} y={y} s={s} />;
        })
      : extra === "dots"
        ? Array.from({ length: 4 }, (_, k) => {
            const s = (0.175 + r() * 0.075) * 10;
            const [x, y] = at(s);
            return (
              <circle
                key={`d${k}`}
                cx={x.toFixed(1)}
                cy={y.toFixed(1)}
                r={s.toFixed(2)}
                fill="currentColor"
                opacity={0.7}
              />
            );
          })
        : null;
  return (
    <Layer show={show} className={`sky-fill ${className}`}>
      <div className="sky-fill sky-sway" style={{ animationDuration: `${L.sway}ms` }}>
        <Tiled th={L.th} ms={L.ms} id={id}>
          {flakes}
          {more}
        </Tiled>
      </div>
    </Layer>
  );
}

/** A large engraved snow crystal: six arms, each with two pairs of branches. */
function Crystal({ x, y, s }: { x: number; y: number; s: number }) {
  let d = "";
  for (let a = 0; a < 6; a++) {
    const t = (a * Math.PI) / 3;
    const c = Math.cos(t);
    const n = Math.sin(t);
    d += `M${x.toFixed(1)} ${y.toFixed(1)}l${(c * s).toFixed(2)} ${(n * s).toFixed(2)}`;
    for (const f of [0.45, 0.7]) {
      const bx = x + c * s * f;
      const by = y + n * s * f;
      const b = s * (f === 0.45 ? 0.3 : 0.2);
      for (const side of [-1, 1]) {
        const tb = t + side * (Math.PI / 4);
        d += `M${bx.toFixed(1)} ${by.toFixed(1)}l${(Math.cos(tb) * b).toFixed(2)} ${(Math.sin(tb) * b).toFixed(2)}`;
      }
    }
  }
  return <path d={d} stroke="currentColor" strokeWidth={1.05} strokeLinecap="round" fill="none" />;
}

function Tiled({
  th,
  ms,
  id,
  children,
}: {
  th: number;
  ms: number;
  id: string;
  children: ReactNode;
}) {
  const H = 67.5 + th * 2;
  return (
    <div
      className="sky-tile"
      style={
        {
          left: 0,
          top: rem(-th * 1.5),
          width: "120rem",
          height: rem(H),
          "--ty": rem(th),
          animationDuration: `${ms.toFixed(0)}ms`,
        } as CSSProperties
      }
    >
      <svg viewBox={`0 0 1200 ${H * 10}`} className="sky-fill" fill="none">
        <defs>
          <pattern id={id} width={1200} height={th * 10} patternUnits="userSpaceOnUse">
            {children}
          </pattern>
        </defs>
        <rect width={1200} height={H * 10} fill={`url(#${id})`} />
      </svg>
    </div>
  );
}

/*
 * The parts that depend only on the seed and the weather, memoized: the clock
 * ticks every few seconds, and only the sun, its arc, and its light need to
 * hear about it. (Re-rendering the land's long paths on every tick was a
 * visible hitch on the TV.)
 */
const Still = {
  Land: memo(Land),
  Shadows: memo(Shadows),
  Stars: memo(Stars),
  ShootingStar: memo(ShootingStar),
  Wisps: memo(Wisps),
  Clouds: memo(Clouds),
  Stratus: memo(Stratus),
  Birds: memo(Birds),
  Mist: memo(Mist),
  Fall: memo(Fall),
};

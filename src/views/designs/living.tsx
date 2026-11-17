import { memo, type CSSProperties, type ReactNode } from "react";
import { contours, rng, terrain } from "@/lib/organic";
import { precipKind } from "@/lib/forecast";
import type { Mood } from "@/lib/time";
import type { Weather } from "@/lib/types";
import { Moon, Star, moonAge } from "../Engraving";
import { ARC, arcAt, bodyAt, skyNow } from "./arc";

/*
 * The living sky: the Almanac's sheet is a window. Behind the words, the
 * paper itself is a quiet map of an imaginary land, its contour lines
 * breathing as the ground seems to shift; above it the real sky, drawn as an
 * engraver would: the sun or the moon on its arc, clouds drifting at two
 * depths, stars breathing, rain and snow falling, mist, now and then a few
 * birds or a shooting star. All of it follows the real weather and hour.
 *
 * Performance is the design (the TV's GPU is weak): every shape is drawn once,
 * and only whole layers move or fade (CSS transform and opacity, on the
 * compositor). Nothing repaints frame by frame and no script runs a loop.
 * Durations are prime-ish and phases seeded, so nothing visibly repeats; the
 * seed is fixed for the session so the server and the TV draw the same sky.
 *
 * Layers are always present and switched with data-on, so weather changes
 * fade in and out instead of cutting (see living.css).
 */

export type LivingSkyProps = {
  w: Weather | null;
  now: Date;
  mood: Mood;
  /** Home and night draw the sun or moon on its arc; the weather views don't. */
  arc: boolean;
  seed: number;
};

const rem = (n: number) => `${+n.toFixed(3)}rem`;
const on = (b: boolean) => (b ? "1" : "0");
const PRIMES = [
  5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101,
];

type Sky = {
  clouds: number; // how many cloud slots are on, of CLOUD_SLOTS
  heavy: boolean;
  fall: null | "rain" | "snow" | "storms";
  hard: boolean;
  fog: boolean;
};

function skyOfCode(code: number): Sky {
  const fall = precipKind(code);
  const fog = code === 45 || code === 48;
  const hard = [63, 65, 67, 73, 75, 77, 81, 82, 86, 95, 96, 99].includes(code);
  const clouds =
    code === 0
      ? 1
      : code === 1
        ? 2
        : code === 2
          ? 4
          : fog
            ? 3
            : code === 3
              ? 7
              : fall
                ? fall === "storms"
                  ? 8
                  : 7
                : 5;
  return { clouds, heavy: code === 3 || Boolean(fall), fall: fall ?? null, hard, fog };
}

export function LivingSky({ w, now, mood, arc, seed }: LivingSkyProps) {
  const sky = w
    ? skyOfCode(w.now.code)
    : { clouds: 2, heavy: false, fall: null, hard: false, fog: false };
  const body = w ? skyNow(w, now) : null;
  const night = mood === "night";
  const sun = body?.body === "sun" ? body.t : null;
  const dawn = sun !== null && sun < 0.12;
  const dusk = sun !== null && sun > 0.86;
  const p = body ? bodyAt(body.t) : null;
  const clearish = sky.clouds <= 4 && !sky.fall;

  return (
    <div
      className="sky"
      aria-hidden
      data-heavy={sky.heavy ? "" : undefined}
      data-quiet={arc ? undefined : ""}
      data-phase={night ? "night" : dawn ? "dawn" : dusk ? "dusk" : "day"}
    >
      {/* What never moves is painted first, into the paper itself. Anything
          static painted above a moving layer would need a layer of its own. */}
      <Still.Land seed={seed} part="still" />
      <div className="sky-vignette" />
      <Still.Stars seed={seed} show={night} clear={sky.clouds <= 4} part="dust" />
      <Arc p={p} t={body?.t ?? 0} show={arc && Boolean(body)} />
      {/* Then everything alive, back to front. */}
      <Still.Land seed={seed} part="breath" />
      <Light p={p} arc={arc} warm={dawn || dusk} night={night} />
      <Still.Stars seed={seed} show={night} clear={sky.clouds <= 4} part="twinkle" />
      <Still.ShootingStar seed={seed} show={night && sky.clouds <= 3} />
      <Body p={p} kind={body?.body ?? "sun"} now={now} show={arc && Boolean(body)} />
      <Still.Clouds seed={seed} count={night && sky.clouds === 1 ? 1 : sky.clouds} />
      <Still.Birds seed={seed} show={!night && clearish && !dawn} />
      <Still.Mist seed={seed} fog={sky.fog} dawn={dawn && !sky.fall} />
      <Still.Fall kind={sky.fall} hard={sky.hard} />
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
  children: ReactNode;
}) {
  return (
    <div className={`sky-layer ${className}`} data-on={on(show)} style={style}>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- the land */

// Below the horizon, the paper is land: the contour lines of an imaginary,
// eroded country whose valleys branch like veins, seen in perspective as it
// runs away to the horizon. It's sampled straight through a camera (each
// point of the sheet looks down onto the ground), so it is drawn flat, once,
// at screen size: no 3D layer for the TV to hold. Two states of the same land
// breathe into each other, so the ground seems to slowly shift and swell.
const LAND = new Map<number, [string[], string[]]>();
const LEVELS = Array.from({ length: 13 }, (_, i) => -0.3 + i * 0.085);
const STEP = 0.6; // rem per grid step on the sheet
const TOP = ARC.cy + 0.6; // where the ground begins, just under the horizon
const NEAR = 40; // the ground's distance at the foot of the sheet (rem)
const FOCAL = 40;
const CAMERA = ((67.5 - ARC.cy) * NEAR) / FOCAL;
const HAZE = LEVELS[5] + 0.04; // the level the far ground settles to (between two lines)

function landOf(seed: number): [string[], string[]] {
  const got = LAND.get(seed);
  if (got) return got;
  const cols = Math.ceil(124 / STEP);
  const rows = Math.ceil((69 - TOP) / STEP);
  const at = (t: number) => (i: number, j: number) => {
    const x = -2 + i * STEP;
    const y = TOP + j * STEP;
    // From the sheet down onto the ground: depth, then across.
    const z = (FOCAL * CAMERA) / (y - ARC.cy);
    const across = ((x - 60) * z) / FOCAL;
    // Far off, the ground flattens into haze: fewer lines crowd the horizon.
    const k = Math.exp(-(z - NEAR) / 260);
    return terrain(seed, across / 52, z / 52, t) * k + HAZE * (1 - k);
  };
  const made: [string[], string[]] = [
    contours(at(0), cols, rows, LEVELS, STEP * 10),
    contours(at(0.8), cols, rows, LEVELS, STEP * 10),
  ];
  LAND.set(seed, made);
  return made;
}

function Land({ seed, part }: { seed: number; part: "still" | "breath" }) {
  const [a, b] = landOf(seed);
  const H = Math.round((67.5 - TOP) * 10);
  // Drawn only below the horizon. The far ground melts into the haze through
  // a mask painted once with the lines (never a CSS mask over a moving layer,
  // which would cost the TV a fresh offscreen pass every frame).
  const sheet = (paths: string[], id: string, className = "") => (
    <svg
      viewBox={`20 0 1200 ${H}`}
      preserveAspectRatio="none"
      className={`sky-land-sheet ${className}`}
      fill="none"
      stroke="currentColor"
      strokeLinejoin="round"
    >
      <defs>
        <linearGradient id={`${id}g`} x1={0} y1={0} x2={0} y2={H} gradientUnits="userSpaceOnUse">
          <stop offset={0.015} stopColor="#fff" stopOpacity={0} />
          <stop offset={0.16} stopColor="#fff" stopOpacity={0.25} />
          <stop offset={0.7} stopColor="#fff" stopOpacity={1} />
        </linearGradient>
        <mask id={`${id}m`} maskUnits="userSpaceOnUse" x={0} y={0} width={1240} height={H}>
          <rect x={0} y={0} width={1240} height={H} fill={`url(#${id}g)`} />
        </mask>
      </defs>
      <g mask={`url(#${id}m)`}>
        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            strokeWidth={i % 4 === 1 ? 1.5 : 0.8}
            opacity={i % 4 === 1 ? 1 : 0.75}
          />
        ))}
      </g>
    </svg>
  );
  // The first state is painted with the paper and costs nothing to keep; only
  // the second breathes over it, one layer fading in and out.
  return (
    <div className="sky-land" style={{ top: `${TOP}rem` }}>
      {part === "still"
        ? sheet(a, `land${seed % 997}a`)
        : sheet(b, `land${seed % 997}b`, "sky-land-b")}
    </div>
  );
}

/* ---------------------------------------------------------------- light */

function Light({
  p,
  arc,
  warm,
  night,
}: {
  p: { x: number; y: number } | null;
  arc: boolean;
  warm: boolean;
  night: boolean;
}) {
  const at: CSSProperties = p
    ? { transform: `translate(${rem(p.x - 25)}, ${rem(p.y - 25)})` }
    : { transform: "translate(15rem, -20rem)" };
  return (
    <>
      {/* Dawn and dusk warm the paper around the low sun; the moon lights a little halo. */}
      <Layer show={Boolean(p) && (warm || night)} className="sky-glow-at" style={at}>
        <div className={`sky-glow ${night ? "sky-glow-moon" : "sky-glow-warm"}`} />
      </Layer>
      {/* A softer, wider warmth along the horizon at the day's ends. */}
      <Layer show={warm && arc} className="sky-horizon-warm">
        <div />
      </Layer>
    </>
  );
}

/* ---------------------------------------------------------------- the arc */

function Arc({ p, t, show }: { p: { x: number; y: number } | null; t: number; show: boolean }) {
  const { cx, cy, rx, ry } = ARC;
  const u = (n: number) => +(n * 10).toFixed(1);
  const end = p ?? arcAt(Math.min(Math.max(t, 0), 1));
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
  p,
  kind,
  now,
  show,
}: {
  p: { x: number; y: number } | null;
  kind: "sun" | "moon";
  now: Date;
  show: boolean;
}) {
  const at = p ?? { x: 60, y: 10 };
  const size = kind === "sun" ? 15 : 11;
  return (
    <Layer
      show={show}
      className="sky-body"
      style={{ transform: `translate(${rem(at.x - size / 2)}, ${rem(at.y - size / 2)})` }}
    >
      {kind === "sun" ? <Sun size={size} /> : <MoonBody size={size} now={now} />}
    </Layer>
  );
}

/** The sun, engraved: a ring of fine dotted halo that turns, rays that breathe. */
function Sun({ size }: { size: number }) {
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
      <svg viewBox="0 0 100 100" className="sky-fill sky-rays text-ink" fill="currentColor">
        {rays.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </svg>
      <svg viewBox="0 0 100 100" className="sky-fill text-ink" fill="none" stroke="currentColor">
        <circle cx={50} cy={50} r={21} strokeWidth={1.6} fill="var(--paper)" />
        <circle cx={50} cy={50} r={16.5} strokeWidth={0.5} />
        {/* The engraver's shading on the disc: a few fine arcs on the lower side. */}
        {[13.5, 11, 8.5].map((r) => (
          <path
            key={r}
            d={`M${50 - r} ${50 + 2} A${r} ${r} 0 0 0 ${50 + r} ${50 + 2}`}
            strokeWidth={0.35}
            opacity={0.7}
          />
        ))}
      </svg>
    </div>
  );
}

function MoonBody({ size, now }: { size: number; now: Date }) {
  return (
    <div className="relative" style={{ width: rem(size), height: rem(size) }}>
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
      <svg viewBox="0 0 100 100" className="sky-fill text-ink" fill="none" stroke="currentColor">
        <Moon age={moonAge(now)} cx={50} cy={50} r={30} />
      </svg>
    </div>
  );
}

/* ---------------------------------------------------------------- clouds */

const CLOUD_SLOTS = 8;

type Billow = { x: number; y: number; r: number };

/**
 * A cumulus as an engraver cuts it: a heap of billows with a flat base, the
 * silhouette in one fine line, and the shadow laid in with horizontal strokes,
 * close together near the base and thinning out upward. Units: 10 per rem.
 */
function cloudShape(r: () => number, W: number, H: number) {
  const base = H * 0.97;
  const billows: Billow[] = [];
  // One row of overlapping billows whose tops follow a lopsided dome: the
  // crown heaped to one side, the shoulders low, the ends trailing off.
  const lean = 0.36 + r() * 0.28;
  const n = 7 + Math.floor(r() * 4);
  const dome = (u: number) => {
    const d = u < lean ? u / lean : (1 - u) / (1 - lean);
    return Math.pow(Math.sin((Math.PI / 2) * Math.min(Math.max(d, 0), 1)), 0.8);
  };
  for (let k = 0; k < n; k++) {
    const u = 0.06 + (0.88 * k) / (n - 1) + (r() - 0.5) * 0.03;
    const height = H * (0.18 + 0.8 * dome(u)) * (0.88 + r() * 0.2);
    const rr = Math.max(height / 1.55, H * 0.12);
    billows.push({ x: W * u, y: base - height + rr, r: rr });
  }
  // A few small billows breaking the outline, as real cloud tops do.
  for (let k = 0; k < 3; k++) {
    const host = billows[1 + Math.floor(r() * (n - 2))];
    const a = -Math.PI / 2 + (r() - 0.5) * 1.6;
    const rr = host.r * (0.35 + r() * 0.2);
    billows.push({
      x: host.x + Math.cos(a) * host.r * 0.85,
      y: host.y + Math.sin(a) * host.r * 0.85,
      r: rr,
    });
  }
  // Where the hatching goes: rows from the base up, each a line across.
  const top = Math.min(...billows.map((b) => b.y - b.r));
  const rows: Array<{ y: number; w: number; o: number; dash: string }> = [];
  for (let y = base - 3, k = 0; y > top + (base - top) * 0.3; y -= 4.2 + k * 0.55, k++) {
    const up = (base - y) / (base - top);
    rows.push({
      y,
      w: Math.max(0.95 - up * 1.1, 0.3),
      o: Math.max(0.7 - up * 0.9, 0.12),
      // Higher up, the strokes break apart.
      dash: up < 0.18 ? "" : `${(20 + r() * 60).toFixed(0)} ${(4 + up * 30 * r()).toFixed(0)}`,
    });
  }
  return { billows, base, rows };
}

type CloudSlot = {
  far: boolean;
  w: number;
  h: number;
  y: number;
  dur: number;
  delay: number;
  rest: number;
  shape: ReturnType<typeof cloudShape>;
  id: string;
};

function cloudSlots(seed: number): CloudSlot[] {
  const r = rng(seed ^ 0x9e3779b9);
  // Lanes (the top of each cloud, in rem), dealt out so the first clouds to
  // appear are spread apart. As in a real sky, the near clouds ride high and
  // big, some cut off by the top of the sheet, and the far ones sit lower,
  // smaller and slower, toward the horizon. All keep clear of the words.
  const lanes = [7.5, -2.5, 9.5, 0.5, 6, -1, 10.5, 1.5];
  return Array.from({ length: CLOUD_SLOTS }, (_, i) => {
    const far = i % 2 === 0;
    const w = far ? 10 + r() * 6 : 20 + r() * 9;
    const h = w * (far ? 0.34 : 0.4);
    const dur = (far ? 11 : 6.5) * PRIMES[12 + Math.floor(r() * 10)] * (0.9 + r() * 0.2);
    const phase = (i * 0.382 + r() * 0.2) % 1;
    const shape = cloudShape(rng(seed + i * 7919), w * 10, h * 10);
    return {
      far,
      w,
      h,
      y: lanes[i] + (r() - 0.5) * 1.5,
      dur,
      delay: -phase * dur,
      rest: -50 + phase * 175,
      shape,
      id: `c${seed % 997}x${i}`,
    };
  });
}

function Clouds({ seed, count }: { seed: number; count: number }) {
  return (
    <>
      {cloudSlots(seed)
        .map((c, i) => ({ c, i }))
        // The far clouds go behind the near ones.
        .sort((a, b) => Number(!a.c.far) - Number(!b.c.far))
        .map(({ c, i }) => {
          const { billows, base, rows } = c.shape;
          const W = c.w * 10;
          const circles = (dr: number, fill?: string) =>
            billows.map((b, k) => (
              <circle
                key={k}
                cx={b.x.toFixed(1)}
                cy={b.y.toFixed(1)}
                r={(b.r + dr).toFixed(1)}
                fill={fill}
              />
            ));
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
                  viewBox={`-10 -10 ${W + 20} ${c.h * 10 + 20}`}
                  style={{ width: rem(c.w + 2), height: rem(c.h + 2) }}
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                >
                  <defs>
                    {/* The flat base: nothing below it. */}
                    <clipPath id={`${c.id}b`}>
                      <rect x={-10} y={-10} width={W + 20} height={base + 10} />
                    </clipPath>
                    <clipPath id={c.id}>{circles(0)}</clipPath>
                  </defs>
                  <g clipPath={`url(#${c.id}b)`}>
                    {/* The silhouette: every billow outlined, then the insides painted out. */}
                    <g strokeWidth={c.far ? 1.1 : 1.4}>{circles(0)}</g>
                    <g stroke="none">{circles(-1.1, "var(--paper)")}</g>
                    <g clipPath={`url(#${c.id})`} className="sky-cloud-hatch">
                      {rows.map((row, k) => (
                        <line
                          key={k}
                          x1={-10}
                          x2={W + 10}
                          y1={row.y.toFixed(1)}
                          y2={row.y.toFixed(1)}
                          strokeWidth={row.w.toFixed(2)}
                          opacity={row.o.toFixed(2)}
                          strokeDasharray={row.dash || undefined}
                        />
                      ))}
                    </g>
                  </g>
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

function Stars({
  seed,
  show,
  clear,
  part,
}: {
  seed: number;
  show: boolean;
  clear: boolean;
  part: "dust" | "twinkle";
}) {
  const { twinkle, dust } = starSpots(seed);
  // Under cloud, only the brightest show through.
  const shown = clear ? twinkle : twinkle.filter((s) => s.bright);
  if (part === "dust") {
    return (
      <Layer show={show} className="sky-fill">
        <svg viewBox="0 0 1200 675" className="sky-fill text-ink-faint" fill="currentColor">
          {(clear ? dust : dust.slice(0, 20)).map(([x, y, s], i) => (
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
  return (
    <Layer show={show} className="sky-fill">
      <div className="sky-fill">
        {shown.map((s, i) => (
          <svg
            key={i}
            viewBox="-5 -5 10 10"
            className={`sky-star ${s.bright ? "text-ink-soft" : "text-ink-faint"}`}
            style={{
              left: rem(s.x),
              top: rem(s.y),
              width: rem(s.s * 1.6),
              height: rem(s.s * 1.6),
              animationDuration: `${s.dur.toFixed(2)}s`,
              animationDelay: `${s.delay.toFixed(2)}s`,
            }}
          >
            <Star x={0} y={0} s={1.3} />
          </svg>
        ))}
      </div>
    </Layer>
  );
}

function ShootingStar({ seed, show }: { seed: number; show: boolean }) {
  const r = rng(seed ^ 0x2545f491);
  const x = 40 + r() * 60;
  const y = 3 + r() * 14;
  return (
    <Layer show={show} className="sky-fill">
      <div
        className="sky-meteor"
        style={{ left: rem(x), top: rem(y), animationDelay: `${(-r() * 400).toFixed(0)}s` }}
      >
        <svg
          viewBox="0 0 200 10"
          className="text-ink-soft"
          style={{ width: "14rem", height: "0.7rem" }}
        >
          <path d="M0 5 L196 3.6 Q200 5 196 6.4 Z" fill="currentColor" opacity={0.9} />
        </svg>
      </div>
    </Layer>
  );
}

/* ---------------------------------------------------------------- birds */

function Birds({ seed, show }: { seed: number; show: boolean }) {
  const r = rng(seed ^ 0x27d4eb2f);
  const y = 6 + r() * 12;
  const birds = [
    [0, 0, 1],
    [3.2, 1.4, 0.8],
    [5.6, -0.6, 0.7],
    [1.6, 2.8, 0.75],
  ];
  return (
    <Layer show={show} className="sky-fill">
      <div
        className="sky-flock"
        style={{ top: rem(y), animationDelay: `${(-r() * 500).toFixed(0)}s` }}
      >
        <div className="sky-bob">
          <svg
            viewBox="0 0 90 50"
            style={{ width: "9rem", height: "5rem" }}
            className="text-ink-soft"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
          >
            {birds.map(([x, y, s], i) => (
              <path
                key={i}
                d={`M${10 + x * 10} ${20 + y * 10} q${4 * s} ${-4 * s} ${8 * s} ${0.5 * s} q${4 * s} ${-4.5 * s} ${8 * s} ${-0.5 * s}`}
                strokeWidth={1.5}
              />
            ))}
          </svg>
        </div>
      </div>
    </Layer>
  );
}

/* ---------------------------------------------------------------- mist */

function Mist({ seed, fog, dawn }: { seed: number; fog: boolean; dawn: boolean }) {
  const r = rng(seed ^ 0x165667b1);
  const bands = [ARC.cy - 3, 41, 56];
  return (
    <>
      {bands.map((y, b) => {
        const lines = Array.from({ length: 5 }, (_, k) => {
          const yy = 6 + k * 9 + r() * 3;
          let d = `M0 ${yy.toFixed(1)}`;
          for (let x = 0; x < 1700; x += 140) {
            d += ` q70 ${((r() - 0.5) * 9).toFixed(1)} 140 0`;
          }
          return {
            d,
            w: k === 2 ? 1.4 : 0.8,
            dash: `${(160 + r() * 260).toFixed(0)} ${(60 + r() * 140).toFixed(0)}`,
          };
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
                    strokeWidth={l.w}
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

// Each layer is a tile of marks, repeated over the sheet and moved by exactly
// one tile, so the loop is seamless; three depths at different speeds and
// tile sizes, so the pattern never lines up.
const RAIN = [
  { tw: 5, th: 19, n: 6, len: 1, sw: 0.9, ms: 3100, cls: "sky-rain-far" },
  { tw: 7, th: 23, n: 5, len: 1.5, sw: 1.1, ms: 2300, cls: "sky-rain-mid" },
  { tw: 11, th: 29, n: 4, len: 2.2, sw: 1.4, ms: 1700, cls: "sky-rain-near" },
];
const SNOW = [
  { tw: 17, th: 23, n: 9, size: 0.18, ms: 41000, sway: 9000, cls: "sky-snow-far" },
  { tw: 19, th: 29, n: 6, size: 0.42, ms: 29000, sway: 13000, cls: "sky-snow-mid" },
  { tw: 23, th: 37, n: 4, size: 0.7, ms: 19000, sway: 17000, cls: "sky-snow-near" },
];

function Fall({ kind, hard }: { kind: Sky["fall"]; hard: boolean }) {
  const wet = kind === "rain" || kind === "storms";
  return (
    <>
      {RAIN.map((L, i) => {
        const r = rng(4049 + i);
        const slant = L.tw / L.th;
        const marks = Array.from({ length: L.n }, () => {
          // Kept inside the tile, so no mark is cut at a seam.
          const len = L.len * 10 * (0.75 + r() * 0.5);
          const x = len * slant + 2 + r() * (L.tw * 10 - len * slant - 4);
          const y = 2 + r() * (L.th * 10 - len - 4);
          return `M${x.toFixed(1)} ${y.toFixed(1)}l${(-len * slant).toFixed(1)} ${len.toFixed(1)}`;
        }).join("");
        return (
          <Layer key={`r${i}`} show={wet && (hard || i < 2)} className={`sky-fill ${L.cls}`}>
            <Tiled tw={L.tw} th={L.th} ms={L.ms} slide id={`rain${i}`}>
              <path d={marks} stroke="currentColor" strokeWidth={L.sw} strokeLinecap="round" />
            </Tiled>
          </Layer>
        );
      })}
      {SNOW.map((L, i) => {
        const r = rng(7027 + i);
        const flakes = Array.from({ length: L.n }, (_, k) => {
          const s = L.size * 10 * (0.7 + r() * 0.6);
          const x = s + 1 + r() * (L.tw * 10 - 2 * s - 2);
          const y = s + 1 + r() * (L.th * 10 - 2 * s - 2);
          if (i === 0) return <circle key={k} cx={x} cy={y} r={s} fill="currentColor" />;
          return (
            <g
              key={k}
              stroke="currentColor"
              strokeWidth={i === 2 ? 1.1 : 0.9}
              strokeLinecap="round"
            >
              {[0, 60, 120].map((a) => {
                const c = Math.cos((a * Math.PI) / 180) * s;
                const sn = Math.sin((a * Math.PI) / 180) * s;
                return (
                  <line
                    key={a}
                    x1={(x - c).toFixed(1)}
                    y1={(y - sn).toFixed(1)}
                    x2={(x + c).toFixed(1)}
                    y2={(y + sn).toFixed(1)}
                  />
                );
              })}
            </g>
          );
        });
        return (
          <Layer
            key={`s${i}`}
            show={kind === "snow" && (hard || i < 2)}
            className={`sky-fill ${L.cls}`}
          >
            <div className="sky-fill sky-sway" style={{ animationDuration: `${L.sway}ms` }}>
              <Tiled tw={L.tw} th={L.th} ms={L.ms} id={`snow${i}`}>
                {flakes}
              </Tiled>
            </div>
          </Layer>
        );
      })}
    </>
  );
}

function Tiled({
  tw,
  th,
  ms,
  slide = false,
  id,
  children,
}: {
  tw: number;
  th: number;
  ms: number;
  slide?: boolean;
  id: string;
  children: ReactNode;
}) {
  const W = 120 + tw * 2;
  const H = 67.5 + th * 2;
  return (
    <div
      className="sky-tile"
      style={
        {
          left: rem(-tw * 1.5),
          top: rem(-th * 1.5),
          width: rem(W),
          height: rem(H),
          "--tx": slide ? rem(tw) : "0rem",
          "--ty": rem(th),
          animationDuration: `${ms}ms`,
        } as CSSProperties
      }
    >
      <svg viewBox={`0 0 ${W * 10} ${H * 10}`} className="sky-fill" fill="none">
        <defs>
          <pattern id={id} width={tw * 10} height={th * 10} patternUnits="userSpaceOnUse">
            {children}
          </pattern>
        </defs>
        <rect width={W * 10} height={H * 10} fill={`url(#${id})`} />
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
  Stars: memo(Stars),
  ShootingStar: memo(ShootingStar),
  Clouds: memo(Clouds),
  Birds: memo(Birds),
  Mist: memo(Mist),
  Fall: memo(Fall),
};

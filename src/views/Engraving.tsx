import { useId } from "react";
import { skyKind } from "./Sky";

/*
 * The sky as a copperplate engraving: tapered strokes, hatched shadows, fine
 * lines that thicken and thin. Never a uniform-stroke icon. Drawn on a
 * 100 x 100 plate in currentColor; paper-colored fills occlude where one
 * thing sits in front of another.
 */

type Kind = ReturnType<typeof skyKind>;

// A cloud with billows above and below, as an engraver would draw it.
const CLOUD =
  "M24 64 C14 64 10 55 16 50 C12 42 20 34 29 37 C31 27 44 22 52 30 C57 21 73 22 75 34 C84 33 91 41 87 49 C93 53 90 63 81 63 C78 68 70 69 66 65 C61 70 52 70 48 65 C43 70 33 70 30 65 C28 66 26 65 24 64 Z";

/** Parallel hatching, clipped to a shape: the engraver's shadow. */
function Hatch({
  clip,
  from,
  to,
  gap = 3.2,
  w = 0.7,
  angle = 0,
}: {
  clip: string;
  from: number;
  to: number;
  gap?: number;
  w?: number;
  angle?: number;
}) {
  const lines = [];
  for (let y = from; y <= to; y += gap) {
    lines.push(<line key={y} x1={-20} y1={y} x2={120} y2={y} />);
  }
  return (
    <g clipPath={`url(#${clip})`} strokeWidth={w}>
      <g transform={`rotate(${angle} 50 50)`}>{lines}</g>
    </g>
  );
}

/** A ray that tapers to a point, like a burin's cut. */
function Ray({
  cx,
  cy,
  a,
  r0,
  r1,
  w,
}: {
  cx: number;
  cy: number;
  a: number;
  r0: number;
  r1: number;
  w: number;
}) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const px = -s * w;
  const py = c * w;
  const x0 = cx + c * r0;
  const y0 = cy + s * r0;
  return (
    <path
      d={`M${(x0 + px).toFixed(2)} ${(y0 + py).toFixed(2)} L${(cx + c * r1).toFixed(2)} ${(cy + s * r1).toFixed(2)} L${(x0 - px).toFixed(2)} ${(y0 - py).toFixed(2)} Z`}
      fill="currentColor"
      stroke="none"
    />
  );
}

function Sun({
  cx = 50,
  cy = 50,
  r = 15,
  rays = 16,
}: {
  cx?: number;
  cy?: number;
  r?: number;
  rays?: number;
}) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} strokeWidth={1.9} fill="var(--paper)" />
      <circle cx={cx} cy={cy} r={r * 0.78} strokeWidth={0.55} />
      {Array.from({ length: rays }, (_, i) => {
        const a = (i / rays) * Math.PI * 2 - Math.PI / 2;
        const long = i % 2 === 0;
        return (
          <Ray
            key={i}
            cx={cx}
            cy={cy}
            a={a}
            r0={r + 4}
            r1={r + (long ? r * 1.35 : r * 0.8)}
            w={long ? 1.5 : 0.9}
          />
        );
      })}
    </g>
  );
}

/** Fraction of the moon's cycle since new moon, 0..1. */
export function moonAge(date: Date): number {
  const synodic = 29.530588853;
  const knownNew = Date.UTC(2000, 0, 6, 18, 14); // a new moon
  const days = (date.getTime() - knownNew) / 86_400_000;
  return (((days / synodic) % 1) + 1) % 1;
}

/** The moon in its true phase: the lit limb crisp, the dark side hatched. */
export function Moon({
  age,
  cx = 50,
  cy = 50,
  r = 22,
}: {
  age: number;
  cx?: number;
  cy?: number;
  r?: number;
}) {
  const id = `m${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const k = Math.cos(2 * Math.PI * age);
  const rx = Math.round(Math.abs(k) * r * 100) / 100;
  const waxing = age < 0.5;
  const crescent = age < 0.25 || age > 0.75;
  const top = `${cx} ${cy - r}`;
  const bot = `${cx} ${cy + r}`;
  const lit = waxing
    ? `M${top} A${r} ${r} 0 0 1 ${bot} A${rx} ${r} 0 0 ${crescent ? 0 : 1} ${top} Z`
    : `M${top} A${r} ${r} 0 0 0 ${bot} A${rx} ${r} 0 0 ${crescent ? 1 : 0} ${top} Z`;
  return (
    <g>
      <defs>
        <clipPath id={id}>
          <circle cx={cx} cy={cy} r={r} />
        </clipPath>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill="var(--paper)" stroke="none" />
      {/* The dark side, barely there: earthshine in fine hatching. */}
      <g opacity={0.45}>
        <Hatch clip={id} from={cy - r} to={cy + r} gap={2.6} w={0.45} angle={-30} />
      </g>
      <circle cx={cx} cy={cy} r={r} strokeWidth={0.6} opacity={0.7} />
      <path d={lit} fill="var(--moon-lit, var(--paper))" strokeWidth={1.6} />
      {/* A few craters on the lit face. */}
      <g strokeWidth={0.6} opacity={0.6} clipPath={`url(#${id}l)`}>
        <circle cx={cx + (waxing ? 6 : -6)} cy={cy - 6} r={3} />
        <circle cx={cx + (waxing ? 11 : -11)} cy={cy + 7} r={2} />
      </g>
      <defs>
        <clipPath id={`${id}l`}>
          <path d={lit} />
        </clipPath>
      </defs>
    </g>
  );
}

/** A small four-pointed star. */
export function Star({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const a = 3.2 * s;
  const b = 0.7 * s;
  return (
    <path
      d={[
        [x, y - a],
        [x + b, y - b],
        [x + a, y],
        [x + b, y + b],
        [x, y + a],
        [x - b, y + b],
        [x - a, y],
        [x - b, y - b],
      ]
        .map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(2)} ${py.toFixed(2)}`)
        .join(" ")
        .concat(" Z")}
      fill="currentColor"
      stroke="none"
    />
  );
}

function Cloud({ id, dy = 0 }: { id: string; dy?: number }) {
  return (
    <g transform={`translate(0 ${dy})`}>
      <defs>
        <clipPath id={id}>
          <path d={CLOUD} />
        </clipPath>
      </defs>
      <path d={CLOUD} fill="var(--paper)" stroke="none" />
      {/* Contour hatching along the underside: the shadow follows the form. */}
      <g clipPath={`url(#${id})`}>
        {[0, 3, 6, 9, 12].map((o, i) => (
          <path
            key={o}
            d={`M10 ${66 - o} C28 ${71 - o} 70 ${71 - o} 92 ${61 - o}`}
            strokeWidth={0.75 - i * 0.12}
            opacity={1 - i * 0.16}
          />
        ))}
      </g>
      <path d={CLOUD} strokeWidth={1.7} />
      {/* Inner billows, cut fine. */}
      <path
        d="M29 37 C33 40 34 44 33 47 M52 30 C55 33 56 37 55 41 M75 34 C73 38 72 41 74 44"
        strokeWidth={0.7}
      />
    </g>
  );
}

/** One engraved symbol for a weather code. */
export function Engraving({
  code,
  isDay,
  date,
  className,
}: {
  code: number;
  isDay: boolean;
  date?: Date;
  className?: string;
}) {
  const id = `e${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const kind: Kind = skyKind(code, isDay);
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === "sun" && <Sun />}
      {kind === "moon" && (
        <>
          <Moon age={moonAge(date ?? new Date())} cx={46} cy={52} r={24} />
          <Star x={82} y={22} s={1.2} />
          <Star x={14} y={20} s={0.8} />
          <Star x={84} y={74} s={0.7} />
        </>
      )}
      {kind === "partly" &&
        (isDay ? (
          <>
            <Sun cx={38} cy={38} r={12} rays={14} />
            <Cloud id={id} dy={8} />
          </>
        ) : (
          <>
            <Moon age={moonAge(date ?? new Date())} cx={36} cy={36} r={15} />
            <Cloud id={id} dy={10} />
          </>
        ))}
      {kind === "cloud" && <Cloud id={id} />}
      {kind === "fog" &&
        [28, 40, 52, 64, 76].map((y, i) => (
          <path
            key={y}
            d={`M${14 + (i % 2) * 8} ${y} C30 ${y - 3} 42 ${y + 3} 55 ${y} S78 ${y - 3} ${86 - (i % 2) * 6} ${y}`}
            strokeWidth={i === 2 ? 1.8 : 1.1}
          />
        ))}
      {(kind === "rain" || kind === "snow" || kind === "storm") && <Cloud id={id} dy={-12} />}
      {kind === "rain" &&
        [
          [28, 62, 9],
          [38, 66, 13],
          [48, 61, 10],
          [58, 67, 14],
          [68, 62, 9],
          [33, 79, 7],
          [53, 81, 8],
          [73, 77, 6],
        ].map(([x, y, l]) => (
          <line key={`${x}${y}`} x1={x} y1={y} x2={x - l * 0.35} y2={y + l} strokeWidth={1} />
        ))}
      {kind === "snow" &&
        [
          [30, 66],
          [50, 72],
          [70, 66],
          [40, 84],
          [62, 86],
        ].map(([x, y]) => (
          <g key={`${x}${y}`} strokeWidth={0.9}>
            {[0, 60, 120].map((a) => (
              <line
                key={a}
                x1={x - 4}
                y1={y}
                x2={x + 4}
                y2={y}
                transform={`rotate(${a} ${x} ${y})`}
              />
            ))}
          </g>
        ))}
      {kind === "storm" && (
        <path
          d="M52 56 L42 74 L50 74 L44 92 L62 68 L54 68 L60 56 Z"
          fill="currentColor"
          stroke="none"
        />
      )}
    </svg>
  );
}

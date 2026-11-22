import { useId } from "react";
import type { Mark } from "@/lib/holidays";
import { Hatch, Star } from "./Engraving";

/*
 * A holiday's mark, in the same copperplate hand as the sky's engravings
 * (Engraving.tsx): a 100 x 100 plate in currentColor, paper fills where one
 * thing sits in front of another, hatching for shadow.
 */

/** A turkey in profile, its tail fanned behind it. */
function Turkey({ id }: { id: string }) {
  const [px, py] = [56, 58];
  const feathers = Array.from({ length: 9 }, (_, i) => -160 + i * 17.5);
  return (
    <>
      {feathers.map((deg) => {
        const a = (deg * Math.PI) / 180;
        const [ux, uy] = [Math.cos(a), Math.sin(a)];
        const at = (r: number, s = 0) =>
          `${(px + ux * r - uy * s).toFixed(2)} ${(py + uy * r + ux * s).toFixed(2)}`;
        return (
          <g key={deg}>
            <ellipse
              cx={px + ux * 23}
              cy={py + uy * 23}
              rx={17}
              ry={6}
              transform={`rotate(${deg} ${px + ux * 23} ${py + uy * 23})`}
              fill="var(--paper)"
              strokeWidth={1.2}
            />
            <path d={`M${at(10)} L${at(37)}`} strokeWidth={0.5} />
            <path d={`M${at(31, -4.6)} Q${at(34)} ${at(31, 4.6)}`} strokeWidth={0.9} />
            <circle
              cx={px + ux * 35.5}
              cy={py + uy * 35.5}
              r={1.4}
              fill="currentColor"
              stroke="none"
            />
          </g>
        );
      })}
      <defs>
        <clipPath id={`${id}b`}>
          <ellipse cx={52} cy={65} rx={21} ry={15} />
        </clipPath>
      </defs>
      <ellipse cx={52} cy={65} rx={21} ry={15} fill="var(--paper)" strokeWidth={1.6} />
      <Hatch clip={`${id}b`} from={66} to={82} gap={2.6} w={0.55} angle={-18} />
      {/* The folded wing, its flight feathers cut in a few lines. */}
      <path
        d="M44 61 C52 56 66 57 71 66 C65 71 55 73 46 70 C48 67 47 64 44 61 Z"
        fill="var(--paper)"
        strokeWidth={1.1}
      />
      <path d="M50 63 C57 62 63 64 67 67 M49 67 C56 66 61 68 64 70" strokeWidth={0.6} />
      <path
        d="M37 62 C30 56 27 49 28 42 L36 42 C36 47 38 52 44 57 Z"
        fill="var(--paper)"
        strokeWidth={1.3}
      />
      <circle cx={32} cy={38} r={5.5} fill="var(--paper)" strokeWidth={1.3} />
      <circle cx={31} cy={37} r={0.9} fill="currentColor" stroke="none" />
      <path d="M27 36.5 L21 38.6 L27 40.4 Z" fill="currentColor" stroke="none" />
      {/* The wattle, hanging from the beak. */}
      <path d="M26.5 41 C24 45 24.6 49.5 27 51 C29 49 29 45 28.4 41.5" strokeWidth={1} />
      <path
        d="M46 79 L44 90 M40 92 L44 90 L47 92 M56 79 L57 90 M53 92 L57 90 L60 92"
        strokeWidth={1.1}
      />
    </>
  );
}

/** A fir in three tiers, a star on top, hatched on its shaded side. */
function Tree({ id }: { id: string }) {
  const tiers: [number, number, number][] = [
    [44, 82, 30],
    [28, 62, 22],
    [16, 42, 14],
  ];
  return (
    <>
      <path d="M46 82 L46 91 L54 91 L54 82" fill="var(--paper)" strokeWidth={1.3} />
      <path d="M49 84 L49 90 M51.5 84 L51.5 90" strokeWidth={0.5} />
      <defs>
        <clipPath id={`${id}s`}>
          <rect x={52} y={0} width={48} height={100} />
        </clipPath>
      </defs>
      {tiers.map(([top, base, hw], i) => {
        const n = 5 - i;
        const step = (2 * hw) / n;
        const scallops = Array.from(
          { length: n },
          (_, j) =>
            `Q${(50 - hw + step * (j + 0.5)).toFixed(1)} ${base + 3.2} ${(50 - hw + step * (j + 1)).toFixed(1)} ${base}`,
        ).join(" ");
        const mid = (top + base) / 2 + 3;
        const d = `M50 ${top} Q${50 - hw * 0.45} ${mid} ${50 - hw} ${base} ${scallops} Q${50 + hw * 0.45} ${mid} 50 ${top} Z`;
        const clip = `${id}t${i}`;
        const y = top + (base - top) * 0.62;
        return (
          <g key={top}>
            <defs>
              <clipPath id={clip}>
                <path d={d} />
              </clipPath>
            </defs>
            <path d={d} fill="var(--paper)" strokeWidth={1.5} />
            <g clipPath={`url(#${id}s)`}>
              <Hatch clip={clip} from={top} to={base + 4} gap={2.6} w={0.5} angle={28} />
            </g>
            {/* A garland across the tier, hung with a few ornaments. */}
            <path
              d={`M${50 - hw * 0.62} ${y - 3} Q50 ${y + 4} ${50 + hw * 0.62} ${y - 3}`}
              strokeWidth={0.7}
            />
            {[-0.34, 0.06, 0.42].map((f) => (
              <circle
                key={f}
                cx={50 + hw * f}
                // On the garland's curve, hanging just below it.
                cy={y + 0.5 - 3.5 * (f / 0.62) ** 2 + 2.4}
                r={1.5}
                fill="currentColor"
                stroke="none"
              />
            ))}
          </g>
        );
      })}
      <Star x={50} y={11} s={2.2} />
    </>
  );
}

/** A jack-o'-lantern: ribbed, stemmed, grinning. */
function Pumpkin({ id }: { id: string }) {
  return (
    <>
      <path
        d="M47 36 C46 29 48 23 52 19 L56.5 21 C53.5 25 52.5 30 53.5 36 Z"
        fill="var(--paper)"
        strokeWidth={1.3}
      />
      <path d="M50.5 34 C50 29 51 25 53.5 21.5" strokeWidth={0.5} />
      <path d="M55 27 C62 21 70 25 66 30 C63 33 60 30 63 28.5" strokeWidth={0.8} />
      <defs>
        <clipPath id={`${id}p`}>
          <ellipse cx={50} cy={61} rx={35} ry={26} />
        </clipPath>
        <clipPath id={`${id}r`}>
          <path d="M66 0 L100 0 L100 100 L60 100 Z" />
        </clipPath>
      </defs>
      <ellipse cx={50} cy={61} rx={35} ry={26} fill="var(--paper)" strokeWidth={1.7} />
      <g clipPath={`url(#${id}r)`}>
        <Hatch clip={`${id}p`} from={35} to={88} gap={2.6} w={0.5} angle={-28} />
      </g>
      <ellipse cx={50} cy={61} rx={23} ry={26} strokeWidth={0.8} />
      <ellipse cx={50} cy={61} rx={9} ry={26} strokeWidth={0.8} />
      <path d="M33 54 L42 54 L37.5 46 Z" fill="currentColor" stroke="none" />
      <path d="M58 54 L67 54 L62.5 46 Z" fill="currentColor" stroke="none" />
      <path d="M48 62 L52 62 L50 58 Z" fill="currentColor" stroke="none" />
      <path
        d="M31 67 Q50 82 69 67 L65 68.6 L62 66 L58 70.5 L54 67.6 L50 72.4 L46 67.6 L42 70.5 L38 66 L35 68.6 Z"
        fill="currentColor"
        stroke="none"
      />
    </>
  );
}

const HEART =
  "M50 84 C30 68 14 56 14 40 C14 28 23 20 33 20 C41 20 47 25 50 32 C53 25 59 20 67 20 C77 20 86 28 86 40 C86 56 70 68 50 84 Z";

/** A heart, double-ruled, shaded low on its right. */
function Heart({ id }: { id: string }) {
  return (
    <>
      <defs>
        <clipPath id={`${id}h`}>
          <path d={HEART} />
        </clipPath>
        <clipPath id={`${id}s`}>
          <path d="M30 100 L100 22 L100 100 Z" />
        </clipPath>
      </defs>
      <path d={HEART} fill="var(--paper)" strokeWidth={1.8} />
      <g clipPath={`url(#${id}s)`}>
        <Hatch clip={`${id}h`} from={18} to={90} gap={2.6} w={0.55} angle={-35} />
      </g>
      <path
        d={HEART}
        transform="translate(50 50) scale(0.8) translate(-50 -50)"
        strokeWidth={0.6}
      />
    </>
  );
}

// A heart-shaped leaflet, its point at the origin, opening upward.
const LEAF =
  "M0 0 C-4 -6 -17 -10 -17 -21 C-17 -28 -10 -31 -5 -29 C-2 -28 0 -25 0 -23 C0 -25 2 -28 5 -29 C10 -31 17 -28 17 -21 C17 -10 4 -6 0 0 Z";

/** A shamrock: three leaflets and a curling stem. */
function Shamrock() {
  return (
    <>
      <path d="M50 50 C51 64 55 77 63 88" strokeWidth={1.8} />
      {[0, 120, 240].map((deg) => (
        <g key={deg} transform={`translate(50 48) rotate(${deg})`}>
          <path d={LEAF} fill="var(--paper)" strokeWidth={1.5} />
          <path
            d="M0 -3 L0 -21 M0 -9 L-6 -16 M0 -9 L6 -16 M0 -15 L-7 -22 M0 -15 L7 -22"
            strokeWidth={0.5}
          />
        </g>
      ))}
    </>
  );
}

const EGG = "M50 12 C70 12 80 44 80 62 C80 80 66 90 50 90 C34 90 20 80 20 62 C20 44 30 12 50 12 Z";

/** A painted egg: a zigzag band, a band of dots, a shaded flank. */
function Egg({ id }: { id: string }) {
  const zig = Array.from({ length: 15 }, (_, i) => `${16 + i * 5} ${i % 2 ? 51 : 45}`).join(" L");
  return (
    <>
      <defs>
        <clipPath id={`${id}e`}>
          <path d={EGG} />
        </clipPath>
        <clipPath id={`${id}s`}>
          <path d="M62 0 L100 0 L100 100 L56 100 Z" />
        </clipPath>
      </defs>
      <path d={EGG} fill="var(--paper)" strokeWidth={1.7} />
      <g clipPath={`url(#${id}s)`}>
        <Hatch clip={`${id}e`} from={10} to={92} gap={2.6} w={0.5} angle={-20} />
      </g>
      <g clipPath={`url(#${id}e)`}>
        <path d="M10 42 C30 40 70 40 90 42 M10 54 C30 52 70 52 90 54" strokeWidth={0.9} />
        <path d={`M${zig}`} strokeWidth={0.9} />
        <path d="M10 64 C30 62 70 62 90 64 M10 74 C30 72 70 72 90 74" strokeWidth={0.9} />
        {[26, 34, 42, 50, 58, 66, 74].map((x) => (
          <circle key={x} cx={x} cy={68.6} r={1.5} fill="currentColor" stroke="none" />
        ))}
        <path d="M40 24 L50 32 L60 24 M44 18 L50 23 L56 18" strokeWidth={0.7} />
      </g>
    </>
  );
}

/** A burst of rays, each ending in a spark. */
function Burst({ cx, cy, r, n }: { cx: number; cy: number; r: number; n: number }) {
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        const long = i % 2 === 0;
        const r1 = long ? r : r * 0.72;
        const [c, s] = [Math.cos(a), Math.sin(a)];
        return (
          <g key={i}>
            <line
              x1={cx + c * r * 0.22}
              y1={cy + s * r * 0.22}
              x2={cx + c * r1}
              y2={cy + s * r1}
              strokeWidth={long ? 1.1 : 0.6}
            />
            <circle
              cx={cx + c * (r1 + 3)}
              cy={cy + s * (r1 + 3)}
              r={long ? 1.4 : 0.9}
              fill="currentColor"
              stroke="none"
            />
          </g>
        );
      })}
    </g>
  );
}

/** Fireworks: one great burst, two smaller, and the trail that rose to them. */
function Firework() {
  return (
    <>
      <path d="M52 97 C51 82 50 66 50 54" strokeWidth={0.7} strokeDasharray="2 3" />
      <Burst cx={50} cy={38} r={26} n={20} />
      <Burst cx={81} cy={72} r={11} n={12} />
      <Burst cx={19} cy={74} r={8} n={10} />
      <Star x={84} y={14} s={1} />
      <Star x={16} y={22} s={0.8} />
    </>
  );
}

/** The flag on its pole, rippling: the stripes ruled, the canton hatched and starred. */
function Flag({ id }: { id: string }) {
  const shape = "M20 16 C40 10 56 22 84 16 L84 58 C56 64 40 52 20 58 Z";
  const canton = "M20 16 C27 13.6 35 13.4 43 15.1 L43 39.1 C35 37.4 27 37.6 20 40 Z";
  return (
    <>
      <defs>
        <clipPath id={`${id}c`}>
          <path d={canton} />
        </clipPath>
      </defs>
      <path d={shape} fill="var(--paper)" strokeWidth={1.4} />
      {[1, 2, 3, 4, 5, 6].map((i) => {
        const y = 16 + i * 6;
        return <path key={i} d={`M20 ${y} C40 ${y - 6} 56 ${y + 6} 84 ${y}`} strokeWidth={0.8} />;
      })}
      <path d={canton} fill="var(--paper)" strokeWidth={1} />
      <Hatch clip={`${id}c`} from={10} to={42} gap={1.8} w={0.5} />
      {[0, 1, 2].flatMap((r) =>
        [0, 1, 2].map((c) => (
          <circle
            key={`${r}${c}`}
            cx={25 + c * 7.5}
            cy={20 + r * 7 - c * 0.4}
            r={1.5}
            fill="var(--paper)"
            stroke="none"
          />
        )),
      )}
      <line x1={20} y1={12} x2={20} y2={94} strokeWidth={1.9} />
      <circle cx={20} cy={9} r={2.6} fill="var(--paper)" strokeWidth={1.2} />
    </>
  );
}

export function HolidayMark({ mark, className }: { mark: Mark; className?: string }) {
  const id = `h${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
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
      {mark === "turkey" && <Turkey id={id} />}
      {mark === "tree" && <Tree id={id} />}
      {mark === "pumpkin" && <Pumpkin id={id} />}
      {mark === "heart" && <Heart id={id} />}
      {mark === "shamrock" && <Shamrock />}
      {mark === "egg" && <Egg id={id} />}
      {mark === "firework" && <Firework />}
      {mark === "flag" && <Flag id={id} />}
    </svg>
  );
}

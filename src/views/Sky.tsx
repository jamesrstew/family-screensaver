import { precipKind } from "@/lib/forecast";

// The sky as a small engraving: a few strokes of ink, never an app icon.

type Kind = "sun" | "moon" | "partly" | "cloud" | "fog" | "rain" | "snow" | "storm";

export function skyKind(code: number, isDay: boolean): Kind {
  if (code <= 1) return isDay ? "sun" : "moon";
  if (code === 2) return "partly";
  if (code === 45 || code === 48) return "fog";
  const p = precipKind(code);
  if (p === "storms") return "storm";
  if (p === "snow") return "snow";
  if (p === "rain") return "rain";
  return "cloud";
}

const CLOUD = "M13 32 H35 A6 6 0 0 0 35 20 A9 9 0 0 0 18 18 A7 7 0 0 0 13 32 Z";

function Rays({ cx, cy, r, len }: { cx: number; cy: number; r: number; len: number }) {
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return (
          <line
            key={i}
            x1={cx + Math.cos(a) * r}
            y1={cy + Math.sin(a) * r}
            x2={cx + Math.cos(a) * (r + len)}
            y2={cy + Math.sin(a) * (r + len)}
          />
        );
      })}
    </>
  );
}

export function Sky({
  code,
  isDay,
  className,
}: {
  code: number;
  isDay: boolean;
  className?: string;
}) {
  const kind = skyKind(code, isDay);
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === "sun" && (
        <>
          <circle cx="24" cy="24" r="7.5" />
          <Rays cx={24} cy={24} r={11} len={5} />
        </>
      )}
      {kind === "moon" && <path d="M29 11 A13 13 0 1 0 37 31 A10.5 10.5 0 0 1 29 11 Z" />}
      {kind === "partly" && (
        <>
          <circle cx="18" cy="17" r="5" />
          <Rays cx={18} cy={17} r={7.5} len={3.5} />
          <path d="M17 37 H37 A5.5 5.5 0 0 0 37 26 A8 8 0 0 0 22 24.5 A6 6 0 0 0 17 37 Z" />
        </>
      )}
      {kind === "cloud" && <path d={CLOUD} />}
      {kind === "fog" && (
        <>
          <line x1="10" y1="17" x2="36" y2="17" />
          <line x1="14" y1="23" x2="40" y2="23" />
          <line x1="8" y1="29" x2="32" y2="29" />
          <line x1="16" y1="35" x2="38" y2="35" />
        </>
      )}
      {(kind === "rain" || kind === "snow" || kind === "storm") && (
        <path d={CLOUD} transform="translate(0 -7)" />
      )}
      {kind === "rain" && (
        <>
          <line x1="17" y1="31" x2="15" y2="37" />
          <line x1="24" y1="31" x2="22" y2="39" />
          <line x1="31" y1="31" x2="29" y2="37" />
        </>
      )}
      {kind === "snow" && (
        <g strokeWidth={1.4}>
          {[
            [16, 34],
            [24, 38],
            [32, 34],
          ].map(([x, y]) => (
            <g key={x}>
              <line x1={x - 2.5} y1={y} x2={x + 2.5} y2={y} />
              <line x1={x - 1.3} y1={y - 2.2} x2={x + 1.3} y2={y + 2.2} />
              <line x1={x - 1.3} y1={y + 2.2} x2={x + 1.3} y2={y - 2.2} />
            </g>
          ))}
        </g>
      )}
      {kind === "storm" && <path d="M25 27 L20 34 H25 L22 41" />}
    </svg>
  );
}

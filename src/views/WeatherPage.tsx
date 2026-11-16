import { Ink } from "@/components/Ink";
import { forecastLine, precipKind } from "@/lib/forecast";
import { clock, parts, weekdayOf } from "@/lib/time";
import type { Weather } from "@/lib/types";
import { Leader, SectionHead, Temp, type ViewProps } from "./parts";

export function WeatherPage({ snapshot, now }: ViewProps) {
  const w = snapshot.weather;
  const tz = snapshot.timeZone;
  return (
    <div className="flex h-full flex-col">
      <Ink order={0}>
        <SectionHead title="The Weather" snapshot={snapshot} now={now} />
      </Ink>
      {!w ? (
        <Ink order={1} className="flex flex-1 items-center justify-center">
          <p className="text-[3rem] text-ink-soft italic">
            The weather report hasn&rsquo;t come in yet.
          </p>
        </Ink>
      ) : (
        <>
          <Ink order={1} className="mt-8 grid grid-cols-[1fr_28rem] items-start gap-14">
            <p className="text-[3.6rem] leading-[1.2]">{forecastLine(w, now, snapshot.timeZone)}</p>
            <div className="pt-2">
              <Leader label="Now" value={`${w.now.temp}° ${w.now.label.toLowerCase()}`} />
              <Leader label="Sunrise" value={clock(new Date(w.today.sunrise), tz)} />
              <Leader label="Sunset" value={clock(new Date(w.today.sunset), tz)} />
            </div>
          </Ink>
          <Ink order={2} className="mt-4 flex-1">
            <TemperatureLine hours={w.hours} timeZone={tz} />
          </Ink>
          <Ink order={3} className="mt-auto">
            <Week days={w.days} />
          </Ink>
        </>
      )}
    </div>
  );
}

/** The next day's temperatures, drawn as one stroke of ink. */
function TemperatureLine({ hours, timeZone }: { hours: Weather["hours"]; timeZone: string }) {
  if (hours.length < 2) return null;
  const W = 1740;
  const H = 300;
  const pad = 50;
  const temps = hours.map((h) => h.temp);
  const lo = Math.min(...temps);
  const hi = Math.max(...temps);
  const span = Math.max(hi - lo, 6);
  const x = (i: number) => (i / (hours.length - 1)) * W;
  const y = (t: number) => pad + (1 - (t - lo) / span) * (H - pad * 2);
  // A smooth curve through every hour (Catmull-Rom as cubic Béziers).
  const pts = hours.map((h, i) => [x(i), y(h.temp)] as const);
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[Math.max(i - 1, 0)];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const [x3, y3] = pts[Math.min(i + 2, pts.length - 1)];
    d += ` C ${x1 + (x2 - x0) / 6} ${y1 + (y2 - y0) / 6}, ${x2 - (x3 - x1) / 6} ${y2 - (y3 - y1) / 6}, ${x2} ${y2}`;
  }

  return (
    <figure>
      <svg viewBox={`-20 0 ${W + 40} ${H + 60}`} className="w-full overflow-visible">
        <path
          d={d}
          fill="none"
          stroke="var(--ink)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {hours.map((h, i) =>
          i % 3 === 0 ? (
            <g key={h.time}>
              <circle cx={x(i)} cy={y(h.temp)} r="5" fill="var(--ink)" />
              <text
                x={x(i)}
                y={y(h.temp) - 16}
                textAnchor="middle"
                fill="var(--ink)"
                style={{ font: "400 26px var(--font-fell)" }}
              >
                {h.temp}°
              </text>
              <text
                x={x(i)}
                y={H + 46}
                textAnchor="middle"
                fill="var(--ink-soft)"
                style={{ font: "400 24px var(--font-fell-sc)", letterSpacing: "0.06em" }}
              >
                {hourLabel(h.time, timeZone)}
              </text>
            </g>
          ) : null,
        )}
      </svg>
    </figure>
  );
}

function hourLabel(iso: string, timeZone: string) {
  const { hour } = parts(new Date(iso), timeZone);
  if (hour === 0) return "midnight";
  if (hour === 12) return "noon";
  return `${hour % 12} ${hour < 12 ? "a.m." : "p.m."}`;
}

function Week({ days }: { days: Weather["days"] }) {
  return (
    <div>
      <div className="rule-double" />
      <div className="grid grid-cols-7 divide-x divide-rule/40">
        {days.slice(0, 7).map((d, i) => (
          <div key={d.date} className="px-4 pt-4 text-center">
            <p className="kicker text-[1.45rem]">{i === 0 ? "Today" : weekdayOf(d.date)}</p>
            <p className="mt-1 text-[3.3rem] leading-none">
              <Temp v={d.high} />
              <span className="text-[2rem] text-ink-soft">
                {" "}
                / <Temp v={d.low} />
              </span>
            </p>
            <p className="mt-2 text-[1.55rem] leading-tight italic">{d.label}</p>
            <p className="mt-1 h-[1.8rem] text-[1.35rem] text-ink-soft">
              {d.precipChance >= 20 && precipKind(d.code)
                ? `${d.precipChance}% ${precipKind(d.code)}`
                : ""}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

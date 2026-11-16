import type { ReactNode } from "react";
import { Ink } from "@/components/Ink";
import { forecastLine } from "@/lib/forecast";
import { clock, clockFace } from "@/lib/time";
import type { Weather as Sky } from "@/lib/types";
import { Engraving, Moon, Star, moonAge } from "../Engraving";
import type { ViewProps } from "../parts";
import {
  Credit,
  Words,
  dayShort,
  firstTomorrow,
  heroOf,
  hourWord,
  nextUp,
  nextWords,
  sized,
  steps,
  sunProgress,
  Deg,
} from "./common";

/*
 * D. Almanac. Across the head of the page, the day's sky is drawn as one
 * dotted arc from sunrise to sunset, and the sun (an engraving) sits where it
 * really is. You can tell the time of day from across the room without
 * reading a number. After sunset the moon takes the arc, in its true phase.
 * Below the sky, one passage, which writes itself line by line.
 */

const LADDER: Array<[number, string]> = [
  [70, "text-[5.2rem] leading-[1.14]"],
  [130, "text-[4.4rem] leading-[1.2]"],
  [200, "text-[3.8rem] leading-[1.24]"],
  [260, "text-[3.4rem] leading-[1.28]"],
  [9999, "text-[3rem] leading-[1.3]"],
];

// The sky plate: 109 x 21 rem at 10 units per rem.
const W = 1090;
const H = 210;
const ARC = { cx: W / 2, cy: 186, rx: 470, ry: 150 };
const at = (t: number) => {
  const a = Math.PI * (1 - Math.min(Math.max(t, 0), 1));
  return { x: ARC.cx + ARC.rx * Math.cos(a), y: ARC.cy - ARC.ry * Math.sin(a) };
};
const pct = (p: { x: number; y: number }) => ({
  left: `${((p.x / W) * 100).toFixed(3)}%`,
  top: `${((p.y / H) * 100).toFixed(3)}%`,
});

/** Where we are on today's arc, and which body is riding it. */
function skyNow(w: Sky, now: Date): { t: number; body: "sun" | "moon"; from: Date; to: Date } {
  const rise = Date.parse(w.today.sunrise);
  const set = Date.parse(w.today.sunset);
  const t = sunProgress(w, now);
  const DAY = 86_400_000;
  if (t >= 0 && t <= 1) return { t, body: "sun", from: new Date(rise), to: new Date(set) };
  // Night: from last sunset to next sunrise.
  const [from, to] = t > 1 ? [set, rise + DAY] : [set - DAY, rise];
  return {
    t: (now.getTime() - from) / (to - from),
    body: "moon",
    from: new Date(from),
    to: new Date(to),
  };
}

/** Deterministic stars for the night arc. */
const STARS = Array.from({ length: 26 }, (_, i) => {
  const r = (n: number) => {
    const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const t = r(1);
  const p = at(t);
  const lift = 0.15 + r(2) * 0.8;
  return { x: p.x, y: ARC.cy - (ARC.cy - p.y) * lift - 4, s: 0.5 + r(3) * 0.8 };
});

function SkyPlate({
  w,
  now,
  tz,
  night = false,
  children,
}: {
  w: Sky;
  now: Date;
  tz: string;
  night?: boolean;
  children?: ReactNode;
}) {
  const sky = skyNow(w, now);
  // Keep the body clear of the horizon's ends so it never sits on a label.
  const p = at(Math.min(Math.max(sky.t, 0.07), 0.93));
  // Low in the sky, the time rides above the body instead of below it.
  const low = p.y > ARC.cy - 70;
  const nearStart = sky.t < 0.2;
  const nearEnd = sky.t > 0.8;

  return (
    <div className="relative h-[21rem] w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 h-full w-full text-ink-faint"
        fill="none"
        stroke="currentColor"
        aria-hidden
      >
        {/* The horizon: one fine line. */}
        <line x1={20} y1={ARC.cy} x2={W - 20} y2={ARC.cy} strokeWidth={1.1} />
        {/* The path of the sky, dotted; the part already traveled a little darker. */}
        <path
          d={`M${ARC.cx - ARC.rx} ${ARC.cy} A${ARC.rx} ${ARC.ry} 0 0 1 ${ARC.cx + ARC.rx} ${ARC.cy}`}
          strokeWidth={1.5}
          strokeDasharray="0.1 9"
          strokeLinecap="round"
        />
        <path
          d={`M${ARC.cx - ARC.rx} ${ARC.cy} A${ARC.rx} ${ARC.ry} 0 0 1 ${p.x.toFixed(1)} ${p.y.toFixed(1)}`}
          strokeWidth={2.2}
          strokeDasharray="0.1 9"
          strokeLinecap="round"
          className="text-ink-soft"
        />
        {night
          ? STARS.map((s, i) => (
              <g key={i} className="text-ink-soft">
                <Star x={s.x} y={s.y} s={s.s} />
              </g>
            ))
          : null}
      </svg>
      {/* The two ends of the arc: when the sky began, when it ends. */}
      <p
        className={`absolute top-[18.9rem] left-[3.2rem] text-[1.5rem] text-ink-faint italic ${nearStart ? "opacity-0" : ""}`}
      >
        {sky.body === "sun" ? "sunrise " : "sunset "}
        {clock(sky.from, tz)}
      </p>
      <p
        className={`absolute top-[18.9rem] right-[3.2rem] text-[1.5rem] text-ink-faint italic ${nearEnd ? "opacity-0" : ""}`}
      >
        {sky.body === "sun" ? "sunset " : "sunrise "}
        {clock(sky.to, tz)}
      </p>
      {/* The body itself, where it really is. */}
      <div className="absolute -translate-x-1/2 -translate-y-1/2" style={pct(p)}>
        {sky.body === "sun" ? (
          <Engraving code={w.now.code} isDay date={now} className="size-[8rem] text-ink" />
        ) : (
          <svg
            viewBox="0 0 100 100"
            className="size-[6.4rem] text-ink"
            fill="none"
            stroke="currentColor"
            aria-hidden
          >
            <Moon age={moonAge(now)} cx={50} cy={50} r={30} />
          </svg>
        )}
      </div>
      <div
        className={`absolute -translate-x-1/2 text-center whitespace-nowrap ${low ? "-translate-y-full pb-[4.4rem]" : "pt-[4.2rem]"}`}
        style={pct(p)}
      >
        {children}
      </div>
    </div>
  );
}

export function Home(props: ViewProps) {
  const { snapshot, now, mood } = props;
  const tz = snapshot.timeZone;
  const hero = heroOf(props);
  const next = nextUp(props);
  const w = snapshot.weather;

  return (
    <div className="flex h-full flex-col">
      {w ? (
        <Ink order={0} mode="seep">
          <SkyPlate w={w} now={now} tz={tz}>
            <p className="text-[2.2rem] leading-none text-ink-soft">
              {clockFace(now, tz)}
              <span className="mx-[0.8rem] text-ink-faint">·</span>
              <Deg v={w.now.temp} />
            </p>
          </SkyPlate>
        </Ink>
      ) : null}
      <Ink
        k={hero?.id ?? "none"}
        order={1}
        className="flex flex-1 items-center justify-center px-[7rem] pb-[1rem] text-center"
      >
        {hero ? (
          <article className="max-w-[84rem]">
            {hero.kind === "question" && mood === "evening" ? (
              <p className="mb-[1.8rem] text-[2rem] text-accent italic">A question for the table</p>
            ) : null}
            <Words item={hero} className={sized(hero.text, LADDER)} />
            <Credit item={hero} className="mt-[2.2rem] text-[1.75rem] text-ink-faint" />
          </article>
        ) : null}
      </Ink>
      {next ? (
        <Ink order={2} mode="seep" className="text-center">
          <p className="text-[1.9rem] text-ink-soft">
            <span className="text-ink-faint italic">Next, </span>
            {nextWords(next, tz)}
          </p>
        </Ink>
      ) : null}
    </div>
  );
}

export function Night(props: ViewProps) {
  const { snapshot, now } = props;
  const tz = snapshot.timeZone;
  const w = snapshot.weather;
  const tomorrow = firstTomorrow(props);
  const question = heroOf({ ...props, mood: "evening" });
  return (
    <div className="flex h-full flex-col">
      {w ? (
        <Ink order={0} mode="seep">
          <SkyPlate w={w} now={now} tz={tz} night>
            <p className="text-[3.2rem] leading-none text-ink">{clockFace(now, tz)}</p>
          </SkyPlate>
        </Ink>
      ) : (
        <Ink order={0} className="pt-[8rem] text-center">
          <p className="text-[6rem] text-ink">{clockFace(now, tz)}</p>
        </Ink>
      )}
      {question?.kind === "question" ? (
        <Ink order={1} className="flex flex-1 items-center justify-center text-center">
          <p className="max-w-[64rem] text-[2.5rem] leading-[1.35] text-ink-soft italic">
            {question.text}
          </p>
        </Ink>
      ) : (
        <div className="flex-1" />
      )}
      {tomorrow ? (
        <Ink order={2} mode="seep" className="text-center">
          <p className="text-[1.8rem] text-ink-faint">
            <span className="italic">{tomorrow.label}, </span>
            {tomorrow.title}
            {tomorrow.when ? `, ${tomorrow.when}` : ""}
          </p>
        </Ink>
      ) : null}
    </div>
  );
}

/** Weather: the coming day laid along the same arc, hour by hour. */
export function Weather({ snapshot, now }: ViewProps) {
  const w = snapshot.weather;
  const tz = snapshot.timeZone;
  if (!w) {
    return (
      <Ink className="flex h-full items-center justify-center">
        <p className="text-[3rem] text-ink-soft italic">The sky hasn&rsquo;t reported in yet.</p>
      </Ink>
    );
  }
  const marks = steps(w, 3, 8);
  return (
    <div className="flex h-full flex-col">
      <Ink order={0} mode="seep" className="relative h-[24rem] w-full">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="absolute inset-0 h-full w-full text-ink-faint"
          fill="none"
          stroke="currentColor"
          aria-hidden
        >
          <path
            d={`M${ARC.cx - ARC.rx} ${ARC.cy} A${ARC.rx} ${ARC.ry} 0 0 1 ${ARC.cx + ARC.rx} ${ARC.cy}`}
            strokeWidth={1.6}
            strokeDasharray="0.1 9"
            strokeLinecap="round"
          />
        </svg>
        {marks.map((h, i) => {
          const p = at((i + 0.5) / marks.length);
          return (
            <div
              key={h.time}
              className="absolute -translate-x-1/2 -translate-y-[70%] text-center"
              style={pct(p)}
            >
              <Engraving
                code={h.code ?? w.now.code}
                isDay={h.isDay ?? true}
                date={new Date(h.time)}
                className="mx-auto size-[6.4rem] text-ink"
              />
              <p className="text-[2.3rem] leading-none text-ink">
                <Deg v={h.temp} />
              </p>
              <p className="mt-[0.3rem] text-[1.4rem] text-ink-soft italic">
                {hourWord(h.time, tz)}
              </p>
            </div>
          );
        })}
      </Ink>
      <Ink order={1} className="flex flex-1 items-center justify-center px-[8rem] text-center">
        <p className="text-[4.4rem] leading-[1.18]">{forecastLine(w)}</p>
      </Ink>
      <Ink order={2} mode="seep" className="flex justify-center gap-[4.4rem]">
        {w.days.slice(1, 7).map((d, i) => (
          <div key={d.date} className="flex items-center gap-[0.6rem]">
            <p className="text-[1.8rem] text-ink-soft italic">{dayShort(d.date, i + 1)}</p>
            <Engraving code={d.code} isDay date={now} className="size-[3.6rem] text-ink" />
            <p className="text-[2rem] text-ink">
              <Deg v={d.high} />
            </p>
          </div>
        ))}
      </Ink>
    </div>
  );
}

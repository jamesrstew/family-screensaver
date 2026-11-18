import type { CSSProperties } from "react";
import { nowIsFresh, precipKind, skyWords } from "@/lib/forecast";
import type { Clip } from "@/lib/nature";
import type { Weather } from "@/lib/types";
import { CLOUD_BOX, Cloud } from "@/views/Engraving";
import { Sky } from "@/views/Sky";
import type { ViewProps } from "@/views/parts";
import { ClockFace, dayShort, degrees, firstTomorrow, hourWord } from "@/views/designs/common";
import { Ink } from "./Ink";

/*
 * The strip at the foot of a nature clip: a few quiet lines over the picture,
 * like the notes on home. On the left, always, where the clip was filmed and
 * the hour. On the right, one of the page's own views in turn, half a minute
 * each: the weather now, the next hours, the days, what's next. Behind the
 * right, the real weather drawn small: an engraved cloud or two drifting,
 * rain or snow falling, by transform alone.
 */

const TURN_MS = 30_000;
const HOUR = 3_600_000;
type View = "now" | "hours" | "days" | "next";

export function NatureStrip(props: ViewProps & { clip: Clip }) {
  const { snapshot, now, clip } = props;
  const tz = snapshot.timeZone;
  const w = snapshot.weather && nowIsFresh(snapshot.weather, now) ? snapshot.weather : null;
  const next = firstTomorrow(props);
  const views = (["now", "hours", "days", "next"] as View[]).filter((v) =>
    v === "next" ? Boolean(next) : Boolean(w),
  );
  const view = views.length ? views[Math.floor(now.getTime() / TURN_MS) % views.length] : null;

  return (
    <div className="nature-strip absolute inset-x-0 bottom-0 flex items-end justify-between">
      {w ? <StripSky w={w} /> : null}
      <div className="relative">
        {clip.place ? (
          <Ink k={clip.id} order={0} mode="seep">
            <p className="mb-[0.5rem] text-[2.2rem] leading-tight text-ink-soft italic">
              {clip.place}
            </p>
          </Ink>
        ) : null}
        <Ink order={1} mode="seep">
          <p className="text-[3.6rem] leading-none text-ink">
            <ClockFace now={now} tz={tz} />
          </p>
        </Ink>
      </div>
      <Ink k={view ?? "none"} order={2} mode="seep" className="relative text-right">
        {view === "now" && w ? <Now w={w} inside={props.inside ?? null} /> : null}
        {view === "hours" && w ? <Hours w={w} now={now} tz={tz} /> : null}
        {view === "days" && w ? <Days w={w} /> : null}
        {view === "next" && next ? (
          <p className="text-[2.8rem] leading-none text-ink">
            <span className="text-ink-soft italic">{next.label}, </span>
            {next.title}
            {next.when ? <span className="text-ink-soft">, {next.when}</span> : null}
          </p>
        ) : null}
      </Ink>
    </div>
  );
}

/** "53° Sunny", and under it the day's high and low, and the house. */
function Now({ w, inside }: { w: Weather; inside: number | null }) {
  return (
    <div className="flex items-end gap-[1.4rem]">
      <Sky code={w.now.code} isDay={w.now.isDay} className="mb-[0.2rem] h-[4.4rem] w-[4.4rem]" />
      <div>
        <p className="text-[3.6rem] leading-none text-ink">
          {degrees(w.now.temp)}{" "}
          <span className="text-ink-soft italic">{skyWords(w.now.code, w.now.isDay)}</span>
        </p>
        <p className="mt-[0.7rem] text-[2rem] leading-none text-ink-soft">
          High {degrees(w.today.high)}, low {degrees(w.today.low)}
          {inside != null ? (
            <>
              <span className="text-ink-faint"> · </span>
              {degrees(inside)} <span className="italic">inside</span>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}

/** The next hours, every other one: the hour, its sky, its temperature. */
function Hours({ w, now, tz }: { w: Weather; now: Date; tz: string }) {
  const hours = w.hours
    .filter((h) => Date.parse(h.time) + HOUR > now.getTime())
    .filter((_, i) => i % 2 === 0)
    .slice(0, 6);
  return (
    <div className="flex items-end gap-[2.6rem]">
      {hours.map((h, i) => (
        <div key={h.time} className="text-center">
          <p className="text-[1.85rem] leading-none text-ink-soft italic">
            {i === 0 ? "Now" : hourWord(h.time, tz)}
          </p>
          <Sky
            code={h.code ?? w.now.code}
            isDay={h.isDay ?? true}
            className="mx-auto my-[0.5rem] h-[3rem] w-[3rem]"
          />
          <p className="text-[2.6rem] leading-none text-ink">{degrees(h.temp)}</p>
        </div>
      ))}
    </div>
  );
}

/** The next days: the day, its sky, its high and low. */
function Days({ w }: { w: Weather }) {
  return (
    <div className="flex items-end gap-[2.6rem]">
      {w.days.slice(0, 5).map((d, i) => (
        <div key={d.date} className="text-center">
          <p className="text-[1.85rem] leading-none text-ink-soft italic">{dayShort(d.date, i)}</p>
          <Sky code={d.code} isDay className="mx-auto my-[0.5rem] h-[3rem] w-[3rem]" />
          <p className="text-[2.6rem] leading-none whitespace-nowrap text-ink">
            {degrees(d.high)} <span className="text-ink-soft">{degrees(d.low)}</span>
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * The weather now, drawn small behind the strip's right side: a cloud or
 * two drifting slowly to and fro, and rain or snow falling. Each is one
 * layer moved by transform; nothing repaints.
 */
function StripSky({ w }: { w: Weather }) {
  const code = w.now.code;
  const clouds = code === 0 ? 0 : code === 1 ? 1 : code === 2 ? 2 : 3;
  const fall = precipKind(code);
  return (
    <div aria-hidden className="strip-sky">
      {Array.from({ length: clouds }, (_, i) => (
        <svg
          key={i}
          viewBox={CLOUD_BOX}
          className="strip-cloud"
          style={{ "--i": i } as CSSProperties}
          fill="none"
          stroke="currentColor"
        >
          <Cloud id={`strip-cloud-${i}`} fine />
        </svg>
      ))}
      {fall === "snow" ? <Fall kind="snow" /> : fall ? <Fall kind="rain" /> : null}
    </div>
  );
}

/** Rain as fine slanting strokes, snow as dots: two identical tiles, falling one tile, again and again. */
function Fall({ kind }: { kind: "rain" | "snow" }) {
  const marks = Array.from({ length: 36 }, (_, i) => {
    const x = (i * 37) % 100;
    const y = (i * 53) % 50;
    return kind === "rain" ? (
      <line key={i} x1={x} y1={y} x2={x - 1.2} y2={y + 4} />
    ) : (
      <circle key={i} cx={x} cy={y} r={0.45} />
    );
  });
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={`strip-fall strip-fall-${kind}`}
      stroke="currentColor"
      fill="currentColor"
      strokeWidth={0.25}
      vectorEffect="non-scaling-stroke"
    >
      <g>{marks}</g>
      <g transform="translate(0 50)">{marks}</g>
    </svg>
  );
}

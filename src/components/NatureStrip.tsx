import { useState } from "react";
import { nowIsFresh, skyWords } from "@/lib/forecast";
import type { Clip } from "@/lib/nature";
import type { Weather } from "@/lib/types";
import { Sky } from "@/views/Sky";
import type { ViewProps } from "@/views/parts";
import { ClockFace, dayShort, degrees, firstTomorrow, hourWord } from "@/views/designs/common";
import { Ink } from "./Ink";

/*
 * The notes over a nature clip, like the notes on home. In the top-left
 * corner, always, the hour and outside and inside; in the top-right, one
 * of the page's own views in turn, half a minute each, always opening on
 * the weather now: now, the next hours, the days, and what's next. At the
 * foot, in the middle, where the clip was filmed. The weather is carried by its engraved
 * symbols alone: drawn clouds or rain over a photograph read as outlines
 * floating on it, so there are none.
 *
 * It's put on the page only once the clip is fully up, and sinks before the
 * clip does (Screen, Nature.tsx): no type over a picture still surfacing.
 */

const TURN_MS = 30_000;
const HOUR = 3_600_000;
type StripView = "now" | "hours" | "days" | "next";
const VIEWS: StripView[] = ["now", "hours", "days", "next"];

export function NatureStrip(props: ViewProps & { clip: Clip }) {
  const { snapshot, now, clip } = props;
  const tz = snapshot.timeZone;
  const w = snapshot.weather && nowIsFresh(snapshot.weather, now) ? snapshot.weather : null;
  const next = firstTomorrow(props);
  const views = VIEWS.filter((v) => (v === "next" ? Boolean(next) : Boolean(w)));
  // Counted from when the strip came (it's keyed by the clip), so it opens on the first.
  const [since] = useState(() => now.getTime());
  const turn = Math.max(Math.floor((now.getTime() - since) / TURN_MS), 0);
  const view = views.length ? views[turn % views.length] : null;
  const outside = w ? w.now.temp : null;
  const inside = props.inside ?? null;

  return (
    <div className="nature-strip absolute inset-0">
      {/* The page's top margin is 3.25 rem; the notes sit at 3. */}
      <div className="absolute top-[-0.25rem] left-0">
        <Ink order={1} mode="seep">
          <p className="text-[3.6rem] leading-none text-ink">
            <ClockFace now={now} tz={tz} />
          </p>
        </Ink>
        {outside != null || inside != null ? (
          <Ink order={2} mode="seep">
            <p className="mt-[0.8rem] text-[2rem] leading-none whitespace-nowrap text-ink">
              {outside != null ? (
                <>
                  {degrees(outside)} <span className="text-ink-soft italic">outside</span>
                </>
              ) : null}
              {outside != null && inside != null ? (
                <span className="text-ink-faint"> · </span>
              ) : null}
              {inside != null ? (
                <>
                  {degrees(inside)} <span className="text-ink-soft italic">inside</span>
                </>
              ) : null}
            </p>
          </Ink>
        ) : null}
      </div>
      <Ink
        k={view ?? "none"}
        order={3}
        mode="seep"
        plain
        className="absolute top-[-0.25rem] right-0 text-right"
      >
        {view === "now" && w ? <Now w={w} /> : null}
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
      {clip.place ? (
        // Where the clip was filmed, apart from the hour and the temperatures
        // (which are ours, not its): one quiet line at the foot, in the middle,
        // clear of the marks footage carries in its lower corners.
        <Ink
          order={0}
          mode="seep"
          className="absolute inset-x-0 bottom-[0.2rem] flex justify-center"
        >
          <p className="max-w-[44rem] truncate text-[2.2rem] leading-tight text-ink-soft italic">
            {clip.place}
          </p>
        </Ink>
      ) : null}
    </div>
  );
}

/** The sky now, in its engraving and in words. */
function Now({ w }: { w: Weather }) {
  return (
    <div className="flex items-end gap-[1.4rem]">
      <Sky code={w.now.code} isDay={w.now.isDay} className="h-[4.4rem] w-[4.4rem]" />
      <p className="text-[3.6rem] leading-none text-ink italic">
        {skyWords(w.now.code, w.now.isDay)}
      </p>
    </div>
  );
}

/** The next five hours, every other one: the hour, its sky, its temperature. */
function Hours({ w, now, tz }: { w: Weather; now: Date; tz: string }) {
  const hours = w.hours
    .filter((h) => Date.parse(h.time) + HOUR > now.getTime())
    .filter((_, i) => i % 2 === 0)
    .slice(1, 6);
  return (
    <div className="flex items-end gap-[2.6rem]">
      {hours.map((h) => (
        <div key={h.time} className="text-center">
          <p className="text-[2rem] leading-none text-ink italic">{hourWord(h.time, tz)}</p>
          <Sky
            code={h.code ?? w.now.code}
            isDay={h.isDay ?? true}
            className="mx-auto my-[0.5rem] h-[3.4rem] w-[3.4rem]"
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
          <p className="text-[2rem] leading-none text-ink italic">{dayShort(d.date, i)}</p>
          <Sky code={d.code} isDay className="mx-auto my-[0.5rem] h-[3.4rem] w-[3.4rem]" />
          <p className="text-[2.6rem] leading-none whitespace-nowrap text-ink">
            {degrees(d.high)} {degrees(d.low)}
          </p>
        </div>
      ))}
    </div>
  );
}

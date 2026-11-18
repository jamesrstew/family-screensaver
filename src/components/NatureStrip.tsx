import { useState } from "react";
import { nowIsFresh, skyWords } from "@/lib/forecast";
import type { Clip } from "@/lib/nature";
import type { Weather } from "@/lib/types";
import { Sky } from "@/views/Sky";
import type { ViewProps } from "@/views/parts";
import { ClockFace, dayShort, degrees, firstTomorrow, hourWord } from "@/views/designs/common";
import { Ink } from "./Ink";

/*
 * The strip at the foot of a nature clip: a few quiet lines over the picture,
 * like the notes on home. On the left, always, where the clip was filmed, the
 * hour, and outside and inside. On the right, one of the page's own views in
 * turn, half a minute each, always opening on the weather now: in the
 * carousel's minute, now and what's next; in nature mode, now, the next
 * hours, the days, and what's next. The weather is carried by its engraved
 * symbols alone: drawn clouds or rain over a photograph read as outlines
 * floating on it, so there are none.
 *
 * It's put on the page only once the clip is fully up, and sinks before the
 * clip does (Screen, Nature.tsx): no type over a picture still surfacing.
 */

const TURN_MS = 30_000;
const HOUR = 3_600_000;
export type StripView = "now" | "hours" | "days" | "next";
export const CAROUSEL_VIEWS: StripView[] = ["now", "next"];
export const MODE_VIEWS: StripView[] = ["now", "hours", "days", "next"];

export function NatureStrip(props: ViewProps & { clip: Clip; views: StripView[] }) {
  const { snapshot, now, clip } = props;
  const tz = snapshot.timeZone;
  const w = snapshot.weather && nowIsFresh(snapshot.weather, now) ? snapshot.weather : null;
  const next = firstTomorrow(props);
  const views = props.views.filter((v) => (v === "next" ? Boolean(next) : Boolean(w)));
  // Counted from when the strip came (it's keyed by the clip), so it opens on the first.
  const [since] = useState(() => now.getTime());
  const turn = Math.max(Math.floor((now.getTime() - since) / TURN_MS), 0);
  const view = views.length ? views[turn % views.length] : null;
  const outside = w ? w.now.temp : null;
  const inside = props.inside ?? null;

  return (
    // The left block starts well clear of the mark footage carries low on the left.
    <div className="nature-strip absolute right-0 bottom-0 left-[16rem] flex items-end justify-between">
      <div>
        {clip.place ? (
          <Ink order={0} mode="seep">
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
      <Ink k={view ?? "none"} order={3} mode="seep" plain className="text-right">
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
          <p className="text-[2rem] leading-none text-ink italic">
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
          <p className="text-[2rem] leading-none text-ink italic">{dayShort(d.date, i)}</p>
          <Sky code={d.code} isDay className="mx-auto my-[0.5rem] h-[3rem] w-[3rem]" />
          <p className="text-[2.6rem] leading-none whitespace-nowrap text-ink">
            {degrees(d.high)} <span className="text-ink-soft">{degrees(d.low)}</span>
          </p>
        </div>
      ))}
    </div>
  );
}

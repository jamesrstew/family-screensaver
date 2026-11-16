/* eslint-disable @next/next/no-img-element -- a fixed local placeholder, no optimization needed */
import { Ink } from "@/components/Ink";
import { forecastLine } from "@/lib/forecast";
import { clock, clockFace } from "@/lib/time";
import { Engraving, Moon, moonAge } from "../Engraving";
import type { ViewProps } from "../parts";
import {
  Words,
  dayShort,
  firstTomorrow,
  heroOf,
  hourWord,
  nextUp,
  nextWords,
  steps,
  Deg,
} from "./common";

/*
 * C. Plate. A photograph, printed in ink tones and mounted on the paper like
 * a plate in an old book. It develops when it arrives (the shadows come up
 * first) and then breathes, a slow push in over fifteen minutes, the way the
 * pictures in the wizarding papers are never quite still. A caption beneath.
 *
 * The photograph here is a clearly labeled placeholder (Ansel Adams, 1942,
 * public domain). Family photographs come later, through the Photos Picker.
 */

const PHOTO = {
  src: "/placeholder/landscape.jpg",
  title: "The Tetons and the Snake River",
  credit: "Placeholder: Ansel Adams, 1942, public domain",
};

function Print({ className = "" }: { className?: string }) {
  return (
    <div
      className={`overflow-hidden outline outline-[0.0625rem] outline-offset-[0.7rem] outline-rule ${className}`}
    >
      <img src={PHOTO.src} alt="" className="breathe block h-full w-full object-cover" />
    </div>
  );
}

export function Home(props: ViewProps) {
  const { snapshot, now, mood } = props;
  const tz = snapshot.timeZone;
  const next = nextUp(props);
  const w = snapshot.weather;
  const hero = heroOf(props);
  const evening = mood === "evening" && hero?.kind === "question";

  const facts = (
    <p className="flex items-baseline gap-[1.8rem] text-[1.85rem] text-ink-soft">
      <span>{clock(now, tz)}</span>
      {w ? (
        <span className="flex items-center gap-[0.5rem] self-center">
          <Engraving
            code={w.now.code}
            isDay={w.now.isDay}
            date={now}
            className="-my-[0.8rem] size-[3rem]"
          />
          <Deg v={w.now.temp} />
        </span>
      ) : null}
      {next ? <span className="italic">{nextWords(next, tz)}</span> : null}
    </p>
  );

  if (evening && hero) {
    return (
      <div className="flex h-full items-center gap-[6rem]">
        <Ink order={0} mode="develop" className="shrink-0">
          <Print className="h-[40rem] w-[56rem]" />
          <p className="mt-[1.8rem] text-[1.5rem] text-ink-faint italic">{PHOTO.credit}</p>
        </Ink>
        <div className="flex flex-col">
          <Ink k={hero.id} order={1}>
            <p className="spaced mb-[2rem] text-[1.35rem] text-ink-faint">For the table</p>
            <Words item={hero} className="text-[4rem] leading-[1.22]" />
          </Ink>
          <Ink order={2} className="mt-[4rem]">
            {facts}
          </Ink>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col items-center">
      <Ink order={0} mode="develop">
        <Print className="h-[53rem] w-[88rem]" />
      </Ink>
      <div className="mt-[2.2rem] flex w-[88rem] items-start justify-between">
        <Ink order={1}>
          <p className="text-[2rem] leading-tight text-ink-soft italic">{PHOTO.title}</p>
          <p className="mt-[0.3rem] text-[1.35rem] text-ink-faint">{PHOTO.credit}</p>
        </Ink>
        <Ink order={2} className="text-right">
          <p className="flex items-center justify-end gap-[1.4rem] text-[2rem] leading-tight text-ink-soft">
            <span>{clock(now, tz)}</span>
            {w ? (
              <span className="flex items-center gap-[0.4rem]">
                <Engraving
                  code={w.now.code}
                  isDay={w.now.isDay}
                  date={now}
                  className="-my-[0.6rem] size-[3rem]"
                />
                <Deg v={w.now.temp} />
              </span>
            ) : null}
          </p>
          {next ? (
            <p className="mt-[0.3rem] text-[1.6rem] text-ink-faint italic">{nextWords(next, tz)}</p>
          ) : null}
        </Ink>
      </div>
    </div>
  );
}

export function Night(props: ViewProps) {
  const { snapshot, now } = props;
  const tz = snapshot.timeZone;
  const tomorrow = firstTomorrow(props);
  const question = heroOf({ ...props, mood: "evening" });
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <Ink order={0}>
        <svg
          viewBox="0 0 100 100"
          className="mx-auto size-[7rem] text-ink-soft"
          fill="none"
          stroke="currentColor"
          aria-hidden
        >
          <Moon age={moonAge(now)} cx={50} cy={50} r={30} />
        </svg>
        <p className="mt-[2rem] text-[6.5rem] leading-none text-ink">{clockFace(now, tz)}</p>
      </Ink>
      {question?.kind === "question" ? (
        <Ink order={1} className="mt-[3rem] max-w-[60rem]">
          <p className="text-[2.3rem] leading-[1.35] text-ink-soft italic">{question.text}</p>
        </Ink>
      ) : null}
      {tomorrow ? (
        <Ink order={2} className="absolute inset-x-0 bottom-[0.5rem]">
          <p className="text-[1.75rem] text-ink-faint">
            {tomorrow.label}: {tomorrow.title}
            {tomorrow.when ? `, ${tomorrow.when}` : ""}
          </p>
        </Ink>
      ) : null}
    </div>
  );
}

/** Weather as a plate of the sky: the next day drawn as a frieze, hour by hour. */
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
  const frieze = steps(w, 3, 8);
  return (
    <div className="flex h-full flex-col">
      <Ink order={0} className="mt-[6rem] max-w-[90rem]">
        <p className="text-[4.6rem] leading-[1.16]">{forecastLine(w, now, snapshot.timeZone)}</p>
      </Ink>
      <Ink order={1} className="mt-[7rem]">
        <div className="grid grid-cols-8 border-y border-rule py-[2.4rem]">
          {frieze.map((h) => (
            <div key={h.time} className="flex flex-col items-center">
              <Engraving
                code={h.code ?? w.now.code}
                isDay={h.isDay ?? true}
                date={new Date(h.time)}
                className="size-[8.5rem] text-ink"
              />
              <p className="mt-[0.6rem] text-[2.6rem] leading-none">
                <Deg v={h.temp} />
              </p>
              <p className="mt-[0.8rem] text-[1.6rem] text-ink-soft italic">
                {hourWord(h.time, tz)}
              </p>
            </div>
          ))}
        </div>
      </Ink>
      <Ink order={2} className="mt-[2.4rem] flex justify-between px-[2rem]">
        {w.days.slice(1, 7).map((d, i) => (
          <p key={d.date} className="text-[1.9rem] text-ink-soft">
            {dayShort(d.date, i + 1)}{" "}
            <span className="text-ink">
              <Deg v={d.high} />
            </span>{" "}
            <span className="italic">{d.label.toLowerCase()}</span>
          </p>
        ))}
      </Ink>
    </div>
  );
}

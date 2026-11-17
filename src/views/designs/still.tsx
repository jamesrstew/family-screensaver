import { Ink } from "@/components/Ink";
import { forecastLine } from "@/lib/forecast";
import { clockFace, clock } from "@/lib/time";
import { Engraving } from "../Engraving";
import { NightPiece, type ViewProps } from "../parts";
import {
  Credit,
  Words,
  dayShort,
  firstTomorrow,
  heroOf,
  nextUp,
  nextWords,
  sized,
  Deg,
} from "./common";

/*
 * A. Still. One passage in the middle of an empty page, set like the last
 * page of a fine book. Everything else is a single quiet line at the foot:
 * the hour, the sky, what's next. No name, no date, no rules.
 */

const LADDER: Array<[number, string]> = [
  [70, "text-[5.6rem] leading-[1.16]"],
  [130, "text-[4.7rem] leading-[1.2]"],
  [200, "text-[4.1rem] leading-[1.24]"],
  [260, "text-[3.6rem] leading-[1.28]"],
  [9999, "text-[3.2rem] leading-[1.3]"],
];

export function Home(props: ViewProps) {
  const { snapshot, now } = props;
  const tz = snapshot.timeZone;
  const hero = heroOf(props);
  const next = nextUp(props);
  const w = snapshot.weather;
  const question = hero?.kind === "question";

  return (
    <div className="relative h-full">
      <Ink
        k={hero?.id ?? "none"}
        order={0}
        className="absolute inset-x-[7rem] top-[2rem] bottom-[8rem] flex items-center justify-center"
      >
        {hero ? (
          <article className="max-w-[82rem] text-center">
            {question ? (
              <p className="spaced mb-[2.4rem] text-[1.35rem] text-ink-faint">For the table</p>
            ) : null}
            <Words item={hero} className={`${sized(hero.text, LADDER)} text-ink`} />
            <Credit
              item={hero}
              className="mt-[2.6rem] text-[1.75rem] tracking-[0.02em] text-ink-faint"
            />
          </article>
        ) : null}
      </Ink>

      {/* The foot: one line, three facts. */}
      <Ink order={2} className="absolute inset-x-0 bottom-[0.5rem] flex justify-center">
        <p className="flex items-center gap-[2.2rem] text-[1.85rem] text-ink-soft">
          <span>{clock(now, tz)}</span>
          {w ? (
            <>
              <Dot />
              <span className="flex items-center gap-[0.6rem]">
                <Engraving
                  code={w.now.code}
                  isDay={w.now.isDay}
                  date={now}
                  className="-my-[0.6rem] size-[3.1rem]"
                />
                <Deg v={w.now.temp} />
              </span>
            </>
          ) : null}
          {next ? (
            <>
              <Dot />
              <span>{nextWords(next, tz)}</span>
            </>
          ) : null}
        </p>
      </Ink>
    </div>
  );
}

function Dot() {
  return <span className="inline-block size-[0.32rem] rounded-full bg-ink-faint" aria-hidden />;
}

export function Night(props: ViewProps) {
  const { snapshot, now } = props;
  const tz = snapshot.timeZone;
  const tomorrow = firstTomorrow(props);
  // One quiet piece (§4): the question until 6 p.m., then an idea or a quote.
  const piece = heroOf(props);
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <Ink order={0}>
        <p className="text-[7.5rem] leading-none tracking-[-0.01em] text-ink">
          {clockFace(now, tz)}
        </p>
      </Ink>
      {piece ? (
        <Ink order={1} className="mt-[3.4rem] max-w-[62rem]">
          <NightPiece item={piece} className="text-[2.3rem] leading-[1.35]" />
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

export function Weather({ snapshot, now }: ViewProps) {
  const w = snapshot.weather;
  if (!w) {
    return (
      <Ink className="flex h-full items-center justify-center">
        <p className="text-[3rem] text-ink-soft italic">The sky hasn&rsquo;t reported in yet.</p>
      </Ink>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 items-center gap-[5rem] px-[4rem]">
        <Ink order={0} className="shrink-0">
          <Engraving
            code={w.days[0]?.code ?? w.now.code}
            isDay
            date={now}
            className="size-[24rem] text-ink"
          />
        </Ink>
        <Ink order={1}>
          <p className="text-[4.6rem] leading-[1.18] text-ink">
            {forecastLine(w, now, snapshot.timeZone)}
          </p>
          <p className="mt-[2rem] text-[2.2rem] text-ink-soft">
            Now <Deg v={w.now.temp} />, and {w.now.label.toLowerCase()}. Tonight{" "}
            <Deg v={w.today.low} />.
          </p>
        </Ink>
      </div>
      <Ink order={2} className="grid grid-cols-7 pb-[0.5rem]">
        {w.days.slice(0, 7).map((d, i) => (
          <div key={d.date} className="flex flex-col items-center">
            <p className="text-[1.75rem] text-ink-soft">{dayShort(d.date, i)}</p>
            <Engraving code={d.code} isDay className="my-[0.4rem] size-[5.4rem] text-ink" />
            <p className="text-[2.3rem] leading-none text-ink">
              <Deg v={d.high} />
              <span className="ml-[0.6rem] text-[1.8rem] text-ink-faint">
                <Deg v={d.low} />
              </span>
            </p>
          </div>
        ))}
      </Ink>
    </div>
  );
}

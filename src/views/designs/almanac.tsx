import type { CSSProperties, ReactNode } from "react";
import { Ink } from "@/components/Ink";
import { nowIsFresh } from "@/lib/forecast";
import { clock } from "@/lib/time";
import type { NotebookItem, Weather as Sky } from "@/lib/types";
import type { ViewProps } from "../parts";
import { ARC, placeOf } from "./arc";
import {
  ClockFace,
  Credit,
  Words,
  firstTomorrow,
  nextUp,
  nextWords,
  fitStyle,
  heroBox,
  heroFitting,
  Deg,
  degrees,
} from "./common";
import { fitType, widthEm } from "./fit";

/*
 * D. Almanac. The sheet is a window onto the day's sky (living.tsx): one
 * dotted arc from sunrise to sunset across the head of the page, and the sun,
 * an engraving, sits where it really is. You can tell the time of day from
 * across the room without reading a number. After sunset the moon takes the
 * arc, in its true phase. The sky is drawn and alive; the words are inked:
 * the hour beside the sun, the ends of the day at the horizon, and below, one
 * passage, set large.
 */

import { lookOf } from "./living";

export { LivingSky as Sky } from "./living";

// The page inside its margins (67.5 rem less 3.25 top and 3 bottom), and the
// band the sky's words take at its head (SkyWords, less the top margin).
const PAGE_H = 61.25;
const SKY_H = 27.75;

/**
 * The words around the arc. They live in sheet coordinates (rem), like the
 * sky; this band undoes the page margins so the two line up.
 */
function SkyWords({
  w,
  now,
  tz,
  children,
}: {
  w: Sky;
  now: Date;
  tz: string;
  children: ReactNode;
}) {
  const p = placeOf(w, now);
  const sky = p.body;
  const look = lookOf(w, p, now);
  // Clear of the body as drawn: the sun's rays, the moon, or the dot under cover.
  const radius = look === "dot" ? 2 : sky.body === "sun" ? p.size * 0.55 : 6.6;
  // High in the sky, the words hang beneath the body; low, they sit beside it,
  // on the side toward the middle of the sheet, clear of the horizon.
  // At the day's ends, when long strokes run along the horizon from the low
  // sun, the words ride above it instead, clear of the strokes.
  const r = (n: number) => `${n.toFixed(2)}rem`;
  const beside = Math.min(p.y, ARC.cy - 4);
  const edge =
    p.x < 60 ? { left: r(Math.max(p.x - 6, 5.5)) } : { right: r(Math.max(120 - p.x - 6, 5.5)) };
  const at: CSSProperties =
    p.low > 0 && look !== "dot"
      ? { ...edge, top: r(p.y - radius), transform: "translateY(-100%)" }
      : p.y <= 12
        ? { left: r(p.x), top: r(p.y + radius), transform: "translateX(-50%)" }
        : p.x < 60
          ? { left: r(p.x + radius), top: r(beside), transform: "translateY(-50%)" }
          : { right: r(120 - p.x + radius), top: r(beside), transform: "translateY(-50%)" };
  const low = p.low > 0 ? "end" : p.y > 12 ? "low" : "high";
  // The ends of the arc: when the sky began (until halfway, and not while the
  // body sits on it), and when it ends, which is always worth knowing: the body
  // rides above the horizon and the words sit below it.
  const ends: Array<["left" | "right", Date, string, boolean]> = [
    ["left", sky.from, sky.body === "sun" ? "sunrise" : "sunset", sky.t > 0.16 && sky.t < 0.5],
    ["right", sky.to, sky.body === "sun" ? "sunset" : "sunrise", true],
  ];
  return (
    <div className="relative -mx-[5.5rem] -mt-[3.25rem] h-[31rem] shrink-0">
      {ends.map(([side, when, word, show]) =>
        show ? (
          <Ink
            key={side}
            k={`${side}${sky.body}`}
            order={0}
            mode="seep"
            className="absolute"
            style={{ [side]: "5.5rem", top: `${ARC.cy + 0.9}rem` }}
          >
            <p className="text-[2rem] whitespace-nowrap text-ink-faint italic">
              {word} {clock(when, tz)}
            </p>
          </Ink>
        ) : null,
      )}
      <Ink
        k={`${sky.body}${low}`}
        order={0}
        mode="seep"
        className="absolute isolate text-center whitespace-nowrap"
        style={at}
      >
        {/* Its own small clearing of paper, so no cloud or stroke crosses the hour. */}
        <div className="sky-word-clearing" aria-hidden />
        {children}
      </Ink>
    </div>
  );
}

export function Home(props: ViewProps) {
  const { snapshot, now } = props;
  const tz = snapshot.timeZone;
  const next = nextUp(props);
  const w = snapshot.weather;
  const nextLine = next ? `Next, ${nextWords(next, tz)}` : "";
  // The two temperatures in the bottom corners, outside on the left and the
  // house on the right, when what's next leaves them room.
  // Outside only while the report is from the last hour, as honest as inside.
  const fresh = w && nowIsFresh(w, now) ? w.now.temp : null;
  const { outside, inside } = corners(fresh, props.inside, nextLine);
  const asks = (item: NotebookItem) => item.kind === "question";
  // The foot is kept whenever there's a sky or the house has been read, note
  // or not, so a reading coming and going never resizes or changes the passage.
  const foot = Boolean(next || w || snapshot.indoor);
  const boxFor = (item: NotebookItem) =>
    heroBox({ sky: Boolean(w), next: foot, ask: asks(item), item });
  const style = (item: NotebookItem) => ({ italic: item.kind !== "idea", max: 11, min: 3.6 });
  // The first of the day's passages that fits its space; a longer one waits
  // for the Ideas page, which has room for anything.
  const hero = heroFitting(props, (i) => fitType(i.text, boxFor(i), style(i)).fits);
  const ask = hero ? asks(hero) : false;

  return (
    <div className="flex h-full flex-col">
      {w ? (
        <SkyWords w={w} now={now} tz={tz}>
          {/* The most-glanced fact on the screen: the hour, in ink. */}
          <p className="text-[4.6rem] leading-none text-ink">
            <ClockFace now={now} tz={tz} />
          </p>
        </SkyWords>
      ) : (
        // No sky report: the hour alone, where the sky would be.
        <Ink order={0} mode="seep" className="pt-[6rem] pb-[4rem] text-center">
          <p className="text-[4.4rem] leading-none text-ink-soft">
            <ClockFace now={now} tz={tz} />
          </p>
        </Ink>
      )}
      <Ink
        k={hero?.id ?? "none"}
        order={1}
        className="flex flex-1 items-center justify-center px-[2rem] text-center"
      >
        {hero ? (
          <article className="max-w-[102rem]">
            {ask ? (
              <p className="mb-[2rem] text-[2.8rem] text-accent italic">A question for the table</p>
            ) : null}
            {/* As large as fits: a short line is set huge, a long one as big as it can go. */}
            <div style={fitStyle(hero.text, boxFor(hero), style(hero))}>
              <Words item={hero} className="text-balance" />
            </div>
            <Credit item={hero} className="mt-[2.4rem] text-[2.6rem] text-ink-faint" />
          </article>
        ) : null}
      </Ink>
      {foot ? (
        // The foot of the page: outside in the left corner, what's next in the
        // middle, the house in the right corner.
        <div className="relative pt-[1rem] text-center">
          <Ink order={2} mode="seep">
            <p className="text-[2.6rem] text-ink-soft">
              {next ? (
                <>
                  <span className="text-ink-faint italic">Next, </span>
                  {nextWords(next, tz)}
                </>
              ) : (
                "\u00a0"
              )}
            </p>
          </Ink>
          {/* Always on the page, so the notes sink away rather than vanish. */}
          <Ink
            k={outside == null ? "none" : "outside"}
            order={3}
            mode="seep"
            className="absolute bottom-[0.7rem] left-0 isolate"
          >
            {outside != null ? (
              <>
                {/* Its own small clearing of paper, so no river runs through it. */}
                <div className="sky-word-clearing corner-clearing" aria-hidden />
                <Corner word="outside">
                  <Deg v={outside} />
                </Corner>
              </>
            ) : null}
          </Ink>
          <Ink
            k={inside == null ? "none" : "inside"}
            order={3}
            mode="seep"
            className="absolute right-0 bottom-[0.7rem] isolate"
          >
            {inside != null ? (
              <>
                <div className="sky-word-clearing corner-clearing" aria-hidden />
                <Corner word="inside">
                  <Deg v={inside} />
                </Corner>
              </>
            ) : null}
          </Ink>
        </div>
      ) : null}
    </div>
  );
}

// The foot's measure (the page inside its margins), the type of what's next
// and of the corner note, and the air kept between them, in rem.
const FOOT_W = 109;
const NEXT = 2.6;
const CORNER = 2;
const AIR = 3;

/** "50° outside", "68° inside": the words as written, for measuring. */
const outsideText = (t: number) => `${degrees(t)} outside`;
const insideText = (t: number) => `${degrees(t)} inside`;

/**
 * The corner notes, if they have room beside what's next (centered on the
 * same line, so both corners have the same room). When they don't, the two
 * give way together, so the foot stays balanced rather than leaning to one
 * side. The outside temperature is never gone for long: the weather comes
 * round on its own turn. With no reading from the house, outside stands
 * alone; with no sky, inside does.
 */
export function corners(
  outside: number | null | undefined,
  inside: number | null | undefined,
  nextLine: string,
): { outside: number | null; inside: number | null } {
  const room = FOOT_W / 2 - (widthEm(nextLine) * NEXT) / 2 - AIR;
  const fits = (words: string) => widthEm(words) * CORNER <= room;
  const house = inside != null && fits(insideText(inside)) ? inside : null;
  const sky = outside != null && fits(outsideText(outside)) ? outside : null;
  // Both, or neither, when both have something to say.
  if (inside != null && outside != null && (house === null || sky === null)) {
    return { outside: null, inside: null };
  }
  return { outside: sky, inside: house };
}

/**
 * A temperature in a bottom corner, written as the ends of the day are at the
 * horizon: the number in soft ink, the word in faint italic ("50° outside",
 * "68° inside"). Part of the paper's furniture: they stay put while the sun
 * moves, and come and go with the passages. A new number just changes.
 */
function Corner({ word, children }: { word: string; children: ReactNode }) {
  return (
    <p
      className="leading-none whitespace-nowrap text-ink-soft"
      style={{ fontSize: `${CORNER}rem` }}
    >
      {children} <span className="text-ink-faint italic">{word}</span>
    </p>
  );
}

export function Night(props: ViewProps) {
  const { snapshot, now } = props;
  const tz = snapshot.timeZone;
  const w = snapshot.weather;
  const tomorrow = firstTomorrow(props);
  // The night's one piece (the question for the table, if it's still the
  // afternoon's hours; otherwise an idea or a quote), as large as the dark page
  // allows; if none fits, the page stays nearly empty, as night should be.
  const box = (item: NotebookItem) => ({
    w: 100,
    h: PAGE_H - (w ? SKY_H : 22) - (tomorrow ? 3.9 : 0) - (item.author ? 6.3 : 0) - 3.5,
  });
  const style = (item: NotebookItem) => ({ italic: item.kind !== "idea", max: 9, min: 3.6 });
  const piece = heroFitting(props, (i) => fitType(i.text, box(i), style(i)).fits);
  const fit = piece ? fitType(piece.text, box(piece), style(piece)) : null;
  return (
    <div className="flex h-full flex-col">
      {/* The house's temperature isn't one of night's few things (DOCTRINE §4). */}
      {w ? (
        <SkyWords w={w} now={now} tz={tz}>
          <p className="text-[5.4rem] leading-none text-ink">
            <ClockFace now={now} tz={tz} />
          </p>
        </SkyWords>
      ) : (
        <Ink order={0} className="pt-[8rem] text-center">
          <p className="text-[8rem] text-ink">
            <ClockFace now={now} tz={tz} />
          </p>
        </Ink>
      )}
      {piece && fit?.fits ? (
        <Ink
          k={piece.id}
          order={1}
          className="flex flex-1 flex-col items-center justify-center text-center"
        >
          {/* In soft gray ink. */}
          <p
            className={`max-w-[100rem] text-balance text-ink-soft ${piece.kind === "idea" ? "" : "italic"}`}
            style={{ fontSize: `${fit.size}rem`, lineHeight: fit.lh }}
          >
            {piece.text}
          </p>
          <Credit item={piece} className="mt-[2.4rem] text-[2.6rem] text-ink-faint" />
        </Ink>
      ) : (
        <div className="flex-1" />
      )}
      {tomorrow ? (
        <Ink k={`${tomorrow.label}${tomorrow.title}`} order={2} mode="seep" className="text-center">
          <p className="text-[2.6rem] text-ink-faint">
            <span className="italic">{tomorrow.label}, </span>
            {tomorrow.title}
            {tomorrow.when ? `, ${tomorrow.when}` : ""}
          </p>
        </Ink>
      ) : null}
    </div>
  );
}

export { Weather } from "./almanac-weather";

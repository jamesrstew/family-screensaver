import type { CSSProperties, ReactNode } from "react";
import { Ink } from "@/components/Ink";
import { clock, clockFace } from "@/lib/time";
import type { Weather as Sky } from "@/lib/types";
import type { ViewProps } from "../parts";
import { ARC, bodyAt, skyNow } from "./arc";
import { Credit, Words, firstTomorrow, heroOf, nextUp, nextWords, sized, Deg } from "./common";

/*
 * D. Almanac. The sheet is a window onto the day's sky (living.tsx): one
 * dotted arc from sunrise to sunset across the head of the page, and the sun,
 * an engraving, sits where it really is. You can tell the time of day from
 * across the room without reading a number. After sunset the moon takes the
 * arc, in its true phase. The sky is drawn and alive; the words are inked:
 * the hour beside the sun, the ends of the day at the horizon, and below, one
 * passage, set large.
 */

export { LivingSky as Sky } from "./living";

const LADDER: Array<[number, string]> = [
  [60, "text-[7.6rem] leading-[1.08]"],
  [110, "text-[6.4rem] leading-[1.12]"],
  [170, "text-[5.5rem] leading-[1.16]"],
  [240, "text-[4.8rem] leading-[1.2]"],
  [9999, "text-[4.2rem] leading-[1.24]"],
];

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
  const sky = skyNow(w, now);
  const p = bodyAt(sky.t);
  const radius = sky.body === "sun" ? 8.2 : 6.6;
  // High in the sky, the words hang beneath the body; low, they sit beside it,
  // on the side toward the middle of the sheet, clear of the horizon.
  const r = (n: number) => `${n.toFixed(2)}rem`;
  const beside = Math.min(p.y, ARC.cy - 4);
  const at: CSSProperties =
    p.y <= 12
      ? { left: r(p.x), top: r(p.y + radius), transform: "translateX(-50%)" }
      : p.x < 60
        ? { left: r(p.x + radius), top: r(beside), transform: "translateY(-50%)" }
        : { right: r(120 - p.x + radius), top: r(beside), transform: "translateY(-50%)" };
  const low = p.y > 12;
  // The ends of the arc: when the sky began, when it ends (hidden while the body sits on one).
  const ends: Array<["left" | "right", Date, string, boolean]> = [
    ["left", sky.from, sky.body === "sun" ? "sunrise" : "sunset", sky.t > 0.16],
    ["right", sky.to, sky.body === "sun" ? "sunset" : "sunrise", sky.t < 0.84],
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
        className="absolute text-center whitespace-nowrap"
        style={at}
      >
        {children}
      </Ink>
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
        <SkyWords w={w} now={now} tz={tz}>
          <p className="text-[3.4rem] leading-none text-ink-soft">
            {clockFace(now, tz)}
            <span className="mx-[1rem] text-ink-faint">·</span>
            <Deg v={w.now.temp} />
          </p>
        </SkyWords>
      ) : (
        // No sky report: the hour alone, where the sky would be.
        <Ink order={0} mode="seep" className="pt-[6rem] pb-[4rem] text-center">
          <p className="text-[4.4rem] leading-none text-ink-soft">{clockFace(now, tz)}</p>
        </Ink>
      )}
      <Ink
        k={hero?.id ?? "none"}
        order={1}
        className="flex flex-1 items-center justify-center px-[2rem] text-center"
      >
        {hero ? (
          <article className="max-w-[102rem]">
            {hero.kind === "question" && mood === "evening" ? (
              <p className="mb-[2rem] text-[2.8rem] text-accent italic">A question for the table</p>
            ) : null}
            <Words item={hero} className={`text-balance ${sized(hero.text, LADDER)}`} />
            <Credit item={hero} className="mt-[2.4rem] text-[2.6rem] text-ink-faint" />
          </article>
        ) : null}
      </Ink>
      {next ? (
        <Ink order={2} mode="seep" className="pt-[1rem] text-center">
          <p className="text-[2.6rem] text-ink-soft">
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
        <SkyWords w={w} now={now} tz={tz}>
          <p className="text-[5.4rem] leading-none text-ink">{clockFace(now, tz)}</p>
        </SkyWords>
      ) : (
        <Ink order={0} className="pt-[8rem] text-center">
          <p className="text-[8rem] text-ink">{clockFace(now, tz)}</p>
        </Ink>
      )}
      {question?.kind === "question" ? (
        <Ink order={1} className="flex flex-1 items-center justify-center text-center">
          <p className="max-w-[86rem] text-[3.8rem] leading-[1.3] text-balance text-ink-soft italic">
            {question.text}
          </p>
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

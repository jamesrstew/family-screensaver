import { Ink } from "@/components/Ink";
import { family } from "@/config";
import { forecastLine } from "@/lib/forecast";
import { clock, clockFace } from "@/lib/time";
import { Engraving, Moon, Star, moonAge } from "../Engraving";
import type { ViewProps } from "../parts";
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
 * B. Bookplate. The page is an ex libris: a fine engraved frame that draws
 * itself when the page arrives, with an oval cartouche of sky at its head
 * and the family's name cut into its foot. The passage sits inside.
 */

const LADDER: Array<[number, string]> = [
  [70, "text-[6rem] leading-[1.1]"],
  [130, "text-[5.1rem] leading-[1.14]"],
  [200, "text-[4.4rem] leading-[1.18]"],
  [260, "text-[3.9rem] leading-[1.2]"],
  [9999, "text-[3.5rem] leading-[1.22]"],
];

// The frame, on a plate the size of the page (109 x 61.25 rem, at 10 units/rem).
const PW = 1090;
const PH = 612;
const CART = { cx: PW / 2, cy: 52, rx: 100, ry: 46 };

function Fleuron({ x, y, r }: { x: number; y: number; r: number }) {
  // A small engraved corner piece: a diamond, four petals, a dot.
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <path d="M0 -6 L3.2 0 L0 6 L-3.2 0 Z" fill="currentColor" stroke="none" />
      <path d="M5 -1 C10 -6 17 -5 20 -1 C15 0 10 1 5 -1 Z" fill="currentColor" stroke="none" />
      <path d="M-1 5 C-6 10 -5 17 -1 20 C0 15 1 10 -1 5 Z" fill="currentColor" stroke="none" />
    </g>
  );
}

function Frame({ faint = false }: { faint?: boolean }) {
  const o = 10; // outer inset
  const i = 22; // inner inset
  return (
    <svg
      viewBox={`0 0 ${PW} ${PH}`}
      preserveAspectRatio="none"
      className={`draw pointer-events-none absolute inset-0 h-full w-full ${faint ? "text-ink-faint" : "text-rule"}`}
      fill="none"
      stroke="currentColor"
      aria-hidden
    >
      <rect x={o} y={o} width={PW - o * 2} height={PH - o * 2} strokeWidth={2.2} pathLength={1} />
      <rect x={i} y={i} width={PW - i * 2} height={PH - i * 2} strokeWidth={0.7} pathLength={1} />
      {/* The cartouche at the head. */}
      <ellipse {...CART} fill="var(--paper)" strokeWidth={2} pathLength={1} />
      <ellipse
        cx={CART.cx}
        cy={CART.cy}
        rx={CART.rx - 7}
        ry={CART.ry - 7}
        strokeWidth={0.6}
        pathLength={1}
      />
      <Fleuron x={o + 16} y={o + 16} r={0} />
      <Fleuron x={PW - o - 16} y={o + 16} r={90} />
      <Fleuron x={PW - o - 16} y={PH - o - 16} r={180} />
      <Fleuron x={o + 16} y={PH - o - 16} r={270} />
    </svg>
  );
}

/** The name cut into the frame's foot. */
function Name() {
  return (
    <p className="spaced absolute inset-x-0 bottom-[3.6rem] text-center text-[1.35rem] text-ink-soft">
      {family.name}
    </p>
  );
}

export function Home(props: ViewProps) {
  const { snapshot, now, mood } = props;
  const tz = snapshot.timeZone;
  const hero = heroOf(props);
  const next = nextUp(props);
  const w = snapshot.weather;

  return (
    <div className="relative h-full">
      <Frame />
      <Ink order={0} className="absolute inset-0">
        <Name />
      </Ink>
      {w ? (
        <Ink
          order={1}
          className="absolute top-[0.6rem] left-1/2 flex h-[9.2rem] w-[19rem] -translate-x-1/2 items-center justify-center gap-[0.4rem]"
        >
          <Engraving
            code={w.now.code}
            isDay={w.now.isDay}
            date={now}
            className="size-[6rem] text-ink"
          />
          <p className="text-[2.6rem] text-ink">
            <Deg v={w.now.temp} />
          </p>
        </Ink>
      ) : null}

      <Ink
        k={hero?.id ?? "none"}
        order={2}
        className="absolute inset-x-[9rem] top-[11rem] bottom-[8rem] flex items-center justify-center"
      >
        {hero ? (
          <article className="max-w-[80rem] text-center">
            {hero.kind === "question" && mood === "evening" ? (
              <p className="mb-[1.6rem] text-[2rem] text-ink-soft italic">
                A question for the table
              </p>
            ) : null}
            <Words item={hero} className={sized(hero.text, LADDER)} />
            <Credit item={hero} className="spaced mt-[2.4rem] text-[1.35rem] text-ink-soft" />
          </article>
        ) : null}
      </Ink>

      <Ink order={3} className="absolute bottom-[3.2rem] left-[4rem]">
        <p className="text-[2.2rem] text-ink-soft">{clock(now, tz)}</p>
      </Ink>
      {next ? (
        <Ink order={3} className="absolute right-[4rem] bottom-[3.2rem] text-right">
          <p className="text-[2.2rem] text-ink-soft italic">{nextWords(next, tz)}</p>
        </Ink>
      ) : null}
    </div>
  );
}

export function Night(props: ViewProps) {
  const { snapshot, now } = props;
  const tz = snapshot.timeZone;
  const tomorrow = firstTomorrow(props);
  const question = heroOf({ ...props, mood: "evening" });
  return (
    <div className="relative h-full">
      <Frame faint />
      <Ink
        order={0}
        className="absolute top-[0.6rem] left-1/2 flex h-[9.2rem] w-[19rem] -translate-x-1/2 items-center justify-center"
      >
        <svg
          viewBox="0 0 100 100"
          className="size-[6.4rem] text-ink"
          fill="none"
          stroke="currentColor"
          aria-hidden
        >
          <Moon age={moonAge(now)} cx={50} cy={52} r={26} />
          <Star x={86} y={24} s={1.1} />
          <Star x={14} y={30} s={0.8} />
        </svg>
      </Ink>
      <div className="flex h-full flex-col items-center justify-center pt-[4rem] text-center">
        <Ink order={1}>
          <p className="text-[8rem] leading-none text-ink">{clockFace(now, tz)}</p>
        </Ink>
        {question?.kind === "question" ? (
          <Ink order={2} className="mt-[3rem] max-w-[64rem]">
            <p className="text-[2.6rem] leading-[1.25] text-ink-soft italic">{question.text}</p>
          </Ink>
        ) : null}
      </div>
      {tomorrow ? (
        <Ink order={3} className="absolute inset-x-0 bottom-[3.2rem] text-center">
          <p className="text-[2rem] text-ink-faint italic">
            {tomorrow.label}, {tomorrow.title}
            {tomorrow.when ? ` at ${tomorrow.when}` : ""}
          </p>
        </Ink>
      ) : null}
    </div>
  );
}

export function Weather({ snapshot, now }: ViewProps) {
  const w = snapshot.weather;
  return (
    <div className="relative h-full">
      <Frame />
      <Ink order={0} className="absolute inset-0">
        <Name />
      </Ink>
      {w ? (
        <div className="flex h-full flex-col items-center px-[6rem] pt-[11rem] pb-[7rem] text-center">
          <Ink
            order={1}
            className="absolute top-[0.6rem] left-1/2 flex h-[9.2rem] w-[19rem] -translate-x-1/2 items-center justify-center"
          >
            <p className="text-[3rem] text-ink">
              <Deg v={w.now.temp} />
            </p>
          </Ink>
          <Ink order={1}>
            <Engraving
              code={w.days[0]?.code ?? w.now.code}
              isDay
              date={now}
              className="size-[14rem] text-ink"
            />
          </Ink>
          <Ink order={2} className="mt-[0.5rem] max-w-[82rem]">
            <p className="text-[4.4rem] leading-[1.12] text-ink">{forecastLine(w)}</p>
          </Ink>
          <Ink order={3} className="mt-auto grid w-full grid-cols-7">
            {w.days.slice(0, 7).map((d, i) => (
              <div key={d.date} className="flex flex-col items-center">
                <p className="text-[1.9rem] text-ink-soft italic">{dayShort(d.date, i)}</p>
                <Engraving code={d.code} isDay className="size-[4.6rem] text-ink" />
                <p className="text-[2.3rem] leading-none">
                  <Deg v={d.high} />
                  <span className="ml-[0.5rem] text-[1.8rem] text-ink-faint">
                    <Deg v={d.low} />
                  </span>
                </p>
              </div>
            ))}
          </Ink>
        </div>
      ) : (
        <Ink className="flex h-full items-center justify-center">
          <p className="text-[3rem] text-ink-soft italic">The sky hasn&rsquo;t reported in yet.</p>
        </Ink>
      )}
    </div>
  );
}

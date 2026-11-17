// Shared pieces for the design directions. Pure; no state.

import { QUESTION_EVERY, leadAt, passageAt, questionFor, slotOf } from "@/lib/pick";
import {
  addDays,
  asksQuestion,
  clock,
  clockFace,
  dayKey,
  happeningsOn,
  parts,
  weekdayOf,
} from "@/lib/time";
import type { Happening, NotebookItem, Weather } from "@/lib/types";
import type { ViewProps } from "../parts";
import { fitType } from "./fit";

/**
 * Home's one piece: a carousel passage reads the deck's passage n (pick.ts);
 * from 2 to 6 p.m. the question for the table takes about one passage in
 * six (every four and a half minutes). Without a carousel, the idea of the quarter hour.
 * `skip` passes over that many candidates, for when one won't fit its space.
 * The deck holds only passages that fit everywhere (fitsEverywhere), so that
 * is rare; then it borrows from the day's own run, never from the deck's
 * passages still to come, so the deck's no-repeat promise holds.
 */
export function heroOf({ snapshot, now, slide }: ViewProps, skip = 0): NotebookItem | null {
  const n = slide?.kind === "passage" ? slide.n : null;
  const asking = asksQuestion(now, snapshot.timeZone);
  const ask = asking && (n === null || n % QUESTION_EVERY === 0);
  const question = ask ? questionFor(snapshot.notebook) : null;
  if (question && skip === 0) return question;
  const at = n ?? slotOf(now);
  const deck = n === null || skip > 0 ? null : passageAt(snapshot.passages, at);
  return deck ?? leadAt(snapshot.notebook, at + skip);
}

// Home's page inside its margins (67.5 rem less 3.25 top and 3 bottom), and
// the band the sky's words take at its head (less the top margin).
const PAGE_H = 61.25;
const SKY_H = 27.75;

/**
 * Whether an idea or quote fits Almanac's smallest rooms for a passage:
 * home's with the sky and what's next, and the night page's with tomorrow's
 * line. The carousel's deck keeps only these, so a passage rarely skips.
 */
export function fitsEverywhere(item: NotebookItem): boolean {
  const style = { italic: item.kind !== "idea", min: 3.6 };
  const home = heroBox({ sky: true, next: true, ask: false, item });
  const night = { w: 100, h: PAGE_H - SKY_H - 3.9 - (item.author ? 6.3 : 0) - 3.5 };
  return (
    fitType(item.text, home, { ...style, max: 11 }).fits &&
    fitType(item.text, night, { ...style, max: 9 }).fits
  );
}

/**
 * The room home's piece has, in rem: the page below the sky, less the lines
 * around it (the evening label above; the credit, which may wrap to two
 * lines, and what's next below), less a little air.
 */
export function heroBox({
  sky,
  next,
  ask,
  item,
}: {
  sky: boolean;
  next: boolean;
  ask: boolean;
  item: NotebookItem;
}): { w: number; h: number } {
  const w = 102;
  const credit = item.author
    ? `${item.author}${item.source && item.source !== "3-2-1" ? `, ${item.source}` : ""}`
    : "";
  // Credit at 2.6 rem, about 0.43 em a character, 1.5 leading, 2.4 rem above it.
  const creditLines = credit ? Math.ceil((credit.length * 0.43 * 2.6) / w) : 0;
  const h =
    PAGE_H -
    (sky ? SKY_H : 14.4) -
    (next ? 4.9 : 0) -
    (creditLines ? 2.4 + creditLines * 3.9 : 0) -
    (ask ? 6.2 : 0) -
    3;
  return { w, h };
}

/**
 * The first candidate for home's piece whose words fit the space they'd
 * have (`fitFor` says), so a long passage is never cut off: it waits for a
 * page with more room (the Ideas page shows anything). Gives up after a few.
 */
export function heroFitting(
  props: ViewProps,
  fitFor: (item: NotebookItem) => boolean,
  tries = 12,
): NotebookItem | null {
  for (let k = 0; k < tries; k++) {
    const item = heroOf(props, k);
    if (!item) return null;
    if (fitFor(item)) return item;
  }
  return null;
}

/** The next timed thing today that hasn't started. */
export function nextUp({ snapshot, now }: ViewProps): Happening | null {
  const { happenings, timeZone } = snapshot;
  if (!happenings) return null;
  return (
    happeningsOn(happenings, dayKey(now, timeZone), timeZone).find(
      (h) => !h.allDay && new Date(h.start) > now,
    ) ?? null
  );
}

/** "This morning" / "This afternoon" / "Tonight", by when the plan starts. */
function partOfDay(start: Date, tz: string): string {
  const h = parts(start, tz).hour;
  return h < 12 ? "This morning" : h < 17 ? "This afternoon" : "Tonight";
}

/**
 * What's next, for the night page (which runs from sunset to sunrise): the
 * next plan still to come today; before noon, today's all-day plan; else
 * tomorrow's first.
 */
export function firstTomorrow(props: ViewProps) {
  const { snapshot, now } = props;
  const tz = snapshot.timeZone;
  const later = nextUp(props);
  if (later) {
    const start = new Date(later.start);
    return { label: partOfDay(start, tz), title: later.title, when: clock(start, tz) };
  }
  const today = dayKey(now, tz);
  if (parts(now, tz).hour < 12) {
    const allDay = snapshot.happenings
      ? happeningsOn(snapshot.happenings, today, tz).find((x) => x.allDay)
      : undefined;
    if (allDay) return { label: "Today", title: allDay.title, when: null };
  }
  const list = snapshot.happenings ? happeningsOn(snapshot.happenings, addDays(today, 1), tz) : [];
  const h = list.find((x) => !x.allDay) ?? list[0];
  if (!h) return null;
  return {
    label: "Tomorrow",
    title: h.title,
    when: h.allDay ? null : clock(new Date(h.start), tz),
  };
}

/** "Library story time at 10:30" — AP time, no suffix when it's obvious. */
export function nextWords(h: Happening, tz: string): string {
  return `${h.title}, ${clock(new Date(h.start), tz)}`;
}

/** The credit line: author, and a title if there is one. */
export function Credit({ item, className = "" }: { item: NotebookItem; className?: string }) {
  if (!item.author) return null;
  // James Clear's own ideas don't need "3-2-1" under them every time.
  const source = item.source && item.source !== "3-2-1" ? item.source : null;
  return (
    <p className={className}>
      {item.author}
      {source ? (
        <>
          , <i>{source}</i>
        </>
      ) : null}
    </p>
  );
}

/** Paragraph breaks kept; quotes set like an epigraph, without quote marks. */
export function Words({ item, className = "" }: { item: NotebookItem; className?: string }) {
  const paras = item.text.split(/\n{2,}/);
  return (
    <div className={`${item.kind === "idea" ? "" : "italic"} ${className}`}>
      {paras.map((p, i) => (
        <p key={i} className={i ? "mt-[0.45em]" : ""}>
          {p}
        </p>
      ))}
    </div>
  );
}

/** Pick a size for the text from a ladder of [maxChars, classes]. */
export function sized(text: string, ladder: Array<[number, string]>): string {
  for (const [n, cls] of ladder) if (text.length <= n) return cls;
  return ladder.at(-1)![1];
}

/** Three-hour steps through the next day, for weather drawings. */
export function steps(w: Weather, every = 3, count = 8) {
  return w.hours.filter((_, i) => i % every === 0).slice(0, count);
}

/** "9 a.m.", "noon", "midnight" for an hour mark. */
export function hourWord(iso: string, tz: string): string {
  const { hour } = parts(new Date(iso), tz);
  if (hour === 0) return "midnight";
  if (hour === 12) return "noon";
  return `${hour % 12} ${hour < 12 ? "a.m." : "p.m."}`;
}

export const dayShort = (key: string, i: number) => (i === 0 ? "Today" : weekdayOf(key, "short"));

/** Where the sun is in its day, 0 at sunrise and 1 at sunset (outside: <0 or >1). */
export function sunProgress(w: Weather, now: Date): number {
  const rise = Date.parse(w.today.sunrise);
  const set = Date.parse(w.today.sunset);
  return (now.getTime() - rise) / (set - rise);
}

/** A temperature: the face's own degree sign, no fuss. */
export function Deg({ v }: { v: number }) {
  return <>{v}°</>;
}

/**
 * The time as a clock face with its a.m. or p.m., AP style ("6:30 p.m.",
 * "noon", "midnight"). The suffix is set smaller, so it reads as part of the
 * time without competing with the numerals.
 */
export function ClockFace({ now, tz }: { now: Date; tz: string }) {
  const { hour, minute } = parts(now, tz);
  if (minute === 0 && (hour === 0 || hour === 12)) return <>{hour === 0 ? "midnight" : "noon"}</>;
  return (
    <>
      {clockFace(now, tz)}
      <span className="ml-[0.22em] text-[0.58em] tracking-[0.01em]">
        {hour < 12 ? "a.m." : "p.m."}
      </span>
    </>
  );
}

/** Inline style for a block of type fitted to its box (see fit.ts). */
export function fitStyle(...args: Parameters<typeof fitType>) {
  const f = fitType(...args);
  return { fontSize: `${f.size}rem`, lineHeight: f.lh };
}

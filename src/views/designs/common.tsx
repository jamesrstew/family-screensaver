// Shared pieces for the design directions. Pure; no state.

import { leadFor, questionFor } from "@/lib/pick";
import { addDays, clock, dayKey, happeningsOn, parts, weekdayOf } from "@/lib/time";
import type { Happening, NotebookItem, Weather } from "@/lib/types";
import type { ViewProps } from "../parts";

/** Home's one piece: the evening's question, otherwise the idea of the hour. */
export function heroOf({ snapshot, now, mood }: ViewProps): NotebookItem | null {
  return (
    (mood === "evening" ? questionFor(snapshot.notebook) : null) ?? leadFor(snapshot.notebook, now)
  );
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

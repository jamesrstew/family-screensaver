import "server-only";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ICAL from "ical.js";
import { cacheLife } from "next/cache";
import type { Happening } from "./types";

// The family calendar arrives as Google Calendar's "secret address in iCal
// format": no OAuth, no tokens to refresh, one URL per calendar.

export async function getHappenings(urls: string[], from: Date, to: Date): Promise<Happening[]> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });

  const texts = await Promise.all(
    urls.map(async (url) => {
      // Development only: a sample calendar from disk (see snapshot.ts).
      if (url.startsWith("file:")) return readFile(fileURLToPath(url), "utf8");
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`calendar ${res.status}`);
      return res.text();
    }),
  );
  return texts.flatMap((t) => expand(t, from, to));
}

/** Every occurrence of every event in an iCal file that overlaps [from, to). */
export function expand(ics: string, from: Date, to: Date): Happening[] {
  const root = new ICAL.Component(ICAL.parse(ics));
  for (const tz of root.getAllSubcomponents("vtimezone")) {
    ICAL.TimezoneService.register(tz);
  }

  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  for (const v of root.getAllSubcomponents("vevent")) {
    const e = new ICAL.Event(v);
    if (e.isRecurrenceException()) exceptions.push(e);
    else masters.set(e.uid, e);
  }
  for (const ex of exceptions) masters.get(ex.uid)?.relateException(ex);

  const out: Happening[] = [];
  const keep = (item: ICAL.Event, start: ICAL.Time, end: ICAL.Time) => {
    if (item.component.getFirstPropertyValue("status") === "CANCELLED") return;
    const allDay = start.isDate;
    const s = start.toJSDate();
    const e = end.toJSDate();
    if (e <= from || s >= to) return;
    out.push({
      id: `${item.uid}/${start.toString()}`,
      title: item.summary?.trim() || "Untitled",
      allDay,
      start: allDay ? start.toString() : s.toISOString(),
      end: allDay ? end.toString() : e.toISOString(),
    });
  };

  for (const e of masters.values()) {
    if (!e.isRecurring()) {
      keep(e, e.startDate, e.endDate ?? e.startDate);
      continue;
    }
    const it = e.iterator();
    // Weekly events from years ago iterate from their first date; cap the walk.
    for (let i = 0, next = it.next(); next && i < 20_000; i++, next = it.next()) {
      if (next.toJSDate() >= to) break;
      const o = e.getOccurrenceDetails(next);
      keep(o.item, o.startDate, o.endDate);
    }
  }
  return out;
}

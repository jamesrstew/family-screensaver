import { SLIDE_MS, slideOf } from "@/lib/carousel";
import { describe, expect, it } from "vitest";
import type { Happening, Snapshot } from "@/lib/types";
import { leadDeck, passagesFrom } from "@/lib/pick";
import type { NotebookItem } from "@/lib/types";
import { firstTomorrow, fitsEverywhere, heroOf } from "./common";

const TZ = "America/Los_Angeles";
const timed = (id: string, start: string): Happening => ({
  id,
  title: id,
  allDay: false,
  start,
  end: start,
});
const allDay = (id: string, day: string, next: string): Happening => ({
  id,
  title: id,
  allDay: true,
  start: day,
  end: next,
});

function nextAt(iso: string, happenings: Happening[]) {
  const snapshot = { timeZone: TZ, happenings } as Snapshot;
  return firstTomorrow({ snapshot, now: new Date(iso), mood: "night" });
}

describe("what's next on the night page", () => {
  const day = [
    timed("Soccer", "2026-11-17T15:00:00-08:00"),
    timed("Dinner", "2026-11-17T18:00:00-08:00"),
    timed("Drop-off", "2026-11-18T08:00:00-08:00"),
  ];

  it("labels a plan by when it starts, not by the hour now", () => {
    expect(nextAt("2026-11-17T05:30:00-08:00", day)?.label).toBe("This afternoon");
    expect(nextAt("2026-11-17T16:45:00-08:00", day)).toMatchObject({
      label: "Tonight",
      title: "Dinner",
    });
  });

  it("after the last plan, looks to tomorrow", () => {
    expect(nextAt("2026-11-17T21:00:00-08:00", day)).toMatchObject({
      label: "Tomorrow",
      title: "Drop-off",
    });
  });

  it("before dawn, an all-day plan today is today's, not tomorrow's", () => {
    const quiet = [allDay("No school", "2026-11-17", "2026-11-18"), ...day.slice(2)];
    expect(nextAt("2026-11-17T01:00:00-08:00", quiet)).toMatchObject({
      label: "Today",
      title: "No school",
    });
  });
});

describe("heroOf on the carousel", () => {
  const notes: NotebookItem[] = [
    { id: "q", kind: "question", text: "What made you laugh today?" },
    ...Array.from({ length: 120 }, (_, i) => ({
      id: `idea-${i}`,
      kind: "idea" as const,
      text: `A short idea, number ${i}.`,
    })),
  ];
  const n0 = 29_000_000;
  const snapshot = {
    notebook: notes,
    passages: passagesFrom(leadDeck(notes), n0, 400),
    timeZone: TZ,
  } as unknown as Snapshot;

  it("asks the question every nine minutes, 2 to 6 p.m., and never after", () => {
    const tz = snapshot.timeZone;
    const at = (iso: string, hours: number) => {
      const since = Date.parse(iso);
      const times: number[] = [];
      for (let t = since; t < since + hours * 3_600_000; t += SLIDE_MS) {
        const slide = slideOf(new Date(t), since, true, tz);
        if (slide.kind !== "passage") continue;
        const item = heroOf({ snapshot, now: new Date(t), mood: "afternoon", slide });
        if (item?.kind === "question") times.push(t);
      }
      return times;
    };
    const asked = at("2026-11-18T14:00:00-08:00", 4);
    // Four hours of two passages every 90 seconds: about 27 times.
    expect(asked.length).toBeGreaterThanOrEqual(26);
    expect(asked.length).toBeLessThanOrEqual(27);
    asked.slice(1).forEach((t, i) => expect(t - asked[i]).toBe(540_000));
    expect(at("2026-11-18T18:00:00-08:00", 2)).toEqual([]);
  });
  it("reads the deck's passage n, and borrows from the day's run when one won't fit", () => {
    const morning = new Date("2026-11-18T09:00:00-08:00");
    const props = {
      snapshot,
      now: morning,
      mood: "morning" as const,
      slide: { kind: "passage" as const, n: n0 + 5 },
    };
    expect(heroOf(props)?.id).toBe(snapshot.passages!.items[5].id);
    // Not the deck's passages to come: they keep their own turns.
    const ahead = new Set(snapshot.passages!.items.slice(5).map((i) => i.id));
    expect(heroOf(props, 1)?.id).toBe(
      notes.filter((i) => i.kind !== "question")[(n0 + 6) % 120].id,
    );
    expect(ahead.size).toBeGreaterThan(0);
  });
  it("keeps only passages that fit home's and the night's rooms in the deck", () => {
    const short: NotebookItem = { id: "s", kind: "idea", text: "Small things, done daily." };
    const long: NotebookItem = {
      id: "l",
      kind: "quote",
      text: "word ".repeat(64).trim(),
      author: "Someone Long-Named, A Very Long Book Title Indeed",
    };
    expect(fitsEverywhere(short)).toBe(true);
    expect(fitsEverywhere(long)).toBe(false);
    expect(leadDeck([short, long], fitsEverywhere).map((i) => i.id)).toEqual(["s"]);
  });
});

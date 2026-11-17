import { describe, expect, it } from "vitest";
import { LEAD_CHARS } from "@/lib/pick";
import type { NotebookItem, Snapshot } from "@/lib/types";
import { heroBox, heroFitting } from "./common";
import { fitType, heightAt, linesAt } from "./fit";

const box = { w: 102, h: 20 };
const o = { max: 11, min: 3.6, italic: true };

// Made-up passages of known length (no real corpus in tests).
const words = (n: number) =>
  Array.from({ length: n }, (_, i) => ["morning", "light", "on", "the", "hills"][i % 5])
    .join(" ")
    .slice(0, n);

const item = (id: string, text: string, kind: NotebookItem["kind"] = "idea"): NotebookItem => ({
  id,
  kind,
  text,
  author: "Someone Wrote This",
});

describe("fitType: known answers", () => {
  it("sets a short line at the largest size", () => {
    expect(fitType("Be one.", box, o)).toMatchObject({ size: 11, fits: true });
  });

  it("wraps by words: two short lines at a narrow measure", () => {
    // At 5 rem italic each character is about 2 rem wide: 12 characters a line in 25 rem.
    expect(linesAt("seven words wrap into lines here", 5, 25, true)).toBe(3);
  });

  it("counts paragraphs as their own lines", () => {
    expect(linesAt("One.\n\nTwo.", 5, 100)).toBe(2);
  });

  it("never lets one word run wider than the box", () => {
    const long = "Antidisestablishmentarianism";
    const f = fitType(long, { w: 40, h: 60 }, o);
    // 28 characters at 0.4 em must fit in 40 rem: at most about 3.5 rem.
    expect(f.size).toBeLessThanOrEqual(3.6);
  });
});

describe("fitType: what won't fit", () => {
  it("says so, at the floor, when the words can't fit the box", () => {
    const f = fitType(words(LEAD_CHARS), { w: 102, h: 10 }, o);
    expect(f.fits).toBe(false);
    expect(f.size).toBe(o.min);
  });

  it("fits what it says it fits", () => {
    const text = words(180);
    const f = fitType(text, box, o);
    expect(f.fits).toBe(true);
    expect(heightAt(text, f.size, box.w, true)).toBeLessThanOrEqual(box.h);
  });
});

describe("heroBox", () => {
  it("leaves room for a credit that wraps to two lines", () => {
    const short = heroBox({ sky: true, next: true, ask: false, item: item("a", "x") });
    const long = heroBox({
      sky: true,
      next: true,
      ask: false,
      item: { ...item("b", "x"), source: words(90) },
    });
    expect(long.h).toBeLessThan(short.h - 3);
  });
});

describe("heroFitting", () => {
  const notebook = [
    item("long", words(LEAD_CHARS)),
    item("short", words(80)),
    item("also", words(100)),
  ];
  const props = {
    snapshot: { notebook, timeZone: "America/Los_Angeles" } as unknown as Snapshot,
    now: new Date("2026-11-16T19:00:00Z"),
    mood: "afternoon" as const,
    slide: { kind: "passage" as const, n: 0 },
  };

  it("passes over a passage at LEAD_CHARS that can't fit the worst box", () => {
    // The worst box: sky, next, a two-line credit, and the evening label.
    const worst = heroBox({
      sky: true,
      next: true,
      ask: true,
      item: { ...item("w", "x"), source: words(90) },
    });
    const fits = (i: NotebookItem) => fitType(i.text, worst, o).fits;
    expect(fits(notebook[0])).toBe(false);
    // Passed over for one that fits (looking well ahead, so it isn't up again next).
    const chosen = heroFitting(props, fits);
    expect(chosen?.id).not.toBe("long");
    expect(chosen && fits(chosen)).toBe(true);
  });

  it("takes the first passage when it fits", () => {
    expect(heroFitting(props, () => true)?.id).toBe("long");
  });
});

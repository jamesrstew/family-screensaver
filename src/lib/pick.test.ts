import { describe, expect, it } from "vitest";
import { forDay, leadFor, MAX_CHARS, PER_DAY, questionFor, SLOT_MINUTES } from "./pick";
import type { NotebookItem } from "./types";

const items: NotebookItem[] = Array.from({ length: 300 }, (_, i) => ({
  id: `item-${String(i).padStart(3, "0")}`,
  kind: i % 6 === 5 ? "question" : i % 3 === 0 ? "quote" : "idea",
  text: i === 7 ? "x".repeat(MAX_CHARS + 1) : `Entry number ${i}.`,
}));

describe("forDay", () => {
  it("is the same for every screen on the same day", () => {
    expect(forDay(items, "2026-11-16")).toEqual(forDay([...items].reverse(), "2026-11-16"));
  });
  it("leaves out entries too long for the TV", () => {
    expect(forDay(items, "2026-11-16").some((i) => i.id === "item-007")).toBe(false);
  });
  it("walks through the whole notebook before repeating", () => {
    const seen = new Set<string>();
    const days = Math.ceil(299 / PER_DAY) - 1;
    for (let d = 0; d < days; d++) {
      for (const i of forDay(items, `2026-11-${String(10 + d).padStart(2, "0")}`)) {
        expect(seen.has(i.id)).toBe(false);
        seen.add(i.id);
      }
    }
  });
  it("prints the commonplace book when the notebook is small", () => {
    expect(forDay(items.slice(0, 5), "2026-11-16")).toHaveLength(5);
    expect(forDay([], "2026-11-16")).toEqual([]);
  });
});

describe("rotation", () => {
  const today = forDay(items, "2026-11-16");
  it("changes the lead every slot", () => {
    const t = new Date("2026-11-16T09:00:00Z");
    const later = new Date(t.getTime() + SLOT_MINUTES * 60_000);
    expect(leadFor(today, t)?.id).not.toBe(leadFor(today, later)?.id);
  });
  it("never leads with a question; the evening has one", () => {
    expect(leadFor(today, new Date())?.kind).not.toBe("question");
    expect(questionFor(today)?.kind).toBe("question");
  });
});

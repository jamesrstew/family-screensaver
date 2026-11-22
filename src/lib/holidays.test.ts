import { describe, expect, it } from "vitest";
import { easter, holidayOn } from "./holidays";

describe("holidayOn", () => {
  it("finds Thanksgiving on the fourth Thursday of November", () => {
    expect(holidayOn("2026-11-26")).toEqual({ name: "Thanksgiving", mark: "turkey" });
    expect(holidayOn("2027-11-25")?.mark).toBe("turkey");
    // A month that starts on a Thursday: the fourth is the 22nd.
    expect(holidayOn("2029-11-22")?.mark).toBe("turkey");
    expect(holidayOn("2026-11-19")).toBeUndefined();
  });

  it("finds the Monday holidays, the last Monday of May among them", () => {
    expect(holidayOn("2027-01-18")?.name).toBe("Martin Luther King Jr. Day");
    expect(holidayOn("2027-02-15")?.name).toBe("Presidents' Day");
    expect(holidayOn("2026-05-25")?.name).toBe("Memorial Day");
    // May 2027 ends on a Monday.
    expect(holidayOn("2027-05-31")?.name).toBe("Memorial Day");
    expect(holidayOn("2027-05-24")).toBeUndefined();
    expect(holidayOn("2026-09-07")?.name).toBe("Labor Day");
  });

  it("finds the fixed days", () => {
    expect(holidayOn("2026-12-25")).toEqual({ name: "Christmas", mark: "tree" });
    expect(holidayOn("2026-10-31")?.mark).toBe("pumpkin");
    expect(holidayOn("2027-07-04")?.mark).toBe("firework");
    expect(holidayOn("2026-11-22")).toBeUndefined();
    // One mark a holiday: its eve goes unmarked, so the row never shows two alike.
    expect(holidayOn("2026-12-24")).toBeUndefined();
    expect(holidayOn("2026-12-31")).toBeUndefined();
  });
});

describe("a week's marks", () => {
  it("never shows the same mark twice in seven days", () => {
    for (let year = 2024; year <= 2060; year++) {
      const days = Array.from({ length: 372 }, (_, i) => {
        const d = new Date(Date.UTC(year, 0, 1 + i));
        return d.toISOString().slice(0, 10);
      });
      days.forEach((key, i) => {
        const mark = holidayOn(key)?.mark;
        if (!mark) return;
        for (const later of days.slice(i + 1, i + 7)) {
          expect(holidayOn(later)?.mark, `${key} and ${later}`).not.toBe(mark);
        }
      });
    }
  });

  it("finds a Monday holiday when the month starts on a Monday", () => {
    // Jan. 1, 2029 is a Monday: the third Monday is the 15th.
    expect(holidayOn("2029-01-15")?.name).toBe("Martin Luther King Jr. Day");
  });
});

describe("easter", () => {
  it("matches the calendar", () => {
    expect(easter(2026)).toEqual([4, 5]);
    expect(easter(2027)).toEqual([3, 28]);
    expect(easter(2038)).toEqual([4, 25]);
    expect(easter(2285)).toEqual([3, 22]);
    expect(holidayOn("2026-04-05")?.mark).toBe("egg");
  });
});

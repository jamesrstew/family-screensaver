import { describe, expect, it } from "vitest";
import { cornerNote } from "./almanac";

const one = { kind: "one", temp: 68 } as const;
const range = { kind: "range", low: 66, high: 71, temp: 68 } as const;

describe("cornerNote", () => {
  it("keeps the range beside an ordinary next", () => {
    expect(cornerNote(range, "Next, Soccer practice, 4:30 p.m.")).toEqual(range);
  });

  it("gives way to the one number, then to nothing, as what's next grows", () => {
    const long = "Next, Watercolor workshop at the museum with friends, 4:30 p.m.";
    expect(cornerNote(range, long)).toEqual(one);
    expect(cornerNote(one, `${long} and after`)).toBeNull();
  });

  it("measures capitals as the wide letters they are", () => {
    const caps = "Next, MOMMY AND ME WATERCOLOR WORKSHOP AT THE MUSEUM, 4:30 p.m.";
    expect(cornerNote(one, caps)).toBeNull();
    expect(cornerNote(one, caps.toLowerCase())).toEqual(one);
  });

  it("says nothing without a reading", () => {
    expect(cornerNote(null, "")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { corners } from "./almanac";

const one = { kind: "one", temp: 68 } as const;
const range = { kind: "range", low: 66, high: 71, temp: 68 } as const;
const usual = "Next, Soccer practice, 4:30 p.m.";
const long = "Next, Watercolor workshop at the museum with friends, 4:30 p.m.";

describe("corners", () => {
  it("writes both beside an ordinary next, the house's range and all", () => {
    expect(corners(50, range, usual)).toEqual({ outside: 50, inside: range });
    expect(corners(50, one, "")).toEqual({ outside: 50, inside: one });
  });

  it("narrows the house's range first, then both give way together", () => {
    expect(corners(50, range, long)).toEqual({ outside: 50, inside: one });
    expect(corners(50, range, `${long} and after`)).toEqual({ outside: null, inside: null });
  });

  it("never keeps one side when the other can't fit", () => {
    // "68° inside" is a little narrower than "50° outside": find a next that
    // leaves room for the first but not the second, and both go.
    let next = long;
    while (corners(50, null, next).outside !== null) next += "x";
    expect(corners(null, one, next).inside).toEqual(one);
    expect(corners(50, one, next)).toEqual({ outside: null, inside: null });
  });

  it("lets either stand alone when the other has nothing to say", () => {
    expect(corners(50, null, usual)).toEqual({ outside: 50, inside: null });
    expect(corners(null, one, usual)).toEqual({ outside: null, inside: one });
    expect(corners(null, null, usual)).toEqual({ outside: null, inside: null });
  });

  it("measures capitals as the wide letters they are", () => {
    const caps = "Next, MOMMY AND ME WATERCOLOR WORKSHOP AT THE MUSEUM, 4:30 p.m.";
    expect(corners(50, one, caps)).toEqual({ outside: null, inside: null });
    expect(corners(50, one, caps.toLowerCase())).toEqual({ outside: 50, inside: one });
  });
});

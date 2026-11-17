import { describe, expect, it } from "vitest";
import { corners } from "./almanac";

const usual = "Next, Soccer practice, 4:30 p.m.";
const long = "Next, Watercolor workshop at the museum with friends, 4:30 p.m.";

describe("corners", () => {
  it("writes both beside an ordinary next, and a long one that still leaves room", () => {
    expect(corners(50, 68, usual)).toEqual({ outside: 50, inside: 68 });
    expect(corners(50, 68, "")).toEqual({ outside: 50, inside: 68 });
    expect(corners(50, 68, long)).toEqual({ outside: 50, inside: 68 });
  });

  it("gives way together when what's next leaves no room", () => {
    expect(corners(50, 68, `${long} and after`)).toEqual({ outside: null, inside: null });
  });

  it("never keeps one side when the other can't fit", () => {
    // "68° inside" is a little narrower than "50° outside": find a next that
    // leaves room for the first but not the second, and both go.
    let next = long;
    while (corners(50, null, next).outside !== null) next += "x";
    expect(corners(null, 68, next).inside).toBe(68);
    expect(corners(50, 68, next)).toEqual({ outside: null, inside: null });
  });

  it("lets either stand alone when the other has nothing to say", () => {
    expect(corners(50, null, usual)).toEqual({ outside: 50, inside: null });
    expect(corners(null, 68, usual)).toEqual({ outside: null, inside: 68 });
    expect(corners(null, null, usual)).toEqual({ outside: null, inside: null });
  });

  it("measures capitals as the wide letters they are", () => {
    const caps = "Next, MOMMY AND ME WATERCOLOR WORKSHOP AT THE MUSEUM, 4:30 p.m.";
    expect(corners(50, 68, caps)).toEqual({ outside: null, inside: null });
    expect(corners(50, 68, caps.toLowerCase())).toEqual({ outside: 50, inside: 68 });
  });

  it("keeps zero and below, which are temperatures, not nothing", () => {
    expect(corners(0, 68, usual)).toEqual({ outside: 0, inside: 68 });
    expect(corners(-5, 68, usual)).toEqual({ outside: -5, inside: 68 });
    expect(corners(-5, 0, usual)).toEqual({ outside: -5, inside: 0 });
    expect(corners(0, null, usual)).toEqual({ outside: 0, inside: null });
    expect(corners(undefined, 68, usual)).toEqual({ outside: null, inside: 68 });
  });
});

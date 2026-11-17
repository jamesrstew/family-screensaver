import { describe, expect, it } from "vitest";
import { fitType, linesAt } from "./fit";

const box = { w: 102, h: 20 };
const o = { max: 11, min: 3.6, italic: true };

describe("fitType", () => {
  it("sets a short line huge", () => {
    expect(fitType("Be one.", box, o).size).toBe(11);
  });

  it("sets longer passages smaller, never below the floor", () => {
    const short = fitType("The years teach much which the days never know.", box, o).size;
    const long = fitType(
      "The cost of a thing is the amount of what I will call life which is required to be exchanged for it, immediately or in the long run.",
      box,
      o,
    ).size;
    expect(short).toBeGreaterThan(long);
    expect(long).toBeGreaterThanOrEqual(o.min);
  });

  it("fits the box it was given", () => {
    const text = "Waste no more time arguing about what a good man should be. Be one.";
    const { size, lh } = fitType(text, box, o);
    expect(linesAt(text, size, box.w, true) * size * lh).toBeLessThanOrEqual(box.h);
  });

  it("counts paragraphs as their own lines", () => {
    expect(linesAt("One.\n\nTwo.", 5, 100)).toBe(2);
  });
});

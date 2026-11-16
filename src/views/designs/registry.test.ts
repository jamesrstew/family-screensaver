import { describe, expect, it } from "vitest";
import { designOf } from "./registry";

describe("designOf", () => {
  it("reads letters and names", () => {
    expect(designOf("d")).toBe("almanac");
    expect(designOf("Still")).toBe("still");
  });
  it("ignores anything else, including built-in keys", () => {
    for (const p of ["", "x", "constructor", "__proto__", "toString"]) {
      expect(designOf(p)).toBeNull();
    }
  });
});

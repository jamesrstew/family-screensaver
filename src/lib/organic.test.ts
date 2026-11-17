import { describe, expect, it } from "vitest";
import { contours, drainage, fbm, hashOf, levelsOf, noise, rng, terrain } from "./organic";

describe("rng", () => {
  it("gives the same sequence for a seed (pinned), and another for another seed", () => {
    expect(rng(42)()).toMatchInlineSnapshot(`0.6011037519201636`);
    const a = rng(42);
    const b = rng(42);
    const c = rng(43);
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    expect(c()).not.toEqual(xs[0]);
  });

  it("stays in [0, 1)", () => {
    const r = rng(7);
    for (let i = 0; i < 1000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("hashOf", () => {
  it("is stable", () => {
    expect(hashOf("2026-11-16")).toBe(hashOf("2026-11-16"));
    expect(hashOf("2026-11-16")).not.toBe(hashOf("2026-11-17"));
  });
});

describe("noise", () => {
  it("is smooth: nearby points have nearby values", () => {
    for (let i = 0; i < 50; i++) {
      const x = i * 0.37;
      const y = i * 0.21;
      expect(Math.abs(noise(1, x, y) - noise(1, x + 0.01, y))).toBeLessThan(0.05);
    }
  });

  it("stays in a sane range", () => {
    for (let i = 0; i < 500; i++) {
      const v = fbm(3, i * 0.13, i * 0.07);
      expect(Math.abs(v)).toBeLessThan(1.5);
    }
  });

  it("moves the land a little between states", () => {
    let diff = 0;
    for (let i = 0; i < 100; i++)
      diff += Math.abs(terrain(5, i * 0.1, 1) - terrain(5, i * 0.1, 1, 0.8));
    expect(diff / 100).toBeGreaterThan(0.01);
    expect(diff / 100).toBeLessThan(0.5);
  });
});

describe("contours", () => {
  it("traces a circle as one closed loop", () => {
    const n = 20;
    const [d] = contours((i, j) => Math.hypot(i - n / 2, j - n / 2), n, n, [5], 10);
    // One chain, starting with a single moveto.
    expect(d.match(/M/g)).toHaveLength(1);
    const pts = d.replace("M", "").trim().split(" ").map(Number);
    const first = [pts[0], pts[1]];
    const last = [pts.at(-2), pts.at(-1)];
    expect(last).toEqual(first);
    // Every point sits on the circle (radius 5 grid steps = 50 units), within rounding.
    for (let k = 0; k < pts.length; k += 2) {
      expect(Math.abs(Math.hypot(pts[k] - 100, pts[k + 1] - 100) - 50)).toBeLessThan(3);
    }
  });

  it("draws nothing for a level the field never crosses", () => {
    expect(contours(() => 0, 4, 4, [1], 10)).toEqual([""]);
  });

  it("draws the same lines for the same field (pinned)", () => {
    // The server and the TV must agree; if the drawing changes on purpose, update the pin.
    const f = (i: number, j: number) => terrain(9, i / 10, j / 10);
    expect(hashOf(contours(f, 30, 20, [0, 0.2], 6).join("|"))).toMatchInlineSnapshot(`1008343914`);
  });
});

describe("contours, specks", () => {
  it("leaves out closed loops smaller than minLoop", () => {
    const n = 20;
    const ring = (i: number, j: number) => Math.hypot(i - n / 2, j - n / 2);
    expect(contours(ring, n, n, [2], 10, 0)[0]).not.toBe("");
    // A loop of radius 2 steps is 40 units across: dropped at minLoop 50.
    expect(contours(ring, n, n, [2], 10, 50)[0]).toBe("");
  });
});

describe("levelsOf", () => {
  it("spreads levels through the field's range, in order", () => {
    const levels = levelsOf((i) => i, 100, 10, 5);
    expect(levels).toHaveLength(5);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
    expect(levels[0]).toBeGreaterThan(0);
    expect(levels[4]).toBeLessThan(100);
  });
});

describe("drainage", () => {
  // A valley down the middle, sloping toward row 0 (the horizon).
  const valley = (i: number, j: number) => Math.abs(i - 20) * 0.1 + j * 0.05;

  it("gathers water into a trunk that grows downstream", () => {
    const rivers = drainage(valley, 40, 30, 10, 8, 4, 1);
    expect(rivers).toHaveLength(4);
    // Something is drawn, and the biggest class (the trunk) exists.
    expect(rivers.join("")).not.toBe("");
    expect(rivers[3]).not.toBe("");
  });

  it("routes the same rivers for the same field (pinned)", () => {
    expect(hashOf(drainage(valley, 40, 30, 10, 8, 4, 1).join("|"))).toMatchInlineSnapshot(
      `106588292`,
    );
  });
});

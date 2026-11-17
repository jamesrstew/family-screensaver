import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/land/[seed]/route";
import { LAND_INK, LAND_H, LAND_SEEDS, LAND_W, landOf, landSvg } from "./land";
import { hashOf } from "./organic";

describe("landSvg", () => {
  it("draws a standalone SVG of the land's size", () => {
    const svg = landSvg(4242, "day");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${LAND_W} ${LAND_H}"`);
    expect(svg).toContain(LAND_INK.day.soft);
  });

  it("draws the same land for a seed every time (pinned)", () => {
    // If the land's drawing changes on purpose, update this pin.
    expect(hashOf(landSvg(4242, "day"))).toMatchInlineSnapshot(`76898488`);
  });

  it("draws night in night's inks, with the same lines", () => {
    const day = landSvg(4242, "day");
    const night = landSvg(4242, "night");
    expect(night).toContain(LAND_INK.night.faint);
    expect(night.replaceAll(LAND_INK.night.faint, "F").replaceAll(LAND_INK.night.soft, "S")).toBe(
      day.replaceAll(LAND_INK.day.faint, "F").replaceAll(LAND_INK.day.soft, "S"),
    );
  });

  it("uses whole units, to keep the image small", () => {
    const d = landSvg(4242, "day")
      .match(/ d="([^"]+)"/g)!
      .join("");
    expect(d).not.toMatch(/\d\.\d/);
  });

  it("bakes the same inks as Almanac's paper tokens", () => {
    const css = readFileSync(
      path.resolve(import.meta.dirname, "../views/designs/designs.css"),
      "utf8",
    );
    const almanac = css.slice(css.indexOf('.paper[data-design="almanac"] {'));
    const night = almanac.slice(almanac.indexOf('[data-mood="night"]'));
    const token = (block: string, name: string) =>
      block.match(new RegExp(`--${name}: (#[0-9a-f]{6})`))?.[1];
    expect(token(almanac, "ink-faint")).toBe(LAND_INK.day.faint);
    expect(token(almanac, "ink-soft")).toBe(LAND_INK.day.soft);
    expect(token(night, "ink-faint")).toBe(LAND_INK.night.faint);
    expect(token(night, "ink-soft")).toBe(LAND_INK.night.soft);
  });
});

describe("the land's bound", () => {
  it("maps any sky's seed into the small fixed set", () => {
    for (const seed of [0, 1, 63, 64, 99_999, 12_345]) {
      const n = landOf(seed);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(LAND_SEEDS);
    }
  });

  const get = (seed: string) =>
    GET(new Request(`http://tv/land/${seed}?tone=day`), {
      params: Promise.resolve({ seed }),
    } as never);

  it("draws a land inside the set", async () => {
    const res = await get(String(LAND_SEEDS - 1));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
  });

  it("draws nothing outside it", async () => {
    for (const seed of [String(LAND_SEEDS), "12345", "-1", "abc", "1.5"]) {
      expect((await get(seed)).status).toBe(404);
    }
  });
});

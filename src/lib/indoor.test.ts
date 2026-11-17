import { describe, expect, it } from "vitest";
import { insideOf, insideShape, roomName } from "./indoor";
import type { Indoor } from "./types";

const room = (name: string, temp: number, humidity?: number): Indoor["rooms"][number] => ({
  name,
  temp,
  hvac: "off",
  ...(humidity !== undefined ? { humidity } : {}),
});
const house = (...rooms: Indoor["rooms"]): Indoor => ({
  temp: Math.round(rooms.reduce((s, r) => s + r.temp, 0) / rooms.length),
  rooms,
});

describe("insideOf", () => {
  it("says nothing without thermostats", () => {
    expect(insideOf(null)).toBeNull();
    expect(insideOf(undefined)).toBeNull();
    expect(insideOf({ temp: 68, rooms: [] })).toBeNull();
  });

  it("gives one number when the rooms are within a couple of degrees", () => {
    expect(insideOf(house(room("Den", 68, 45)))).toEqual({ kind: "one", temp: 68, air: null });
    expect(insideOf(house(room("Den", 68), room("Loft", 70)))).toEqual({
      kind: "one",
      temp: 69,
      air: null,
    });
  });

  it("names each room when they're 3° or more apart", () => {
    expect(insideOf(house(room("Den", 66), room("Guest Room", 71)))).toEqual({
      kind: "rooms",
      rooms: [
        { name: "Den", temp: 66 },
        { name: "Guest room", temp: 71 },
      ],
      air: null,
    });
  });

  it("falls back to a range when rooms can't be named briefly", () => {
    const range = { kind: "range", low: 64, high: 70, air: null };
    expect(insideOf(house(room("", 64), room("Loft", 70)))).toEqual(range);
    expect(insideOf(house(room("Den", 64), room("den", 70)))).toEqual(range);
    expect(
      insideOf(house(room("The Long Front Sitting Room", 64), room("Upstairs Landing", 70))),
    ).toEqual(range);
    expect(insideOf(house(room("A", 64), room("B", 66), room("C", 68), room("D", 70)))).toEqual(
      range,
    );
  });

  it("mentions the air only when it's notably dry or humid", () => {
    expect(insideOf(house(room("Den", 68, 24), room("Loft", 68, 31)))?.air).toBe("dry");
    expect(insideOf(house(room("Den", 68, 64), room("Loft", 68, 62)))?.air).toBe("humid");
    expect(insideOf(house(room("Den", 68, 30), room("Loft", 68, 60)))?.air).toBeNull();
    expect(insideOf(house(room("Den", 68)))?.air).toBeNull();
  });
});

describe("roomName", () => {
  it("sets a room's name in sentence case, keeping acronyms", () => {
    expect(roomName("Living Room")).toBe("Living room");
    expect(roomName("  TV Room ")).toBe("TV room");
    expect(roomName("upstairs")).toBe("Upstairs");
  });
});

describe("insideShape", () => {
  it("changes with the line's shape, not its numbers", () => {
    const a = insideOf(house(room("Den", 68)));
    const b = insideOf(house(room("Den", 70)));
    const c = insideOf(house(room("Den", 66), room("Loft", 71)));
    expect(insideShape(a)).toBe(insideShape(b));
    expect(insideShape(a)).not.toBe(insideShape(c));
    expect(insideShape(null)).toBe("");
  });
});

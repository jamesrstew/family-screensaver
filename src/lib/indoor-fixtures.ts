// Made-up houses for design review (?indoor= in dev). Invented rooms and
// readings; never the family's.

import type { Indoor } from "./types";

type Room = Indoor["rooms"][number];
const room = (name: string, temp: number, humidity = 42): Room => ({
  name,
  temp,
  humidity,
});
const house = (...rooms: Room[]): Omit<Indoor, "at"> => ({
  temp: Math.round(rooms.reduce((s, r) => s + r.temp, 0) / rooms.length),
  rooms,
});

export const FAKE_INDOORS = {
  one: house(room("Den", 68)),
  close: house(room("Den", 68), room("Upstairs", 70)),
  apart: house(room("Den", 66), room("Upstairs", 71)),
  dry: house(room("Den", 67, 24), room("Upstairs", 68, 27)),
  none: null,
} satisfies Record<string, Omit<Indoor, "at"> | null>;

export type FakeIndoor = keyof typeof FAKE_INDOORS;
export const isFakeIndoor = (s: string): s is FakeIndoor => Object.hasOwn(FAKE_INDOORS, s);

// The shapes that travel from the server to the TV. Plain JSON only.

export const PAGES = ["home", "weather", "week", "notebook"] as const;
export type Page = (typeof PAGES)[number];

export type Weather = {
  now: { temp: number; label: string; code: number; isDay: boolean };
  today: {
    high: number;
    low: number;
    precipChance: number;
    label: string;
    sunrise: string; // ISO
    sunset: string; // ISO
  };
  days: Array<{
    date: string; // YYYY-MM-DD in the family's time zone
    high: number;
    low: number;
    precipChance: number;
    label: string;
    code: number;
  }>;
  hours: Array<{ time: string; temp: number; precipChance: number }>; // next 24
};

export type Happening = {
  id: string;
  title: string;
  allDay: boolean;
  // Timed: ISO instants. All-day: YYYY-MM-DD dates, end exclusive.
  start: string;
  end: string;
};

export type NotebookItem = {
  id: string;
  kind: "idea" | "quote" | "question";
  text: string;
  author?: string;
  source?: string;
};

export type Snapshot = {
  issuedAt: string; // ISO
  place: string;
  timeZone: string;
  weather: Weather | null; // null: not configured or unavailable
  happenings: Happening[] | null; // null: no calendar connected
  notebook: NotebookItem[]; // today's selection, in order
  voice: boolean; // can it talk?
};

export type ShowRequest = { seq: number; page: Page; at: string };

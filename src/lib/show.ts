import { z } from "zod";
import { PAGES, type Page } from "./types";

// Requests to show a page come from the phone remote, Siri, Alexa, and the
// voice. A request is just "show this page". The TV decides the rest.

const ALIASES: Record<string, Page> = {
  home: "home",
  front: "home",
  ideas: "notebook",
  forecast: "weather",
  calendar: "week",
  schedule: "week",
  "week ahead": "week",
  quote: "notebook",
  idea: "notebook",
  question: "notebook",
};

export const ShowBody = z.object({
  page: z
    .string()
    .trim()
    .toLowerCase()
    .transform((p) => ALIASES[p] ?? p)
    .pipe(z.enum(PAGES)),
});

/** Requests older than this are ignored by a TV that just woke up. */
export const SHOW_TTL_MS = 2 * 60_000;

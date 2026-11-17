import { z } from "zod";
import { WEATHER_VIEWS, type WeatherView } from "./carousel";
import { PAGES, type Page } from "./types";

// Requests to show a page come from the phone remote, Siri, Alexa, and the
// voice. A request is just "show this page" (and, for the weather, which view
// of it). The TV decides the rest.

type Asked = { page: Page; view?: WeatherView };

const ALIASES: Record<string, Asked> = {
  home: { page: "home" },
  front: { page: "home" },
  ideas: { page: "notebook" },
  forecast: { page: "weather" },
  calendar: { page: "week" },
  schedule: { page: "week" },
  "week ahead": { page: "week" },
  quote: { page: "notebook" },
  idea: { page: "notebook" },
  question: { page: "notebook" },
  // The weather's views, by the names people say.
  now: { page: "weather", view: "now" },
  hours: { page: "weather", view: "hours" },
  hourly: { page: "weather", view: "hours" },
  "hour by hour": { page: "weather", view: "hours" },
  days: { page: "weather", view: "days" },
  daily: { page: "weather", view: "days" },
  "seven day": { page: "weather", view: "days" },
  "7 day": { page: "weather", view: "days" },
  "ten day": { page: "weather", view: "days" },
  "10 day": { page: "weather", view: "days" },
  "weekly forecast": { page: "weather", view: "days" },
  "week's forecast": { page: "weather", view: "days" },
  today: { page: "weather", view: "ribbon" },
  "next 24 hours": { page: "weather", view: "ribbon" },
  ribbon: { page: "weather", view: "ribbon" },
};

const words = (s: string) =>
  s.trim().toLowerCase().replace(/[’]/g, "'").replace(/[-_]+/g, " ").replace(/\s+/g, " ");

/** `{"page": "hourly"}`, or `{"page": "weather", "view": "days"}`. */
export const ShowBody = z
  .object({ page: z.string(), view: z.string().optional() })
  .transform(({ page, view }, ctx): Asked => {
    const p = words(page);
    const asked: Asked | undefined =
      ALIASES[p] ?? (PAGES.includes(p as Page) ? { page: p as Page } : undefined);
    if (!asked) {
      ctx.addIssue({ code: "custom", message: "Unknown page" });
      return z.NEVER;
    }
    if (view === undefined || asked.page !== "weather") return asked;
    const v = words(view);
    const named = WEATHER_VIEWS.find((w) => w === v) ?? ALIASES[v]?.view;
    return named ? { page: "weather", view: named } : asked;
  });

/** Requests older than this are ignored by a TV that just woke up. */
export const SHOW_TTL_MS = 2 * 60_000;

/** The weather view a request carries: only the weather has views; any other page (or the arrows) clears it. */
export const viewAsked = (page: Page, view?: WeatherView): WeatherView | null =>
  page === "weather" ? (view ?? null) : null;

/**
 * What the screen draws: home's carousel slide (Almanac by day), the weather
 * in the view asked for (by request, else ?weather=), or the page itself.
 */
export function targetOf(o: {
  base: Page | "night";
  slide: string | null;
  asked: WeatherView | null;
  fromUrl: WeatherView;
}): string {
  if (o.slide) return `home:${o.slide}`;
  if (o.base === "weather") return `weather:${o.asked ?? o.fromUrl}`;
  return o.base;
}

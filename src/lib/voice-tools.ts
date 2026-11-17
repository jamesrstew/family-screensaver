// What the voice can do, answered from the snapshot already on hand.
// Times are spelled out so the model never does time-zone math.

import { WEATHER_VIEWS, type WeatherView } from "./carousel";
import { forecastLine } from "./forecast";
import { addDays, dayKey, happeningsOn, weekdayOf, whenOf } from "./time";
import { PAGES, type Snapshot, type Page } from "./types";

export type ToolContext = {
  snapshot: Snapshot;
  now: Date;
  show: (page: Page, view?: WeatherView) => void | Promise<void>;
  hangUp: () => void;
};

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  const { snapshot, now } = ctx;
  const tz = snapshot.timeZone;

  switch (name) {
    case "show_page": {
      const page = String(args.page) as Page;
      if (!PAGES.includes(page)) return { ok: false, error: "No such page" };
      const view = WEATHER_VIEWS.find((v) => v === args.view);
      await ctx.show(page, page === "weather" ? view : undefined);
      return { ok: true };
    }
    case "read_weather": {
      const w = snapshot.weather;
      if (!w) return { available: false };
      return {
        summary: forecastLine(w, now, tz),
        now: `${w.now.temp}°F, ${w.now.label}`,
        days: w.days.slice(0, 7).map((d, i) => ({
          day: i === 0 ? "today" : weekdayOf(d.date),
          high: d.high,
          low: d.low,
          sky: d.label,
          chanceOfPrecipitation: `${d.precipChance}%`,
        })),
      };
    }
    case "read_calendar": {
      if (!snapshot.happenings) return { available: false };
      const today = dayKey(now, tz);
      const range = String(args.range);
      const days =
        range === "today" ? [today] : range === "tomorrow" ? [addDays(today, 1)] : week(today);
      return days.map((day, i) => ({
        day:
          day === today ? "today" : i === 1 || range === "tomorrow" ? "tomorrow" : weekdayOf(day),
        events: happeningsOn(snapshot.happenings!, day, tz).map((h) => ({
          when: whenOf(h, day, tz),
          what: h.title,
        })),
      }));
    }
    case "end_conversation":
      ctx.hangUp();
      return { ok: true };
    default:
      return { ok: false, error: `Unknown tool ${name}` };
  }
}

const week = (today: string) => Array.from({ length: 7 }, (_, i) => addDays(today, i));

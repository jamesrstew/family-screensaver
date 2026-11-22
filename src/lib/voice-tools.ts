// What the voice can do, answered from the snapshot already on hand.
// Times are spelled out so the model never does time-zone math.

import { WEATHER_VIEWS, type WeatherView } from "./carousel";
import { forecastLine } from "./forecast";
import { freshIndoor } from "./indoor";
import {
  LEAGUE_PICKS,
  chanceOf,
  dayLabel,
  freshGames,
  joinWord,
  leagueView,
  whenWord,
  type LeaguePick,
} from "./games";
import { SOUNDS, type Sound } from "./nature";
import { addDays, dayKey, happeningsOn, weekdayOf, whenOf } from "./time";
import { PAGES, type Snapshot, type Page } from "./types";

export type ToolContext = {
  snapshot: Snapshot;
  now: Date;
  /**
   * `team`: for the games page, one team as said ("Kentucky basketball").
   * Says whether that team was found (undefined when none was asked for).
   * `league`: for the games page, one league's games (never beside a team).
   */
  show: (page: Page, view?: WeatherView, team?: string, league?: LeaguePick) => unknown;
  /** How nature sounds from now on: gentle, full, or off. False if it couldn't be asked. */
  sound: (sound: Sound) => unknown;
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
      const team = page === "sports" && typeof args.team === "string" ? args.team.slice(0, 60) : "";
      // One of the few leagues, or none (the whole scoreboard); a team, if named, wins.
      const league =
        page === "sports" && !team ? LEAGUE_PICKS.find((l) => l === args.league) : undefined;
      const found = await ctx.show(
        page,
        page === "weather" ? view : undefined,
        team || undefined,
        league,
      );
      // The truth when no team answers to it: the games page is up instead.
      if (team && found === false) {
        return {
          ok: true,
          team: false,
          shown: "the games (the family's teams and the Top 25)",
          say: "I couldn't find that team; here are the games.",
        };
      }
      return { ok: true };
    }
    case "nature_sound": {
      const sound = SOUNDS.find((s) => s === args.sound);
      if (!sound) return { ok: false, error: "No such sound" };
      // The truth if the TV wasn't reached (the phone asks over the network).
      if ((await ctx.sound(sound)) === false) {
        return { ok: false, say: "The TV didn't answer. Try again." };
      }
      return { ok: true };
    }
    case "read_weather": {
      const w = snapshot.weather;
      // Inside the house, room by room, when the thermostats answered recently;
      // otherwise plainly unknown, so the voice says so rather than guessing.
      // Room names leave the house here (to OpenAI, with the rest of the
      // conversation); they're the family's own labels, often a child's name.
      const indoor = freshIndoor(snapshot, now);
      const inside = indoor
        ? indoor.rooms.map((r) => ({
            room: r.name,
            temperature: `${r.temp}°F`,
            ...(r.humidity !== undefined ? { humidity: `${r.humidity}%` } : {}),
          }))
        : "unknown";
      if (!w) return { available: false, inside };
      return {
        inside,
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
    case "read_games": {
      const all = freshGames(snapshot, now);
      if (!all) return { available: false };
      // One league's, if asked: with the NFL's whole slate for the NFL (and football).
      const pick = LEAGUE_PICKS.find((l) => l === args.league);
      // Unknown (the NFL's scoreboard didn't answer) is said as unknown, never as "no games".
      const slate = freshGames({ games: snapshot.nfl, gamesAt: snapshot.gamesAt }, now);
      const games = pick ? leagueView(all, slate, pick) : all;
      if (!games) return { available: false };
      return games.map((g) => {
        const odds = chanceOf(g);
        const name = (s: typeof g.home) => (s.rank ? `No. ${s.rank} ${s.name}` : s.name);
        return {
          day: dayLabel(dayKey(new Date(g.start), tz), now, tz).toLowerCase(),
          when: whenWord(g, tz),
          game: `${name(g.away)} ${joinWord(g)} ${name(g.home)}`,
          ...(g.tv ? { channel: g.tv } : {}),
          ...(typeof g.away.score === "number" && typeof g.home.score === "number"
            ? { score: `${g.away.name} ${g.away.score}, ${g.home.name} ${g.home.score}` }
            : {}),
          ...(odds
            ? { chanceOfWinning: odds.pct === 50 ? "even" : `${odds.side.name} ${odds.pct}%` }
            : {}),
          ...(g.home.mine || g.away.mine ? { ourTeam: true } : {}),
        };
      });
    }
    case "end_conversation":
      ctx.hangUp();
      return { ok: true };
    default:
      return { ok: false, error: `Unknown tool ${name}` };
  }
}

const week = (today: string) => Array.from({ length: 7 }, (_, i) => addDays(today, i));

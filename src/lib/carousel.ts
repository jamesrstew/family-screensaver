// Home turns between pieces every half minute: a view of the weather first
// (home always opens on the weather's "now", never on a quote), then a
// passage (a quote, or in the afternoon the question for the table), then the
// next weather view, and so on. Night turns the same way, in night's ink: the
// weather, then the night page with its one dim piece, then the next view.
// It counts from the moment home appeared; which quote and which view come up
// follow the clock, so a reload doesn't repeat the same ones.

export const WEATHER_MS = 30_000;
export const PASSAGE_MS = 30_000;
const TURN_MS = WEATHER_MS + PASSAGE_MS;

/** The approved weather views, in the order home shows them. */
export const WEATHER_VIEWS = ["now", "hours", "days", "ribbon"] as const;
export type WeatherView = (typeof WEATHER_VIEWS)[number];

export type Slide = { kind: "passage"; n: number } | { kind: "weather"; view: WeatherView };

/** What home shows at `now`, having appeared at `since`. No weather report: passages only. */
export function slideOf(now: Date, since: number, hasWeather: boolean): Slide {
  const elapsed = Math.max(now.getTime() - since, 0);
  const turn = Math.floor(elapsed / TURN_MS);
  // The weather views go in order from the moment home appeared, starting
  // with "now"; the passages follow the clock, so a reload brings new ones.
  if (hasWeather && elapsed % TURN_MS < WEATHER_MS) {
    return { kind: "weather", view: WEATHER_VIEWS[turn % WEATHER_VIEWS.length] };
  }
  return { kind: "passage", n: Math.floor(since / TURN_MS) + turn };
}

/** Home by day and the night page turn as one carousel; the rest of the pages don't. */
export const turns = (base: string) => base === "home" || base === "night";

/**
 * When the carousel counts from, after the screen's page changes. Day and
 * night are one carousel: at sunset or sunrise it carries on (the next piece
 * simply comes in the other ink). Coming back from another page starts it
 * over, on the weather; from the Weather page, the weather's just been seen,
 * so it opens on a passage.
 */
export function sinceAfter(from: string, to: string, now: number, since: number): number {
  if (!turns(to) || turns(from)) return since;
  return now - (from === "weather" ? WEATHER_MS : 0);
}

export const slideKey = (s: Slide) =>
  s.kind === "passage" ? `passage-${s.n}` : `weather-${s.view}`;

export function slideFromKey(key: string): Slide | undefined {
  const [kind, rest] = key.split("-");
  if (kind === "passage" && /^\d+$/.test(rest)) return { kind, n: Number(rest) };
  const view = WEATHER_VIEWS.find((v) => v === rest);
  return kind === "weather" && view ? { kind, view } : undefined;
}

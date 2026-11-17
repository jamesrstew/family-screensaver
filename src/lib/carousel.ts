// Home turns slowly between pieces: a view of the weather first (home always
// opens on the weather, never on a quote), then a passage (a quote, or in the
// afternoon the question for the table), then the next weather view, and so on.
// It counts from the moment home appeared; which quote and which view come up
// follow the clock, so a reload doesn't repeat the same ones.

export const WEATHER_MS = 2 * 60_000;
export const PASSAGE_MS = 4 * 60_000;
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

export const slideKey = (s: Slide) =>
  s.kind === "passage" ? `passage-${s.n}` : `weather-${s.view}`;

export function slideFromKey(key: string): Slide | undefined {
  const [kind, rest] = key.split("-");
  if (kind === "passage" && /^\d+$/.test(rest)) return { kind, n: Number(rest) };
  const view = WEATHER_VIEWS.find((v) => v === rest);
  return kind === "weather" && view ? { kind, view } : undefined;
}

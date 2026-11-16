// Home turns slowly between pieces: a view of the weather first (home always
// opens on the weather, never on a quote), then a passage (a quote, or in the
// evening the question for the table), then the next weather view, and so on.
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
  const k = Math.floor(since / TURN_MS) + Math.floor(elapsed / TURN_MS);
  if (hasWeather && elapsed % TURN_MS < WEATHER_MS) {
    // Home opens on "now", the view that answers what it's like out there.
    if (elapsed < TURN_MS) return { kind: "weather", view: "now" };
    return { kind: "weather", view: WEATHER_VIEWS[k % WEATHER_VIEWS.length] };
  }
  return { kind: "passage", n: k };
}

export const slideKey = (s: Slide) =>
  s.kind === "passage" ? `passage-${s.n}` : `weather-${s.view}`;

export function slideFromKey(key: string): Slide | undefined {
  const [kind, rest] = key.split("-");
  if (kind === "passage" && /^\d+$/.test(rest)) return { kind, n: Number(rest) };
  const view = WEATHER_VIEWS.find((v) => v === rest);
  return kind === "weather" && view ? { kind, view } : undefined;
}

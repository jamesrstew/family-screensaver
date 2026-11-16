// Home turns slowly between pieces: a passage (a quote, or in the evening the
// question for the table), then a view of the weather, then the next passage.
// Deterministic, so every screen in the house agrees and a reload changes nothing.

export const PASSAGE_MS = 4 * 60_000;
export const WEATHER_MS = 2 * 60_000;
const TURN_MS = PASSAGE_MS + WEATHER_MS;

/** The four approved weather views, in the order home shows them. */
export const WEATHER_VIEWS = ["sky", "answer", "days", "ribbon"] as const;
export type WeatherView = (typeof WEATHER_VIEWS)[number];

export type Slide = { kind: "passage"; n: number } | { kind: "weather"; view: WeatherView };

/** What home shows at this moment. With no weather report, it's always a passage. */
export function slideOf(now: Date, hasWeather: boolean): Slide {
  const t = now.getTime();
  const n = Math.floor(t / TURN_MS);
  if (!hasWeather || t - n * TURN_MS < PASSAGE_MS) return { kind: "passage", n };
  return { kind: "weather", view: WEATHER_VIEWS[n % WEATHER_VIEWS.length] };
}

export const slideKey = (s: Slide) =>
  s.kind === "passage" ? `passage-${s.n}` : `weather-${s.view}`;

export function slideFromKey(key: string): Slide | undefined {
  const [kind, rest] = key.split("-");
  if (kind === "passage" && /^\d+$/.test(rest)) return { kind, n: Number(rest) };
  const view = WEATHER_VIEWS.find((v) => v === rest);
  return kind === "weather" && view ? { kind, view } : undefined;
}

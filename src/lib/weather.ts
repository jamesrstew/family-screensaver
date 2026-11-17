import "server-only";
import { cacheLife } from "next/cache";
import { feelOf } from "./feel";
import { describe } from "./forecast";
import type { DayHours, Weather } from "./types";

// Open-Meteo: free, no key. Fahrenheit, inches, mph, the family's time zone.
const API = "https://api.open-meteo.com/v1/forecast";

export type OpenMeteo = {
  current: {
    temperature_2m: number;
    weather_code: number;
    is_day: number;
    visibility?: Num;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: number[];
    weather_code?: number[];
    is_day?: number[];
    precipitation?: Num[];
    snowfall?: Num[];
    wind_speed_10m?: Num[];
    wind_gusts_10m?: Num[];
    wind_direction_10m?: Num[];
    uv_index?: Num[];
    relative_humidity_2m?: Num[];
    dew_point_2m?: Num[];
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    sunrise: string[];
    sunset: string[];
    precipitation_sum?: Num[];
    snowfall_sum?: Num[];
    wind_speed_10m_max?: Num[];
    wind_gusts_10m_max?: Num[];
    wind_direction_10m_dominant?: Num[];
    uv_index_max?: Num[];
  };
  utc_offset_seconds: number;
};

// Open-Meteo sends null where a model has no value.
type Num = number | null;

export async function getWeather(lat: number, lon: number, timeZone: string): Promise<Weather> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 3600 });

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: timeZone,
    temperature_unit: "fahrenheit",
    // Snowfall comes in inches of snow; precipitation in inches of water.
    precipitation_unit: "inch",
    wind_speed_unit: "mph",
    // Visibility (meters) helps tell haze.
    current: "temperature_2m,weather_code,is_day,visibility",
    hourly:
      "temperature_2m,precipitation_probability,weather_code,is_day," +
      "precipitation,snowfall,wind_speed_10m,wind_gusts_10m,wind_direction_10m,uv_index," +
      "relative_humidity_2m,dew_point_2m",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset," +
      "precipitation_sum,snowfall_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,uv_index_max",
    // Eight, so the seven days ahead are all there after today drops off at 5 p.m.
    forecast_days: "8",
  });
  const res = await fetch(`${API}?${params}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`open-meteo ${res.status}`);
  return shape(await res.json());
}

// Open-Meteo returns local wall times without an offset ("2026-11-16T07:00").
// Attach the location's offset so every time we pass on is a real instant.
function instant(local: string, offsetSeconds: number): string {
  const sign = offsetSeconds < 0 ? "-" : "+";
  const abs = Math.abs(offsetSeconds);
  const hh = String(Math.floor(abs / 3600)).padStart(2, "0");
  const mm = String(Math.floor((abs % 3600) / 60)).padStart(2, "0");
  return new Date(`${local}:00${sign}${hh}:${mm}`).toISOString();
}

/** Hundredths of an inch; whole mph; UV to a tenth. Small numbers travel light. */
const r2 = (x: Num | undefined) => (x == null ? undefined : Math.round(x * 100) / 100);
const r0 = (x: Num | undefined) => (x == null ? undefined : Math.round(x));
const r1 = (x: Num | undefined) => (x == null ? undefined : Math.round(x * 10) / 10);

/** Each day's hours, from local midnight, as columns. Missing when any column is. */
function dayHours(h: OpenMeteo["hourly"]): Map<string, DayHours> {
  const out = new Map<string, DayHours>();
  const cols = [h.precipitation, h.snowfall, h.wind_speed_10m, h.wind_gusts_10m, h.uv_index];
  if (cols.some((c) => !c)) return out;
  h.time.forEach((t, i) => {
    const date = t.slice(0, 10);
    let day = out.get(date);
    if (!day) out.set(date, (day = { precip: [], snow: [], wind: [], gust: [], uv: [] }));
    day.precip.push(r2(h.precipitation![i]) ?? 0);
    day.snow.push(r2(h.snowfall![i]) ?? 0);
    day.wind.push(r0(h.wind_speed_10m![i]) ?? 0);
    day.gust.push(r0(h.wind_gusts_10m![i]) ?? 0);
    day.uv.push(r1(h.uv_index![i]) ?? 0);
    // How it feels against the thermometer, and the air's water.
    (day.temp ??= []).push(Math.round(h.temperature_2m[i]));
    // How it feels: the NWS wind chill or heat index (feel.ts), from the raw readings.
    (day.feels ??= []).push(
      feelOf(
        h.temperature_2m[i],
        h.wind_speed_10m![i] ?? 0,
        h.relative_humidity_2m?.[i] ?? undefined,
      ),
    );
    if (h.relative_humidity_2m) (day.rh ??= []).push(r0(h.relative_humidity_2m[i]) ?? 0);
    if (h.dew_point_2m) (day.dew ??= []).push(r0(h.dew_point_2m[i]) ?? 0);
  });
  return out;
}

export function shape(d: OpenMeteo, now = new Date()): Weather {
  const off = d.utc_offset_seconds;
  const strips = dayHours(d.hourly);
  const days = d.daily.time.map((date, i) => ({
    date,
    high: Math.round(d.daily.temperature_2m_max[i]),
    low: Math.round(d.daily.temperature_2m_min[i]),
    precipChance: d.daily.precipitation_probability_max[i] ?? 0,
    code: d.daily.weather_code[i],
    label: describe(d.daily.weather_code[i]),
    precip: r2(d.daily.precipitation_sum?.[i]),
    snow: r2(d.daily.snowfall_sum?.[i]),
    wind: r0(d.daily.wind_speed_10m_max?.[i]),
    gust: r0(d.daily.wind_gusts_10m_max?.[i]),
    dir: r0(d.daily.wind_direction_10m_dominant?.[i]),
    uv: r1(d.daily.uv_index_max?.[i]),
    feelsHigh: strips.get(date)?.feels && Math.max(...strips.get(date)!.feels!),
    feelsLow: strips.get(date)?.feels && Math.min(...strips.get(date)!.feels!),
    hourly: strips.get(date),
  }));

  const firstHour = d.hourly.time.findIndex(
    (t) => new Date(instant(t, off)).getTime() > now.getTime() - 3600_000,
  );
  const from = Math.max(firstHour, 0);
  const hours = d.hourly.time.slice(from, from + 24).map((t, i) => ({
    time: instant(t, off),
    temp: Math.round(d.hourly.temperature_2m[from + i]),
    precipChance: d.hourly.precipitation_probability[from + i] ?? 0,
    code: d.hourly.weather_code?.[from + i],
    isDay: d.hourly.is_day ? d.hourly.is_day[from + i] === 1 : undefined,
    precip: r2(d.hourly.precipitation?.[from + i]),
    snow: r2(d.hourly.snowfall?.[from + i]),
    wind: r0(d.hourly.wind_speed_10m?.[from + i]),
    gust: r0(d.hourly.wind_gusts_10m?.[from + i]),
    dir: r0(d.hourly.wind_direction_10m?.[from + i]),
    uv: r1(d.hourly.uv_index?.[from + i]),
    feels:
      d.hourly.wind_speed_10m?.[from + i] != null
        ? feelOf(
            d.hourly.temperature_2m[from + i],
            d.hourly.wind_speed_10m[from + i]!,
            d.hourly.relative_humidity_2m?.[from + i] ?? undefined,
          )
        : undefined,
    rh: r0(d.hourly.relative_humidity_2m?.[from + i]),
    dew: r0(d.hourly.dew_point_2m?.[from + i]),
  }));

  return {
    now: {
      temp: Math.round(d.current.temperature_2m),
      label: describe(d.current.weather_code, d.current.is_day === 1),
      code: d.current.weather_code,
      isDay: d.current.is_day === 1,
      visibility: r0(d.current.visibility),
    },
    today: {
      high: days[0].high,
      low: days[0].low,
      precipChance: days[0].precipChance,
      label: days[0].label,
      sunrise: instant(d.daily.sunrise[0], off),
      sunset: instant(d.daily.sunset[0], off),
      nextSunrise: d.daily.sunrise[1] ? instant(d.daily.sunrise[1], off) : undefined,
    },
    days,
    hours,
  };
}

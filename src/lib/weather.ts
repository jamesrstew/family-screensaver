import "server-only";
import { cacheLife } from "next/cache";
import { describe } from "./forecast";
import type { Weather } from "./types";

// Open-Meteo: free, no key. Fahrenheit, the family's time zone.
const API = "https://api.open-meteo.com/v1/forecast";

type OpenMeteo = {
  current: { temperature_2m: number; weather_code: number; is_day: number };
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: number[];
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    sunrise: string[];
    sunset: string[];
  };
  utc_offset_seconds: number;
};

export async function getWeather(lat: number, lon: number, timeZone: string): Promise<Weather> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 3600 });

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: timeZone,
    temperature_unit: "fahrenheit",
    current: "temperature_2m,weather_code,is_day",
    hourly: "temperature_2m,precipitation_probability",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
    forecast_days: "7",
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

export function shape(d: OpenMeteo, now = new Date()): Weather {
  const off = d.utc_offset_seconds;
  const days = d.daily.time.map((date, i) => ({
    date,
    high: Math.round(d.daily.temperature_2m_max[i]),
    low: Math.round(d.daily.temperature_2m_min[i]),
    precipChance: d.daily.precipitation_probability_max[i] ?? 0,
    code: d.daily.weather_code[i],
    label: describe(d.daily.weather_code[i]),
  }));

  const firstHour = d.hourly.time.findIndex(
    (t) => new Date(instant(t, off)).getTime() > now.getTime() - 3600_000,
  );
  const from = Math.max(firstHour, 0);
  const hours = d.hourly.time.slice(from, from + 24).map((t, i) => ({
    time: instant(t, off),
    temp: Math.round(d.hourly.temperature_2m[from + i]),
    precipChance: d.hourly.precipitation_probability[from + i] ?? 0,
  }));

  return {
    now: {
      temp: Math.round(d.current.temperature_2m),
      label: describe(d.current.weather_code, d.current.is_day === 1),
      code: d.current.weather_code,
      isDay: d.current.is_day === 1,
    },
    today: {
      high: days[0].high,
      low: days[0].low,
      precipChance: days[0].precipChance,
      label: days[0].label,
      sunrise: instant(d.daily.sunrise[0], off),
      sunset: instant(d.daily.sunset[0], off),
    },
    days,
    hours,
  };
}

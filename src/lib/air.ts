import "server-only";
import { cacheLife } from "next/cache";
import type { Weather } from "./types";

// Open-Meteo's air-quality forecast: free, no key, its own service. It runs
// about five days, so the week's last days have no air to report; they're
// left blank, never guessed. If it's down, the weather goes on without it.
const API = "https://air-quality-api.open-meteo.com/v1/air-quality";

type Num = number | null;

export type OpenMeteoAir = {
  current?: { us_aqi?: Num; pm2_5?: Num };
  hourly: { time: string[]; us_aqi?: Num[]; pm2_5?: Num[] };
  utc_offset_seconds: number;
};

/** The air, hour by hour, keyed by local wall time ("2026-11-18T14"). */
export type Air = {
  now: { aqi?: number; pm?: number };
  hours: Map<string, { aqi: number; pm?: number }>;
  offset: number;
};

export async function getAir(lat: number, lon: number, timeZone: string): Promise<OpenMeteoAir> {
  "use cache";
  cacheLife({ stale: 600, revalidate: 1800, expire: 7200 });
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: timeZone,
    current: "us_aqi,pm2_5",
    hourly: "us_aqi,pm2_5",
    forecast_days: "7",
  });
  const res = await fetch(`${API}?${params}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`open-meteo air ${res.status}`);
  return res.json();
}

const r0 = (x: Num | undefined) => (x == null ? undefined : Math.round(x));

export function shapeAir(d: OpenMeteoAir): Air {
  const hours = new Map<string, { aqi: number; pm?: number }>();
  d.hourly.time.forEach((t, i) => {
    const aqi = r0(d.hourly.us_aqi?.[i]);
    if (aqi != null) hours.set(t.slice(0, 13), { aqi, pm: r0(d.hourly.pm2_5?.[i]) });
  });
  return {
    now: { aqi: r0(d.current?.us_aqi), pm: r0(d.current?.pm2_5) },
    hours,
    offset: d.utc_offset_seconds,
  };
}

/** Local wall time of an instant, to the hour, at a fixed offset: "2026-11-18T14". */
function wall(iso: string, offset: number): string {
  return new Date(Date.parse(iso) + offset * 1000).toISOString().slice(0, 13);
}

/**
 * The weather with the air folded in: now, each of the next hours, each
 * day's worst, and each day's hours. Where the air forecast doesn't reach,
 * nothing is added.
 */
export function withAir(w: Weather, air: Air): Weather {
  const at = (key: string) => air.hours.get(key);
  // The current hour stands in when "current" is missing.
  const first = w.hours[0] ? at(wall(w.hours[0].time, air.offset)) : undefined;
  return {
    ...w,
    now: {
      ...w.now,
      aqi: air.now.aqi ?? first?.aqi,
      pm: air.now.pm ?? first?.pm,
    },
    hours: w.hours.map((h) => {
      const a = at(wall(h.time, air.offset));
      return a ? { ...h, aqi: a.aqi, pm: a.pm } : h;
    }),
    days: w.days.map((d) => {
      const hours = Array.from({ length: 24 }, (_, h) =>
        at(`${d.date}T${String(h).padStart(2, "0")}`),
      );
      const aqi = hours.map((a) => a?.aqi ?? null);
      const pm = hours.map((a) => a?.pm ?? null);
      const known = aqi.filter((x): x is number => x != null);
      if (!known.length) return d;
      return {
        ...d,
        aqi: Math.max(...known),
        hourly: d.hourly ? { ...d.hourly, aqi, pm } : d.hourly,
      };
    }),
  };
}

import "server-only";
import { cacheLife } from "next/cache";
import type { Indoor } from "./types";

// Inside the house: the Nest thermostats, through Google's Device Access
// (Smart Device Management). Read only. Set up once with `pnpm nest:connect`;
// without its four env vars, there's simply no indoor reading.

const SDM = "https://smartdevicemanagement.googleapis.com/v1";

type Device = {
  type: string;
  traits: Record<string, Record<string, unknown> | undefined>;
  parentRelations?: Array<{ displayName?: string }>;
};

export function nestConfig() {
  const project = process.env.NEST_PROJECT_ID?.trim();
  const clientId = process.env.NEST_CLIENT_ID?.trim();
  const clientSecret = process.env.NEST_CLIENT_SECRET?.trim();
  const refreshToken = process.env.NEST_REFRESH_TOKEN?.trim();
  return project && clientId && clientSecret && refreshToken
    ? { project, clientId, clientSecret, refreshToken }
    : null;
}

/** An access token lasts an hour; trade the refresh token for one a little less often. */
async function accessToken(): Promise<string> {
  "use cache";
  cacheLife({ stale: 1800, revalidate: 2700, expire: 3300 });
  const c = nestConfig();
  if (!c) throw new Error("nest not configured");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      refresh_token: c.refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`nest token ${res.status}`);
  const { access_token } = (await res.json()) as { access_token?: string };
  if (!access_token) throw new Error("nest token missing");
  return access_token;
}

/** The thermostats' readings, every few minutes (the API allows only a few calls a minute). */
export async function getIndoor(): Promise<Indoor | null> {
  "use cache";
  cacheLife({ stale: 120, revalidate: 300, expire: 1800 });
  const c = nestConfig();
  if (!c) return null;
  const res = await fetch(`${SDM}/enterprises/${c.project}/devices`, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`nest devices ${res.status}`);
  return indoorOf(((await res.json()) as { devices?: Device[] }).devices ?? []);
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const fahrenheit = (c: number) => Math.round((c * 9) / 5 + 32);

/**
 * Each thermostat's room, temperature (°F), and humidity. Pure. A thermostat
 * that's offline is left out: Google keeps answering with its last reading,
 * which may be hours old.
 */
export function indoorOf(devices: Device[]): Indoor | null {
  const rooms = devices
    .filter((d) => d.type === "sdm.devices.types.THERMOSTAT")
    .filter((d) => d.traits["sdm.devices.traits.Connectivity"]?.status !== "OFFLINE")
    .flatMap((d) => {
      const celsius = num(d.traits["sdm.devices.traits.Temperature"]?.ambientTemperatureCelsius);
      if (celsius === undefined) return [];
      const humidity = num(d.traits["sdm.devices.traits.Humidity"]?.ambientHumidityPercent);
      return [
        {
          name:
            String(d.traits["sdm.devices.traits.Info"]?.customName ?? "").trim() ||
            d.parentRelations?.[0]?.displayName?.trim() ||
            "",
          temp: fahrenheit(celsius),
          ...(humidity !== undefined ? { humidity: Math.round(humidity) } : {}),
        } satisfies Indoor["rooms"][number],
      ];
    });
  if (!rooms.length) return null;
  const temp = Math.round(rooms.reduce((s, r) => s + r.temp, 0) / rooms.length);
  return { temp, rooms };
}

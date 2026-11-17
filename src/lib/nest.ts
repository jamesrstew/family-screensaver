import "server-only";
import { cacheLife } from "next/cache";
import type { Indoor } from "./types";

// Inside the house: the Nest thermostats, through Google's Device Access
// (Smart Device Management). Read only. Set up once with `pnpm nest:connect`;
// without its four env vars, there's simply no indoor reading.

const SDM = "https://smartdevicemanagement.googleapis.com/v1";

type Device = {
  type?: string;
  traits?: Record<string, Record<string, unknown> | undefined>;
  parentRelations?: Array<{ displayName?: unknown }>;
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

/** Each call to Google gets this long; the snapshot bounds the whole read (snapshot.ts). */
const CALL_MS = 5000;

/**
 * An access token lasts an hour; trade the refresh token for one a little
 * less often. `epoch` is part of the cache key: when Google turns a token
 * down early, the next epoch fetches a new one instead of waiting out the hour.
 */
async function accessToken(epoch: number): Promise<string> {
  "use cache";
  cacheLife({ stale: 1800, revalidate: 2700, expire: 3300 });
  void epoch;
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
    signal: AbortSignal.timeout(CALL_MS),
  });
  if (!res.ok) throw new Error(`nest token ${res.status}`);
  const { access_token } = (await res.json()) as { access_token?: string };
  if (!access_token) throw new Error("nest token missing");
  return access_token;
}

// This server instance's token epoch; bumped when Google refuses the token.
let tokenEpoch = 0;

/** The device list, once more with a fresh token if Google refused the cached one. */
async function devicesOf(project: string): Promise<unknown> {
  const list = (token: string) =>
    fetch(`${SDM}/enterprises/${project}/devices`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(CALL_MS),
    });
  let res = await list(await accessToken(tokenEpoch));
  if (res.status === 401) {
    tokenEpoch++;
    res = await list(await accessToken(tokenEpoch));
  }
  if (!res.ok) throw new Error(`nest devices ${res.status}`);
  return ((await res.json()) as { devices?: unknown }).devices;
}

/**
 * The thermostats' readings, every few minutes. A good reading expires well
 * inside the TV's 30 minutes (indoor.ts), so whatever is handed out has most
 * of its life left. A failure is remembered briefly, so an outage costs one
 * slow call every couple of minutes rather than one per request.
 */
export async function getIndoor(): Promise<Indoor | null> {
  "use cache";
  const c = nestConfig();
  if (!c) {
    cacheLife({ stale: 120, revalidate: 300, expire: 900 });
    return null;
  }
  try {
    const devices = await devicesOf(c.project);
    cacheLife({ stale: 120, revalidate: 300, expire: 900 });
    // Stamped here, inside the cache, so a cached reading keeps its true age.
    return indoorOf(
      Array.isArray(devices) ? devices : [],
      new Date().toISOString(),
      process.env.NEST_ROOM ?? "",
      // Never the name itself: room names stay out of logs.
      () => console.error("[nest] NEST_ROOM matched no online thermostat; showing the average"),
    );
  } catch (err) {
    cacheLife({ stale: 60, revalidate: 120, expire: 120 });
    console.error("[nest] unavailable", err instanceof Error ? err.message : "");
    return null;
  }
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const fahrenheit = (c: number) => Math.round((c * 9) / 5 + 32);

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Each thermostat's room, temperature (°F), and humidity, and the house's one
 * number: the thermostat named `pick` (by its own name or its room's, any
 * case), else the average of them all, with `missed` told so. Pure. A thermostat that's offline is left out: Google
 * keeps answering with its last reading, which may be hours old. Anything
 * malformed is skipped, never the whole list.
 */
export function indoorOf(
  devices: Device[],
  at: string,
  pick = "",
  missed: () => void = () => {},
): Indoor | null {
  const read = devices.flatMap((d) => {
    const t = d?.traits;
    if (d?.type !== "sdm.devices.types.THERMOSTAT" || !t) return [];
    if (t["sdm.devices.traits.Connectivity"]?.status === "OFFLINE") return [];
    const celsius = num(t["sdm.devices.traits.Temperature"]?.ambientTemperatureCelsius);
    if (celsius === undefined) return [];
    const humidity = num(t["sdm.devices.traits.Humidity"]?.ambientHumidityPercent);
    const custom = text(t["sdm.devices.traits.Info"]?.customName);
    const parent = text(d.parentRelations?.[0]?.displayName);
    const room = {
      name: custom || parent,
      temp: fahrenheit(celsius),
      ...(humidity !== undefined ? { humidity: Math.round(humidity) } : {}),
    } satisfies Indoor["rooms"][number];
    // Either name can pick it: the thermostat's own, or its room's.
    const names = [custom, parent].filter(Boolean).map((n) => n.toLowerCase());
    return [{ celsius, room, names }];
  });
  if (!read.length) return null;
  const want = pick.trim().toLowerCase();
  const chosen = want ? read.find((r) => r.names.includes(want)) : undefined;
  if (want && !chosen) missed();
  // The chosen room's own reading; else the house's average from the raw
  // readings, rounded once.
  const temp = chosen
    ? chosen.room.temp
    : fahrenheit(read.reduce((s, r) => s + r.celsius, 0) / read.length);
  return { at, temp, rooms: read.map((r) => r.room) };
}

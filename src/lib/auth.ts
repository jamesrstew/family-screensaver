import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { KEYS, store } from "./store";

// One secret, FAMILY_KEY: a few plain words, easy to type on a TV remote.
// A device that knows it gets a cookie derived from it, good for a year.
// Rotating the key signs every device out. Scripts (Siri, Alexa) send it as
// "Authorization: Bearer <key>".

export const COOKIE = "family";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 400; // the browser maximum

/** Without a key, local dev is open and production is locked. */
export function familyKey(): string | null {
  return process.env.FAMILY_KEY?.trim() || null;
}

export const isOpen = () => !familyKey() && process.env.NODE_ENV !== "production";

export function tokenFor(key: string): string {
  return createHmac("sha256", key).update("family-device-v1").digest("base64url");
}

/** Constant-time string comparison (hash both so lengths match). */
export function same(a: string, b: string): boolean {
  const ha = createHmac("sha256", "cmp").update(a).digest();
  const hb = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Keys are typed on remotes and phones: ignore case and spacing. */
export function normalizeKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

export function keyMatches(input: string): boolean {
  const key = familyKey();
  return Boolean(key) && same(normalizeKey(input), normalizeKey(key!));
}

// The key is a few words, so guessing it must stay slow. Each try is
// counted before the key is compared (so a burst can't slip past), for its
// address and for everyone; a right key takes its try back. Past either
// limit, no key is tried until the hour turns. Paired devices (the cookie)
// never notice. One address can't lock the family out; a wide attack can
// only slow pairing, and at a thousand tries an hour the key would still
// take thousands of years to find. Counted in the store, across servers.
// To lift a lock by hand: delete the `family:tries:*` keys in Upstash.
export const TRIES_PER_ADDRESS = 20;
export const TRIES_PER_HOUR = 1000;
const HOUR = 3_600_000;

/** Check a typed or scripted key from `address`, counting the tries. */
export async function tryKey(input: string, address: string): Promise<"ok" | "wrong" | "wait"> {
  const hour = Math.floor(Date.now() / HOUR);
  const keys = [KEYS.tries(hour, address), KEYS.tries(hour, "all")];
  // A store that's down doesn't lock the family out: the key is still the key.
  const [mine, all] = await Promise.all(keys.map((k) => store.bump(k, 3600).catch(() => 0)));
  if (mine > TRIES_PER_ADDRESS || all > TRIES_PER_HOUR) return "wait";
  if (!keyMatches(input)) return "wrong";
  await Promise.all(keys.map((k) => store.bump(k, 3600, -1).catch(() => 0)));
  return "ok";
}

/** Where a request came from, as Vercel reports it. */
export function addressOf(h: Headers): string {
  return (
    h.get("x-real-ip")?.trim() ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  ).slice(0, 64);
}

/** Is this request from the family (a paired device or the key itself)? */
export async function isFamily(): Promise<boolean> {
  if (isOpen()) return true;
  const key = familyKey();
  if (!key) return false;
  const cookie = (await cookies()).get(COOKIE)?.value;
  if (cookie && same(cookie, tokenFor(key))) return true;
  const h = await headers();
  const bearer = h.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  return Boolean(bearer) && (await tryKey(bearer!, addressOf(h))) === "ok";
}

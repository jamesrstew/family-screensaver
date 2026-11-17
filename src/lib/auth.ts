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

// The key is a few words, so guessing it must stay slow: after this many
// wrong keys in an hour, from anyone, no key is even tried until the hour
// turns. Paired devices (the cookie) never notice; only new pairings and
// scripts wait. Counted in the store, so it holds across servers.
export const MISSES_PER_HOUR = 60;
const HOUR = 3_600_000;

/** Check a typed or scripted key, counting the wrong ones. */
export async function tryKey(input: string): Promise<"ok" | "wrong" | "wait"> {
  const hour = Math.floor(Date.now() / HOUR);
  const misses = (await store.get<number>(KEYS.misses(hour)).catch(() => 0)) ?? 0;
  if (misses >= MISSES_PER_HOUR) return "wait";
  if (keyMatches(input)) return "ok";
  await store.bump(KEYS.misses(hour), 3600).catch(() => {});
  return "wrong";
}

/** Is this request from the family (a paired device or the key itself)? */
export async function isFamily(): Promise<boolean> {
  if (isOpen()) return true;
  const key = familyKey();
  if (!key) return false;
  const cookie = (await cookies()).get(COOKIE)?.value;
  if (cookie && same(cookie, tokenFor(key))) return true;
  const auth = (await headers()).get("authorization");
  const bearer = auth?.match(/^Bearer\s+(.+)$/i)?.[1];
  return Boolean(bearer) && (await tryKey(bearer!)) === "ok";
}

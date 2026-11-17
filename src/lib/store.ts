import "server-only";
import { Redis } from "@upstash/redis";

// One small store for the two things that change at runtime: the latest
// show request, and the notebook. Upstash Redis in production (added through
// the Vercel Marketplace, which sets KV_REST_API_*). In local dev without it,
// a process-local map, which is enough for one `next dev`.

type Store = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  /** Add one to a counter that forgets itself after `ttl` seconds; the new count. */
  bump(key: string, ttl: number): Promise<number>;
};

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

function redis(r: Redis): Store {
  return {
    get: (key) => r.get(key),
    set: async (key, value) => {
      await r.set(key, value);
    },
    bump: async (key, ttl) => {
      const n = await r.incr(key);
      if (n === 1) await r.expire(key, ttl);
      return n;
    },
  };
}

function memory(): Store {
  const g = globalThis as {
    __familyStore?: Map<string, unknown>;
    __familyTimers?: Map<string, ReturnType<typeof setTimeout>>;
  };
  const m = (g.__familyStore ??= new Map());
  return {
    get: async <T>(key: string) => (m.get(key) as T | undefined) ?? null,
    set: async (key, value) => {
      m.set(key, value);
    },
    bump: async (key, ttl) => {
      const t = (g.__familyTimers ??= new Map());
      const n = ((m.get(key) as number | undefined) ?? 0) + 1;
      m.set(key, n);
      if (n === 1)
        t.set(
          key,
          setTimeout(() => m.delete(key), ttl * 1000),
        );
      return n;
    },
  };
}

export const hasStore = Boolean(url && token);
export const store: Store = url && token ? redis(new Redis({ url, token })) : memory();

export const KEYS = {
  show: "family:show",
  notebook: "family:notebook",
  /** Wrong family keys this hour, from anyone (see auth.ts). */
  misses: (hour: number) => `family:misses:${hour}`,
} as const;

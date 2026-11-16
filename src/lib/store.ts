import "server-only";
import { Redis } from "@upstash/redis";

// One small store for the two things that change at runtime: the latest
// show request, and the notebook. Upstash Redis in production (added through
// the Vercel Marketplace, which sets KV_REST_API_*). In local dev without it,
// a process-local map, which is enough for one `next dev`.

type Store = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
};

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

function redis(r: Redis): Store {
  return {
    get: (key) => r.get(key),
    set: async (key, value) => {
      await r.set(key, value);
    },
  };
}

function memory(): Store {
  const g = globalThis as { __familyStore?: Map<string, unknown> };
  const m = (g.__familyStore ??= new Map());
  return {
    get: async <T>(key: string) => (m.get(key) as T | undefined) ?? null,
    set: async (key, value) => {
      m.set(key, value);
    },
  };
}

export const hasStore = Boolean(url && token);
export const store: Store = url && token ? redis(new Redis({ url, token })) : memory();

export const KEYS = {
  show: "family:show",
  notebook: "family:notebook",
} as const;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Never the real store: these tests must not count tries in production's Redis.
vi.mock("./store", () => {
  const m = new Map<string, number>();
  return {
    KEYS: { tries: (hour: number, who: string) => `t:${hour}:${who}` },
    store: {
      bump: async (key: string, _ttl: number, by = 1) => {
        const n = (m.get(key) ?? 0) + by;
        m.set(key, n);
        return n;
      },
    },
  };
});
import { TRIES_PER_ADDRESS, addressOf, keyMatches, normalizeKey, tokenFor, tryKey } from "./auth";

afterEach(() => vi.unstubAllEnvs());

describe("family key", () => {
  it("forgives case and spacing from a TV keyboard", () => {
    expect(normalizeKey("  Maple Otter_Lantern-quiet 42 ")).toBe("maple-otter-lantern-quiet-42");
    vi.stubEnv("FAMILY_KEY", "maple-otter-lantern-quiet-42");
    expect(keyMatches("Maple Otter Lantern Quiet 42")).toBe(true);
    expect(keyMatches("maple-otter-lantern-quiet-43")).toBe(false);
  });
  it("never matches when no key is set", () => {
    vi.stubEnv("FAMILY_KEY", "");
    expect(keyMatches("")).toBe(false);
  });
  it("derives a device token that changes with the key", () => {
    expect(tokenFor("a")).toBe(tokenFor("a"));
    expect(tokenFor("a")).not.toBe(tokenFor("b"));
  });
});

describe("guessing the key", () => {
  beforeEach(() => vi.setSystemTime(new Date("2026-11-17T10:15:00Z")));
  afterEach(() => vi.useRealTimers());

  it("lets one address try a few times an hour, then makes it wait", async () => {
    vi.stubEnv("FAMILY_KEY", "maple-otter-lantern-quiet-42");
    for (let i = 0; i < TRIES_PER_ADDRESS; i++) {
      expect(await tryKey("wrong", "10.0.0.1")).toBe("wrong");
    }
    // Even the right key waits now, from that address...
    expect(await tryKey("maple-otter-lantern-quiet-42", "10.0.0.1")).toBe("wait");
    // ...but the family elsewhere isn't locked out.
    expect(await tryKey("maple otter lantern quiet 42", "10.0.0.2")).toBe("ok");
  });

  it("gives a right key its try back, so a script can call all day", async () => {
    vi.stubEnv("FAMILY_KEY", "maple-otter-lantern-quiet-42");
    for (let i = 0; i < TRIES_PER_ADDRESS * 3; i++) {
      expect(await tryKey("maple-otter-lantern-quiet-42", "10.0.0.3")).toBe("ok");
    }
  });

  it("reads the address Vercel reports", () => {
    expect(addressOf(new Headers({ "x-real-ip": "1.2.3.4" }))).toBe("1.2.3.4");
    expect(addressOf(new Headers({ "x-forwarded-for": "5.6.7.8, 9.9.9.9" }))).toBe("5.6.7.8");
    expect(addressOf(new Headers())).toBe("unknown");
  });
});

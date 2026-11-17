import { afterEach, describe, expect, it, vi } from "vitest";
import { MISSES_PER_HOUR, keyMatches, normalizeKey, tokenFor, tryKey } from "./auth";

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
  it("stops trying any key after too many wrong ones in an hour", async () => {
    vi.stubEnv("FAMILY_KEY", "maple-otter-lantern-quiet-42");
    expect(await tryKey("maple otter lantern quiet 42")).toBe("ok");
    for (let i = 0; i < MISSES_PER_HOUR; i++) expect(await tryKey("wrong")).toBe("wrong");
    // Even the right key waits now, so guessing can't go faster than this.
    expect(await tryKey("maple-otter-lantern-quiet-42")).toBe("wait");
  });
});

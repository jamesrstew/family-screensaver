import { afterEach, describe, expect, it, vi } from "vitest";
import { keyMatches, normalizeKey, tokenFor } from "./auth";

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

import { describe, expect, it } from "vitest";
import type { TeamView } from "@/lib/types";
import { refreshMs } from "./useTeam";

describe("refreshMs", () => {
  it("fetches a team's page every minute while a game of theirs is on, else every five", () => {
    const view = { live: null } as unknown as TeamView;
    expect(refreshMs(null)).toBe(5 * 60_000);
    expect(refreshMs(view)).toBe(5 * 60_000);
    expect(refreshMs({ ...view, live: {} } as TeamView)).toBe(60_000);
  });
});

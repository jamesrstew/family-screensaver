import { beforeEach, describe, expect, it, vi } from "vitest";

let family = true;
const calls: unknown[][] = [];
vi.mock("@/lib/auth", () => ({ isFamily: async () => family }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/snapshot", () => ({ household: () => ({ teams: [{ league: "cbb", id: "1" }] }) }));
vi.mock("@/lib/sports", () => ({
  getTeamView: async (...args: unknown[]) => {
    calls.push(["view", ...args]);
    return { name: "Kentucky Wildcats" };
  },
  findTeam: async (...args: unknown[]) => {
    calls.push(["find", ...args]);
    return args[0] === "narnia" ? null : { league: "cbb", id: "96", name: "Kentucky Wildcats" };
  },
}));

const { GET, POST } = await import("./route");
const get = (q: string) => GET(new Request(`http://tv/api/team?${q}`));
const post = (body: unknown) =>
  POST(new Request("http://tv/api/team", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  family = true;
  calls.length = 0;
});

describe("/api/team", () => {
  it("is the family's only", async () => {
    family = false;
    expect((await get("league=cbb&id=96")).status).toBe(401);
    expect((await post({ team: "Kentucky" })).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("shows a team by ESPN league and id only", async () => {
    expect(await (await get("league=cbb&id=96")).json()).toEqual({ name: "Kentucky Wildcats" });
    expect(calls[0]).toEqual(["view", "cbb", "96", expect.any(Date)]);
    expect((await get("league=nba&id=96")).status).toBe(400);
    expect((await get("league=cbb&id=96;drop")).status).toBe(400);
    expect(calls.length).toBe(1);
  });

  it("finds a team as said, with the family's teams, and says when none answers", async () => {
    expect(await (await post({ team: " Kentucky " })).json()).toEqual({
      team: { league: "cbb", id: "96", name: "Kentucky Wildcats" },
    });
    expect(calls[0]).toEqual(["find", "Kentucky", [{ league: "cbb", id: "1" }], expect.any(Date)]);
    expect(await (await post({ team: "narnia" })).json()).toEqual({ team: null });
    expect(await (await post({ nope: 1 })).json()).toEqual({ team: null });
  });

  it("cuts a run-on team to a few words", async () => {
    await post({ team: "kentucky ".repeat(20) });
    expect((calls[0][1] as string).length).toBeLessThanOrEqual(60);
  });
});

import { describe, expect, it } from "vitest";
import { parseQuery, readTeams, resolveTeam, seasonOf, type TeamEntry } from "./team-query";
import type { League } from "./types";

// Made-up ids; real, public team names.
const team = (
  league: League,
  id: string,
  place: string,
  name: string,
  abbr: string,
): TeamEntry => ({
  league,
  id,
  place,
  name,
  full: `${place} ${name}`,
  short: place,
  abbr,
});
const LISTS: TeamEntry[] = [
  team("cfb", "901", "Kentucky", "Wildcats", "UK"),
  team("cbb", "901", "Kentucky", "Wildcats", "UK"),
  team("cbb", "902", "Villanova", "Wildcats", "VILL"),
  team("cfb", "903", "Kansas State", "Wildcats", "KSU"),
  team("cbb", "904", "Gonzaga", "Bulldogs", "GONZ"),
  team("cfb", "905", "Georgia", "Bulldogs", "UGA"),
  team("nfl", "906", "Tampa Bay", "Buccaneers", "TB"),
  team("cbb", "907", "Miami", "Hurricanes", "MIA"),
  team("nfl", "910", "Miami", "Dolphins", "MIA"),
  team("nfl", "908", "Chicago", "Bears", "CHI"),
  team("cfb", "909", "Michigan State", "Spartans", "MSU"),
];
// Wednesday, Nov. 18: football and basketball both on.
const NOW = new Date("2026-11-18T18:00:00Z");
const find = (q: string, family = [] as Array<{ league: League; id: string }>, now = NOW) =>
  resolveTeam(q, LISTS, family, now);

describe("readTeams", () => {
  it("reads ESPN's list, skipping the odd and the inactive", () => {
    const json = {
      sports: [
        {
          leagues: [
            {
              teams: [
                {
                  team: {
                    id: "908",
                    location: "Chicago",
                    name: "Bears",
                    displayName: "Chicago Bears",
                    shortDisplayName: "Bears",
                    abbreviation: "CHI",
                  },
                },
                { team: { id: "x", location: "Nowhere" } },
                { team: { id: "1", location: "Gone", isActive: false } },
              ],
            },
          ],
        },
      ],
    };
    expect(readTeams(json, "nfl")).toEqual([
      {
        league: "nfl",
        id: "908",
        place: "Chicago",
        name: "Bears",
        full: "Chicago Bears",
        short: "Bears",
        abbr: "CHI",
      },
    ]);
    expect(readTeams("nonsense", "nfl")).toEqual([]);
  });
});

describe("parseQuery", () => {
  it("hears the sport, and keeps only the team's words", () => {
    expect(parseQuery("Show Kentucky basketball schedule")).toEqual({
      leagues: ["cbb"],
      team: "kentucky",
    });
    expect(parseQuery("Kentucky football")).toEqual({ leagues: ["cfb", "nfl"], team: "kentucky" });
    expect(parseQuery("the Bucs")).toEqual({ leagues: ["cfb", "cbb", "nfl"], team: "buccaneers" });
    expect(parseQuery("Michigan St.")).toMatchObject({ team: "michigan state" });
  });
});

describe("resolveTeam", () => {
  it("finds a team by place, nickname, full name, or abbreviation, with the sport deciding", () => {
    expect(find("Kentucky basketball")).toEqual({ league: "cbb", id: "901" });
    expect(find("Kentucky football")).toEqual({ league: "cfb", id: "901" });
    expect(find("Bucs")).toEqual({ league: "nfl", id: "906" });
    expect(find("Chicago Bears")).toEqual({ league: "nfl", id: "908" });
    expect(find("the Zags")).toEqual({ league: "cbb", id: "904" });
    expect(find("Michigan St")).toEqual({ league: "cfb", id: "909" });
    expect(find("KSU")).toEqual({ league: "cfb", id: "903" });
  });

  it("prefers the family's team among equals", () => {
    expect(find("Wildcats", [{ league: "cbb", id: "902" }])).toEqual({ league: "cbb", id: "902" });
    expect(find("Bulldogs", [{ league: "cfb", id: "905" }])).toEqual({ league: "cfb", id: "905" });
    expect(find("Miami", [{ league: "nfl", id: "910" }])).toEqual({ league: "nfl", id: "910" });
    expect(find("Miami", [{ league: "cbb", id: "907" }])).toEqual({ league: "cbb", id: "907" });
  });

  it("without the family, prefers the season that's on", () => {
    // In February, basketball's heart: "Kentucky" is the basketball team.
    expect(find("Kentucky", [], new Date("2027-02-10T18:00:00Z"))).toEqual({
      league: "cbb",
      id: "901",
    });
    // In October, football's.
    expect(find("Kentucky", [], new Date("2026-10-10T18:00:00Z"))).toEqual({
      league: "cfb",
      id: "901",
    });
    expect(seasonOf("nfl", new Date("2026-07-01T00:00:00Z"))).toBe(0);
  });

  it("finds nothing rather than guess, and refuses what isn't a few plain words", () => {
    expect(find("Narnia")).toBeNull();
    expect(find("schedule")).toBeNull();
    expect(find("")).toBeNull();
    expect(find("bears</script>")).toBeNull();
    expect(find("x".repeat(61))).toBeNull();
  });
});

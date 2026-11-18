import { describe, expect, it } from "vitest";
import {
  parseQuery,
  readRanked,
  readRefs,
  readTeams,
  resolveTeam,
  seasonOf,
  teamKey,
  type Notable,
  type TeamEntry,
} from "./team-query";
import type { League } from "./types";

// Made-up ids; real, public team names.
const team = (
  league: League,
  id: string,
  place: string,
  name: string,
  abbr: string,
  short = place,
): TeamEntry => ({ league, id, place, name, full: `${place} ${name}`, short, abbr });
const LISTS: TeamEntry[] = [
  team("cfb", "901", "Kentucky", "Wildcats", "UK"),
  team("cbb", "901", "Kentucky", "Wildcats", "UK"),
  team("cbb", "902", "Villanova", "Wildcats", "VILL"),
  team("cfb", "903", "Kansas State", "Wildcats", "KSU", "Kansas St"),
  team("cbb", "904", "Gonzaga", "Bulldogs", "GONZ"),
  team("cfb", "905", "Georgia", "Bulldogs", "UGA"),
  team("nfl", "906", "Tampa Bay", "Buccaneers", "TB", "Buccaneers"),
  team("cbb", "907", "Miami", "Hurricanes", "MIA"),
  team("cfb", "907", "Miami", "Hurricanes", "MIA"),
  team("nfl", "910", "Miami", "Dolphins", "MIA", "Dolphins"),
  team("nfl", "908", "Chicago", "Bears", "CHI", "Bears"),
  team("cfb", "909", "Michigan State", "Spartans", "MSU", "Michigan St"),
  team("cfb", "911", "Texas A&M", "Aggies", "TA&M"),
  team("cfb", "912", "New Mexico State", "Aggies", "NMSU", "New Mexico St"),
  team("cfb", "913", "Texas", "Longhorns", "TEX"),
  team("cfb", "914", "Boston College", "Eagles", "BC"),
  team("cbb", "915", "Boston University", "Terriers", "BU"),
  team("cbb", "916", "Charleston", "Cougars", "COFC", "College of Charleston"),
  team("cfb", "917", "The Citadel", "Bulldogs", "CIT"),
  team("cbb", "918", "Saint Louis", "Billikens", "SLU"),
  team("cbb", "922", "Maine", "Black Bears", "ME"),
];
// Wednesday, Nov. 18: football and basketball both on.
const NOW = new Date("2026-11-18T18:00:00Z");
const DEC = new Date("2026-12-10T18:00:00Z");
const FEB = new Date("2027-02-10T18:00:00Z");
type Fam = Array<{ league: League; id: string }>;
const find = (q: string, family: Fam = [], now = NOW, notable?: Notable) =>
  resolveTeam(q, LISTS, family, now, notable);
const at = (league: League, id: string) => ({ league, id });

describe("readTeams and readRanked", () => {
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

  it("reads the first poll's teams", () => {
    const json = {
      rankings: [
        { ranks: [{ team: { id: "61" } }, { team: { id: "x" } }] },
        { ranks: [{ team: { id: "2" } }] },
      ],
    };
    expect(readRanked(json, "cfb")).toEqual(["cfb:61"]);
    expect(readRanked({}, "cfb")).toEqual([]);
  });
});

describe("parseQuery", () => {
  it("hears the sport, and keeps every run of the words", () => {
    const q = parseQuery("Show Kentucky basketball schedule");
    expect(q.leagues).toEqual(["cbb"]);
    expect(q.spans).toContain("kentucky");
    expect(q.core).toBe("kentucky");
    expect(parseQuery("Kentucky football").leagues).toEqual(["cfb", "nfl"]);
    expect(parseQuery("the Bucs").spans).toContain("buccaneers");
    expect(parseQuery("Michigan St.").spans).toContain("michigan state");
    expect(parseQuery("St. Louis").spans).toContain("saint louis");
  });
});

describe("resolveTeam: names whole", () => {
  it("finds a team by place, nickname, full name, or abbreviation, with the sport deciding", () => {
    expect(find("Kentucky basketball")).toMatchObject(at("cbb", "901"));
    expect(find("Kentucky football")).toMatchObject(at("cfb", "901"));
    expect(find("Bucs")).toMatchObject(at("nfl", "906"));
    expect(find("Chicago Bears")).toMatchObject(at("nfl", "908"));
    expect(find("the Zags")).toMatchObject(at("cbb", "904"));
    expect(find("Michigan St")).toMatchObject(at("cfb", "909"));
    expect(find("KSU")).toMatchObject(at("cfb", "903"));
    expect(find("Kentucky")?.name).toBe("Kentucky Wildcats");
  });

  it("keeps names that hold everyday words", () => {
    expect(find("Texas A&M")).toMatchObject(at("cfb", "911"));
    expect(find("show me the Texas A&M football schedule")).toMatchObject(at("cfb", "911"));
    expect(find("Boston College")).toMatchObject(at("cfb", "914"));
    expect(find("College of Charleston")).toMatchObject(at("cbb", "916"));
    expect(find("the Citadel")).toMatchObject(at("cfb", "917"));
    expect(find("St. Louis basketball")).toMatchObject(at("cbb", "918"));
    expect(find("Texas")).toMatchObject(at("cfb", "913"));
  });

  it("reads an abbreviation only when it's all that names the team", () => {
    expect(find("show me the schedule")).toBeNull();
    expect(find("show me Kentucky")).toMatchObject(at("cfb", "901"));
  });

  it("finds nothing rather than guess, and refuses what isn't a few plain words", () => {
    expect(find("Narnia")).toBeNull();
    expect(find("")).toBeNull();
    expect(find("bears</script>")).toBeNull();
    expect(find("x".repeat(61))).toBeNull();
  });
});

describe("resolveTeam: among equals", () => {
  it("prefers a Top 25 team, then the one whose games trade most", () => {
    const ranked = { ranked: new Set([teamKey(at("cfb", "912"))]), volume: new Map() };
    expect(find("Aggies", [], NOW, ranked)).toMatchObject(at("cfb", "912"));
    const traded = {
      ranked: new Set<string>(),
      volume: new Map([[teamKey(at("cfb", "911")), 50_000]]),
    };
    expect(find("Aggies", [], NOW, traded)).toMatchObject(at("cfb", "911"));
    // A Top 25 team beats the in-season league: Miami in November.
    const miami = { ranked: new Set([teamKey(at("cfb", "907"))]), volume: new Map() };
    expect(find("Miami", [], NOW, miami)).toMatchObject(at("cfb", "907"));
  });

  it("prefers the family's team while its season is on, over another league's", () => {
    // "Miami football" in December: college or pro, the family's decides.
    expect(find("Miami football", [at("cfb", "907")], DEC)).toMatchObject(at("cfb", "907"));
    expect(find("Miami football", [], DEC)).toMatchObject(at("nfl", "910"));
    expect(find("Wildcats", [at("cbb", "902")])).toMatchObject(at("cbb", "902"));
  });

  it("puts the season on before a family team out of season", () => {
    // "The Hurricanes" in February: basketball, though the family follows the football.
    expect(find("the Hurricanes", [at("cfb", "907")], FEB)).toMatchObject(at("cbb", "907"));
    expect(find("the Hurricanes", [at("cfb", "907")], NOW)).toMatchObject(at("cfb", "907"));
  });

  it("without anything else, the season decides, then the name, never the list's order", () => {
    expect(find("Kentucky", [], FEB)).toMatchObject(at("cbb", "901"));
    expect(find("Kentucky", [], new Date("2026-10-10T18:00:00Z"))).toMatchObject(at("cfb", "901"));
    const reversed = resolveTeam("Kentucky", [...LISTS].reverse(), [], FEB);
    expect(reversed).toMatchObject(at("cbb", "901"));
  });
});

describe("seasonOf", () => {
  it("never puts a month in both a season's heart and its ends", () => {
    for (const league of ["cfb", "cbb", "nfl"] as const) {
      for (let m = 1; m <= 12; m++) {
        const v = seasonOf(league, new Date(Date.UTC(2026, m - 1, 15)));
        expect([0, 1, 2]).toContain(v);
      }
    }
    expect(seasonOf("cfb", DEC)).toBe(1);
    expect(seasonOf("nfl", DEC)).toBe(2);
    expect(seasonOf("cbb", FEB)).toBe(2);
    expect(seasonOf("cfb", FEB)).toBe(0);
    expect(seasonOf("nfl", new Date("2026-07-01T00:00:00Z"))).toBe(0);
  });
});

describe("resolveTeam: the last words", () => {
  it("lets the longest name said win, even over a better fit for fewer words", () => {
    // "Saint Mary" is one team's full name; "Saint Mary College" another's place.
    const lists = [
      team("cbb", "31", "Saint", "Mary", "SM"),
      team("cbb", "32", "Saint Mary College", "Gaels", "SMC"),
    ];
    expect(resolveTeam("Saint Mary College", lists, [], NOW)).toMatchObject(at("cbb", "32"));
  });

  it("falls to the top division, then ESPN's lowest id, never the alphabet", () => {
    const aggies = [
      team("cfb", "700", "Delaware Valley", "Aggies", "DV"),
      team("cfb", "300", "Utah State", "Aggies", "USU"),
      team("cfb", "245", "Texas A&M", "Aggies", "TAMU"),
    ];
    const fbs = new Set(["245", "300"]);
    const tier = (t: TeamEntry) => (fbs.has(t.id) ? 2 : 0);
    const none = { ranked: new Set<string>(), volume: new Map<string, number>(), tier };
    expect(resolveTeam("Aggies", aggies, [], NOW, none)).toMatchObject(at("cfb", "245"));
    expect(
      resolveTeam("Aggies", aggies.slice(0, 1).concat(aggies.slice(1).reverse()), [], NOW, none),
    ).toMatchObject(at("cfb", "245"));
    // Nothing known at all: the lowest id.
    expect(resolveTeam("Aggies", aggies, [], NOW)).toMatchObject(at("cfb", "245"));
  });

  it("weighs trading within each league, so pro markets don't win a college tie", () => {
    const lists = [
      team("cfb", "40", "Tennessee", "Volunteers", "TENN"),
      team("nfl", "41", "Tennessee", "Titans", "TEN"),
    ];
    // Shares of each league's busiest: the college team is its league's busiest.
    const volume = new Map([
      [teamKey(at("cfb", "40")), 1],
      [teamKey(at("nfl", "41")), 0.4],
    ]);
    expect(
      resolveTeam("Tennessee football", lists, [], DEC, { ranked: new Set(), volume }),
    ).toMatchObject(at("nfl", "41"));
    expect(
      resolveTeam("Tennessee football", lists, [], NOW, { ranked: new Set(), volume }),
    ).toMatchObject(at("cfb", "40"));
  });
});

describe("readRefs", () => {
  it("reads team ids from core-API links", () => {
    expect(
      readRefs({ items: [{ $ref: "http://x/seasons/2026/teams/245?lang=en" }, { $ref: "nope" }] }),
    ).toEqual(["245"]);
    expect(readRefs({})).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { airLine, airNow, aqiWord, nowcast, ozoneLeads, pmAqi, smokeOf, smokeOver } from "./smoke";

describe("pmAqi", () => {
  it("reads an hour's fine particles on the EPA's 2024 scale", () => {
    expect(pmAqi(0)).toBe(0);
    expect(pmAqi(9)).toBe(50);
    expect(pmAqi(35.4)).toBe(100);
    expect(pmAqi(35.5)).toBe(101);
    expect(pmAqi(55.5)).toBe(151);
    expect(pmAqi(43.7)).toBe(121);
  });
});

describe("aqiWord", () => {
  it("uses the EPA's words", () => {
    expect([50, 51, 101, 151, 201, 301].map(aqiWord)).toEqual([
      "good",
      "moderate",
      "unhealthy for sensitive groups",
      "unhealthy",
      "very unhealthy",
      "hazardous",
    ]);
  });
});

describe("nowcast", () => {
  it("is steady air's plain average", () => {
    expect(nowcast(Array(12).fill(20))).toBe(20);
  });
  it("leans on the latest hours when smoke arrives, but one hour can't carry it", () => {
    // Clean air for 11 hours, then one smoky hour: the weight bottoms out at a half.
    const spike = nowcast([60, ...Array(11).fill(5)])!;
    expect(spike).toBeGreaterThan(30);
    expect(spike).toBeLessThan(35.5);
    // Smoke for three hours running: it shows.
    expect(nowcast([60, 58, 55, ...Array(9).fill(5)])!).toBeGreaterThan(50);
  });
  it("needs two of the three latest hours", () => {
    expect(nowcast([null, null, 20, 20])).toBeNull();
    expect(nowcast([20, null, 20])).toBe(20);
  });
});

describe("the air now", () => {
  it("reads the particles' NowCast, ozone, and PM10, not the lagging blend", () => {
    // Smoke arriving: the 24-hour blend still says 75.
    expect(airNow({ aqi: 75, pm: 43.7 })).toBe(121);
    // Smoke gone: the blend still says 130; the NowCast says clean.
    expect(airNow({ aqi: 130, pm: 5 })).toBe(28);
    expect(airNow({ aqi: 112, pm: 5, ozone: 112, pm10: 20 })).toBe(112);
    // An older report, with only the blend.
    expect(airNow({ aqi: 90 })).toBe(90);
    expect(airNow({})).toBeNull();
  });
  it("names ozone when ozone is what makes the air bad", () => {
    expect(ozoneLeads({ aqi: 112, pm: 5, ozone: 112 })).toBe(true);
    expect(ozoneLeads({ aqi: 160, pm: 70, ozone: 60 })).toBe(false);
    expect(airLine({ aqi: 112, pm: 5, ozone: 112 })).toBe(
      "Ozone unhealthy for sensitive groups, AQI 112: take it easy outside if you’re sensitive.",
    );
  });
  it("speaks only when the air isn't fine for everyone, without repeating itself", () => {
    expect(airLine({ aqi: 80, pm: 20 })).toBeNull();
    expect(airLine({ aqi: 130, pm: 40 })).toBe(
      "Air unhealthy for sensitive groups, AQI 112: take it easy outside if you’re sensitive.",
    );
    expect(airLine({ aqi: 168, pm: 76 })).toBe(
      "Unhealthy air, AQI 165: keep time outside short and easy.",
    );
    expect(airLine({ aqi: 240 })).toBe("Very unhealthy air, AQI 240: best to stay inside.");
  });
});

describe("smokeOf", () => {
  it("reads smoke from the air, and haze from a short view on a dry day", () => {
    expect(smokeOf(null)).toBe("none");
    expect(smokeOf({ pm: 18 })).toBe("haze");
    expect(smokeOf({ pm: 40 })).toBe("smoke");
    expect(smokeOf({ pm: 60 })).toBe("thick");
    expect(smokeOf({ visibility: 5000, code: 0 })).toBe("haze");
    expect(smokeOf({ visibility: 5000, code: 45 })).toBe("none");
  });
});

describe("smokeOver", () => {
  it("takes the worst level that lasts three hours", () => {
    expect(smokeOver([60, 60, 60, 5, 5])).toBe("thick");
    expect(smokeOver([60, 5, 5, 5, 5])).toBe("none");
    expect(smokeOver([40, 40, 20, 20, 5])).toBe("haze");
    expect(smokeOver([null, null])).toBe("none");
    expect(smokeOver([40, 40])).toBe("smoke");
  });
});

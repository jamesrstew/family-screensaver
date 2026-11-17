import { describe, expect, it } from "vitest";
import { shapeAir, withAir, type OpenMeteoAir } from "./air";
import { fakeWeather } from "./weather-fixtures";

const tz = "America/Los_Angeles";
const now = new Date("2026-11-18T10:00:00-08:00");

/** Three days of air, Pacific time, the last day cut short (the forecast ends). */
function air(aqi: (day: number, h: number) => number | null): OpenMeteoAir {
  const time: string[] = [];
  const us_aqi: Array<number | null> = [];
  const pm2_5: Array<number | null> = [];
  for (const [day, date] of ["2026-11-18", "2026-11-19", "2026-11-20"].entries()) {
    for (let h = 0; h < 24; h++) {
      time.push(`${date}T${String(h).padStart(2, "0")}:00`);
      const a = aqi(day, h);
      us_aqi.push(a);
      pm2_5.push(a == null ? null : a / 4);
    }
  }
  return { hourly: { time, us_aqi, pm2_5 }, utc_offset_seconds: -8 * 3600 };
}

describe("withAir", () => {
  const w = fakeWeather("fair", now, tz);
  const bare = {
    ...w,
    now: { ...w.now, aqi: undefined, pm: undefined },
    hours: w.hours.map((h) => ({ ...h, aqi: undefined, pm: undefined })),
    days: w.days.map((d) => ({
      ...d,
      aqi: undefined,
      hourly: d.hourly && { ...d.hourly, aqi: undefined },
    })),
  };

  it("folds the air into now, the hours, and each day it reaches", () => {
    const smoky = withAir(
      bare,
      shapeAir(air((day, h) => (day === 2 && h > 12 ? null : 40 + day * 50 + h))),
    );
    // 10 a.m. on the first day.
    expect(smoky.now.aqi).toBe(50);
    expect(smoky.hours[0]).toMatchObject({ aqi: 50, pm: 13 });
    expect(smoky.hours[5].aqi).toBe(55);
    expect(smoky.days[0].aqi).toBe(63);
    expect(smoky.days[1].aqi).toBe(113);
    expect(smoky.days[2].hourly?.aqi?.[12]).toBe(152);
    // Past the end of the air forecast: nothing, never a guess.
    expect(smoky.days[2].hourly?.aqi?.[13]).toBeNull();
    expect(smoky.days[3].aqi).toBeUndefined();
  });

  it("takes the service's own current reading when it sends one", () => {
    const a = { ...air(() => 30), current: { us_aqi: 77, pm2_5: 21.4 } };
    expect(withAir(bare, shapeAir(a)).now).toMatchObject({ aqi: 77, pm: 21 });
  });

  it("adds nothing when the air forecast is empty", () => {
    const quiet = withAir(bare, shapeAir(air(() => null)));
    expect(quiet.now.aqi).toBeUndefined();
    expect(quiet.days[0]).toEqual(bare.days[0]);
  });
});

describe("shapeAir", () => {
  it("reads now's fine particles as the NowCast over the last 12 hours", () => {
    // Clean all night, then smoke arriving over the last three hours.
    const time = Array.from(
      { length: 24 },
      (_, h) => `2026-08-18T${String(h).padStart(2, "0")}:00`,
    );
    const pm2_5 = time.map((_, h) => (h >= 11 && h <= 13 ? 60 : 5));
    const a = shapeAir({
      current: { time: "2026-08-18T13:15", us_aqi: 40, pm2_5: 60 },
      hourly: { time, us_aqi: time.map(() => 40), pm2_5 },
      utc_offset_seconds: -7 * 3600,
    });
    // Not the hour's 60 (a spike can't alarm alone), but well past the 24-hour mean.
    expect(a.now.pm).toBeGreaterThan(45);
    expect(a.now.pm).toBeLessThan(60);
  });
});

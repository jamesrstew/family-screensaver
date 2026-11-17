import { describe, expect, it } from "vitest";
import { feelOf, heatIndex, windChill } from "./feel";

describe("feelOf", () => {
  it("uses the NWS wind chill in the cold", () => {
    // The NWS chart: 30°F at 15 mph is 19°F; 0°F at 30 mph is -26°F.
    expect(Math.round(windChill(30, 15))).toBe(19);
    expect(Math.round(windChill(0, 30))).toBe(-26);
    expect(feelOf(30, 15)).toBe(19);
    expect(feelOf(30, 2)).toBe(30); // calm: no chill
  });
  it("uses the NWS heat index in the heat", () => {
    // The NWS chart: 96°F at 50% is 108°F; 90°F at 70% is 106°F.
    expect(Math.round(heatIndex(96, 50))).toBe(108);
    expect(Math.round(heatIndex(90, 70))).toBe(106);
    expect(feelOf(96, 5, 50)).toBe(108);
  });
  it("never calls a dry, hot day cool", () => {
    expect(heatIndex(95, 9)).toBeLessThan(95);
    expect(feelOf(95, 12, 9)).toBe(95);
  });
  it("is the thermometer in between", () => {
    expect(feelOf(65, 20, 40)).toBe(65);
    expect(feelOf(79, 5, 90)).toBe(79);
  });
});

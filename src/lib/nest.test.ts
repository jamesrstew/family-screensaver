import { describe, expect, it } from "vitest";
import { indoorOf as read } from "./nest";

const AT = "2026-11-17T18:00:00.000Z";
const indoorOf = (devices: Parameters<typeof read>[0]) => read(devices, AT);

const thermostat = (traits: Record<string, Record<string, unknown>>, room = "Hall") => ({
  type: "sdm.devices.types.THERMOSTAT",
  traits,
  parentRelations: [{ displayName: room }],
});

describe("indoorOf", () => {
  it("reads each thermostat in °F, with humidity", () => {
    const indoor = indoorOf([
      thermostat({
        "sdm.devices.traits.Temperature": { ambientTemperatureCelsius: 20 },
        "sdm.devices.traits.Humidity": { ambientHumidityPercent: 41.4 },
        "sdm.devices.traits.ThermostatHvac": { status: "HEATING" },
        "sdm.devices.traits.ThermostatTemperatureSetpoint": { heatCelsius: 21 },
      }),
      thermostat(
        {
          "sdm.devices.traits.Temperature": { ambientTemperatureCelsius: 22 },
          "sdm.devices.traits.Info": { customName: "Upstairs" },
        },
        "Landing",
      ),
    ]);
    expect(indoor).toEqual({
      at: AT,
      temp: 70,
      rooms: [
        { name: "Hall", temp: 68, humidity: 41 },
        { name: "Upstairs", temp: 72 },
      ],
    });
  });

  it("leaves out other devices and thermostats without a reading", () => {
    expect(
      indoorOf([
        { type: "sdm.devices.types.CAMERA", traits: {} },
        thermostat({ "sdm.devices.traits.Temperature": {} }),
      ]),
    ).toBeNull();
    expect(indoorOf([])).toBeNull();
  });

  it("leaves out a thermostat that's offline, whose reading is stale", () => {
    const reading = (c: number, status: string) => ({
      "sdm.devices.traits.Temperature": { ambientTemperatureCelsius: c },
      "sdm.devices.traits.Connectivity": { status },
    });
    expect(
      indoorOf([thermostat(reading(20, "ONLINE")), thermostat(reading(26, "OFFLINE"), "Loft")]),
    ).toEqual({ at: AT, temp: 68, rooms: [{ name: "Hall", temp: 68 }] });
    expect(indoorOf([thermostat(reading(20, "OFFLINE"))])).toBeNull();
  });

  it("skips a malformed device without losing the others", () => {
    const good = thermostat({
      "sdm.devices.traits.Temperature": { ambientTemperatureCelsius: 20 },
    });
    const odd = [
      null,
      { type: "sdm.devices.types.THERMOSTAT" },
      {
        type: "sdm.devices.types.THERMOSTAT",
        traits: {
          "sdm.devices.traits.Temperature": { ambientTemperatureCelsius: "warm" },
        },
      },
      thermostat(
        {
          "sdm.devices.traits.Temperature": { ambientTemperatureCelsius: 22 },
          "sdm.devices.traits.Info": { customName: { not: "a name" } },
        },
        "Loft",
      ),
    ] as unknown as Parameters<typeof read>[0];
    expect(indoorOf([good, ...odd])).toEqual({
      at: AT,
      temp: 70,
      rooms: [
        { name: "Hall", temp: 68 },
        { name: "Loft", temp: 72 },
      ],
    });
  });

  it("averages the raw readings, rounding once", () => {
    const at = (c: number) =>
      thermostat({ "sdm.devices.traits.Temperature": { ambientTemperatureCelsius: c } });
    // 20.25 °C and 20.3 °C read 68° and 69°, which would round to 69°;
    // together they're 68.5° less a hair, so 68°.
    expect(indoorOf([at(20.25), at(20.3)])?.temp).toBe(68);
  });
});

describe("indoorOf: the one thermostat", () => {
  const at = (c: number, room: string) =>
    thermostat({ "sdm.devices.traits.Temperature": { ambientTemperatureCelsius: c } }, room);
  // Den 20 °C (68°), Loft 22 °C (72°): 70° on average.
  const house = [at(20, "Den"), at(22, "Loft")];

  it("gives the named room's own reading, as one number", () => {
    expect(read(house, AT, "Loft")?.temp).toBe(72);
    expect(read(house, AT, "Den")?.temp).toBe(68);
  });

  it("matches the name in any case, and with stray spaces", () => {
    expect(read(house, AT, "loft")?.temp).toBe(72);
    expect(read(house, AT, "  DEN ")?.temp).toBe(68);
  });

  it("falls back to the house's average when no room is named or none matches", () => {
    expect(read(house, AT)?.temp).toBe(70);
    expect(read(house, AT, "")?.temp).toBe(70);
    expect(read(house, AT, "Attic")?.temp).toBe(70);
  });

  it("keeps every room for the voice, whichever is shown", () => {
    expect(read(house, AT, "Loft")?.rooms.map((r) => r.name)).toEqual(["Den", "Loft"]);
  });

  it("picks a thermostat by its own name or its room's, either one", () => {
    const named = thermostat(
      {
        "sdm.devices.traits.Temperature": { ambientTemperatureCelsius: 22 },
        "sdm.devices.traits.Info": { customName: "Main Thermostat" },
      },
      "Study",
    );
    const other = at(20, "Den");
    expect(read([other, named], AT, "main thermostat")?.temp).toBe(72);
    expect(read([other, named], AT, " STUDY ")?.temp).toBe(72);
  });

  it("says when the name matched no thermostat, and only then", () => {
    let misses = 0;
    const missed = () => misses++;
    expect(read(house, AT, "Attic", missed)?.temp).toBe(70);
    expect(misses).toBe(1);
    read(house, AT, "Loft", missed);
    read(house, AT, "", missed);
    expect(misses).toBe(1);
  });
});

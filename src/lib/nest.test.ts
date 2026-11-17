import { describe, expect, it } from "vitest";
import { indoorOf } from "./nest";

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
    ).toEqual({ temp: 68, rooms: [{ name: "Hall", temp: 68 }] });
    expect(indoorOf([thermostat(reading(20, "OFFLINE"))])).toBeNull();
  });
});

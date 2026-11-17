import { describe, expect, it } from "vitest";
import { indoorOf } from "./nest";

const thermostat = (traits: Record<string, Record<string, unknown>>, room = "Hall") => ({
  type: "sdm.devices.types.THERMOSTAT",
  traits,
  parentRelations: [{ displayName: room }],
});

describe("indoorOf", () => {
  it("reads each thermostat in °F, with humidity, what it's doing, and its setpoints", () => {
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
        { name: "Hall", temp: 68, humidity: 41, hvac: "heating", heatTo: 70 },
        { name: "Upstairs", temp: 72, hvac: "off" },
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
});

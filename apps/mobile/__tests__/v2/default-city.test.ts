/** Home default city (Settings, saved on this phone): which city the Home opens on. */
import { DEFAULT_CITY_ALL, DEFAULT_CITY_AUTO, resolveDefaultCity } from "../../lib/v2/default-city";

jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));

describe("resolveDefaultCity", () => {
  it("automatic: Quito when it has events, otherwise all cities", () => {
    expect(resolveDefaultCity(DEFAULT_CITY_AUTO, ["Guayaquil", "Quito"])).toBe("Quito");
    expect(resolveDefaultCity(DEFAULT_CITY_AUTO, ["Guayaquil"])).toBeNull();
  });
  it("all cities and a saved city", () => {
    expect(resolveDefaultCity(DEFAULT_CITY_ALL, ["Quito"])).toBeNull();
    expect(resolveDefaultCity("Guayaquil", ["Guayaquil", "Quito"])).toBe("Guayaquil");
  });
  it("a saved city with no events now falls back to automatic", () => {
    expect(resolveDefaultCity("Cuenca", ["Guayaquil", "Quito"])).toBe("Quito");
    expect(resolveDefaultCity("Cuenca", ["Guayaquil"])).toBeNull();
  });
});

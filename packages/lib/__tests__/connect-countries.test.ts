import { describe, it, expect } from "vitest";
import {
  STRIPE_CONNECT_COUNTRIES,
  DEFAULT_CONNECT_COUNTRY,
  CONNECT_COUNTRY_NOT_LISTED,
  isSupportedConnectCountry,
  getConnectCountryDefaultCurrency,
  toConnectOnboardCountry,
} from "../src";

describe("Stripe Connect countries", () => {
  it("default country is part of the supported list", () => {
    expect(isSupportedConnectCountry(DEFAULT_CONNECT_COUNTRY)).toBe(true);
  });

  it("uses uppercase ISO alpha-2 codes with non-empty names", () => {
    for (const c of STRIPE_CONNECT_COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z]{2}$/);
      expect(c.name.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate country codes", () => {
    const codes = STRIPE_CONNECT_COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("every country has a lowercase ISO 4217 currency", () => {
    for (const c of STRIPE_CONNECT_COUNTRIES) {
      expect(c.currency).toMatch(/^[a-z]{3}$/);
    }
  });

  describe("getConnectCountryDefaultCurrency", () => {
    it("returns the local settlement currency (case-insensitive)", () => {
      expect(getConnectCountryDefaultCurrency("EC")).toBe("usd");
      expect(getConnectCountryDefaultCurrency("ec")).toBe("usd");
      expect(getConnectCountryDefaultCurrency("MX")).toBe("mxn");
      expect(getConnectCountryDefaultCurrency("US")).toBe("usd");
    });

    it("returns undefined for unknown / empty / nullish codes", () => {
      expect(getConnectCountryDefaultCurrency("ZZ")).toBeUndefined();
      expect(getConnectCountryDefaultCurrency("")).toBeUndefined();
      expect(getConnectCountryDefaultCurrency(null)).toBeUndefined();
      expect(getConnectCountryDefaultCurrency(undefined)).toBeUndefined();
    });
  });

  describe("isSupportedConnectCountry", () => {
    it("accepts supported codes case-insensitively", () => {
      expect(isSupportedConnectCountry("EC")).toBe(true);
      expect(isSupportedConnectCountry("ec")).toBe(true);
      expect(isSupportedConnectCountry("MX")).toBe(true);
    });

    it("rejects unsupported / empty / nullish codes", () => {
      expect(isSupportedConnectCountry("ZZ")).toBe(false);
      expect(isSupportedConnectCountry("")).toBe(false);
      expect(isSupportedConnectCountry(null)).toBe(false);
      expect(isSupportedConnectCountry(undefined)).toBe(false);
    });

    it("includes Mexico as a supported recipient/transfers-only market", () => {
      // Mexico was enabled for the recipient service agreement on our platform
      // (Jul 2026), so it is onboarded like any other recipient country.
      expect(isSupportedConnectCountry("MX")).toBe(true);
      expect(getConnectCountryDefaultCurrency("MX")).toBe("mxn");
    });
  });

  describe("toConnectOnboardCountry", () => {
    it("passes listed country codes through", () => {
      expect(toConnectOnboardCountry("EC")).toBe("EC");
      expect(toConnectOnboardCountry("MX")).toBe("MX");
    });

    it("omits the country when it isn't listed so Stripe asks for it", () => {
      expect(toConnectOnboardCountry(CONNECT_COUNTRY_NOT_LISTED)).toBeUndefined();
      expect(toConnectOnboardCountry("")).toBeUndefined();
      expect(toConnectOnboardCountry(null)).toBeUndefined();
      expect(toConnectOnboardCountry(undefined)).toBeUndefined();
    });

    it("the not-listed sentinel is never a supported country code", () => {
      expect(isSupportedConnectCountry(CONNECT_COUNTRY_NOT_LISTED)).toBe(false);
    });
  });
});

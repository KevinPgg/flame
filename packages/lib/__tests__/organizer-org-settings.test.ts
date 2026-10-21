import { describe, it, expect } from "vitest";
import {
  orgFormFrom,
  normalizeInstagram,
  validateOrgForm,
  orgFormPayload,
  orgFormDirty,
  orgImageStoragePath,
  logoFileProblem,
  logoDimensionProblem,
  logoTargetSize,
} from "../src";

describe("org settings form", () => {
  it("loads nulls as empty strings", () => {
    expect(orgFormFrom({ instagram_handle: null, city: "Quito", description: undefined })).toEqual({ instagram: "", city: "Quito", description: "" });
    expect(orgFormFrom(null)).toEqual({ instagram: "", city: "", description: "" });
  });

  it("accepts @handles and pasted Instagram links", () => {
    expect(normalizeInstagram(" @@kora.gye ")).toBe("kora.gye");
    expect(normalizeInstagram("https://www.instagram.com/kora_gye/?igsh=abc")).toBe("kora_gye");
    expect(normalizeInstagram("instagram.com/kora")).toBe("kora");
  });

  it("validates instagram characters and lengths", () => {
    expect(validateOrgForm({ instagram: "kora gye", city: "", description: "" })).toEqual({ instagram: "instagram" });
    expect(validateOrgForm({ instagram: "a".repeat(31), city: "", description: "" })).toEqual({ instagram: "instagram" });
    expect(validateOrgForm({ instagram: "", city: "x".repeat(101), description: "y".repeat(501) })).toEqual({ city: "tooLong", description: "tooLong" });
    expect(validateOrgForm({ instagram: "@kora", city: "Guayaquil", description: "Hi" })).toEqual({});
  });

  it("payload trims, strips @ and sends null for empty; dirty compares stored form", () => {
    expect(orgFormPayload({ instagram: "@kora ", city: "  ", description: " Hola " })).toEqual({ instagram_handle: "kora", city: null, description: "Hola" });
    const saved = { instagram: "kora", city: "Quito", description: "" };
    expect(orgFormDirty(saved, { instagram: "@kora", city: "Quito ", description: "  " })).toBe(false);
    expect(orgFormDirty(saved, { ...saved, city: "Cuenca" })).toBe(true);
  });

  it("storage path from the logo URL (only our bucket)", () => {
    expect(orgImageStoragePath("https://x.supabase.co/storage/v1/object/public/organization-images/organizations/kora/logo-1760000000000.png")).toBe(
      "organizations/kora/logo-1760000000000.png"
    );
    expect(orgImageStoragePath("https://img.example.com/logo.png")).toBeNull();
    expect(orgImageStoragePath("not a url")).toBeNull();
  });

  it("logo file checks mirror the upload API", () => {
    expect(logoFileProblem({ size: 1000, type: "image/png" })).toBeNull();
    expect(logoFileProblem({ size: 1000, type: "image/svg+xml" })).toBe("type");
    expect(logoFileProblem({ size: 5 * 1024 * 1024, type: "image/jpeg" })).toBe("size");
  });
});

describe("logo dimensions", () => {
  it("at least 400 px per side; bigger is fine (it gets scaled down), never upscaled", () => {
    expect(logoDimensionProblem(399, 800)).toBe("tooSmall");
    expect(logoDimensionProblem(400, 400)).toBeNull();
    expect(logoDimensionProblem(740, 740)).toBeNull();
    expect(logoTargetSize(740, 740)).toEqual({ width: 740, height: 740 });
    expect(logoTargetSize(4000, 2000)).toEqual({ width: 1024, height: 512 });
    expect(logoTargetSize(500, 3000)).toEqual({ width: 400, height: 2400 }); // short side wins over the max
    expect(logoTargetSize(1000, 3000)).toEqual({ width: 400, height: 1200 });
  });
});

/** "Paste a list" of promoters (2026-11-02): names → unique codes, as in the prototype. */
import { describe, it, expect } from "vitest";
import { parsePromoterNames, promoterCodeFor, buildPromoterBatch } from "../src/organizer/event-detail";

describe("parsePromoterNames", () => {
  it("splits by lines, commas and semicolons; strips list markers; drops repeats and 1-letter entries", () => {
    const text = "1. David Camacho\n2) Juan  León, Alejandra Pérez;\n- david camacho\n• Ana\n* x\n\n";
    expect(parsePromoterNames(text)).toEqual(["David Camacho", "Juan León", "Alejandra Pérez", "Ana"]);
  });
  it("returns [] for blank input", () => {
    expect(parsePromoterNames("  \n , ;")).toEqual([]);
  });
});

describe("promoterCodeFor", () => {
  it("first word + initial of the second, without accents", () => {
    expect(promoterCodeFor("Juan León", new Set())).toBe("JUANL");
    expect(promoterCodeFor("Ángela Ñuñez", new Set())).toBe("ANGELAN");
  });
  it("pads short names and numbers clashes", () => {
    const taken = new Set(["DAVIDC"]);
    expect(promoterCodeFor("Al", taken)).toBe("ALX");
    expect(promoterCodeFor("David Camacho", taken)).toBe("DAVIDC2");
    expect(promoterCodeFor("David Cedeño", taken)).toBe("DAVIDC3");
  });
  it("falls back to PROMO when the name has no letters", () => {
    expect(promoterCodeFor("123", new Set())).toBe("PROMO");
  });
  it("always produces a valid promoter code (3–50, A–Z 0–9)", () => {
    const code = promoterCodeFor("Maximilianoalejandrodelacruzsantamariadelosangeles Pérez", new Set());
    expect(code).toMatch(/^[A-Z0-9]{3,50}$/);
  });
});

describe("buildPromoterBatch", () => {
  it("avoids the event's existing codes (any case) and repeats inside the batch", () => {
    expect(buildPromoterBatch(["David Camacho", "David Castro"], ["davidc"])).toEqual([
      { name: "David Camacho", code: "DAVIDC2" },
      { name: "David Castro", code: "DAVIDC3" },
    ]);
  });
});

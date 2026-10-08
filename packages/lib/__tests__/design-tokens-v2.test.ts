import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import { flameV2Colors, flameV2Radii } from "../src/design-tokens/flame-v2";

// The Tailwind preset is CommonJS; load it the same way the apps do.
const require = createRequire(import.meta.url);
const preset = require("../../ui/tailwind.config.js");
const { colors, borderRadius } = preset.theme.extend;

describe("Flame 2.0 design tokens", () => {
  it("Tailwind v2-* colors match flame-v2.ts exactly", () => {
    const fromTailwind = Object.fromEntries(
      Object.entries(colors as Record<string, string>)
        .filter(([k]) => k.startsWith("v2-"))
        .map(([k, v]) => [k.slice(3), v])
    );
    expect(fromTailwind).toEqual(flameV2Colors);
  });

  it("Tailwind v2-* radii match flame-v2.ts exactly", () => {
    const fromTailwind = Object.fromEntries(
      Object.entries(borderRadius as Record<string, string>)
        .filter(([k]) => k.startsWith("v2-"))
        .map(([k, v]) => [k.slice(3), Number.parseInt(v, 10)])
    );
    expect(fromTailwind).toEqual(flameV2Radii);
  });

  it("does not change the v1 tokens", () => {
    expect(colors.background).toBe("#000B12");
    expect(colors.primary).toBe("#FF0000");
    expect(borderRadius.card).toBe("16px");
  });
});

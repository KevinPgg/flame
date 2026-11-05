/**
 * Stripe metadata validators.
 *
 * Stripe returns every metadata value as a string, and several of ours carry
 * money that downstream code either persists as revenue or uses to authorise a
 * capture. Parsing those with `parseInt` is unsafe: it accepts `"100abc"` as
 * `100` and `"12.9"` as `12`, so a malformed value becomes a plausible-looking
 * number instead of an error. `Number.isFinite` additionally admits values past
 * `Number.MAX_SAFE_INTEGER`, where integer arithmetic silently loses precision.
 *
 * Introduced by W7-H6 (Sep 2026) — see docs/fixes/SEPTEMBER_2026_FIXES.md #3.
 */

/**
 * Strictly parse a Stripe metadata value that must represent a non-negative
 * amount in cents.
 *
 * Accepts digits only, and only within safe-integer range. Returns `null` for
 * anything else — including `undefined`/`null`, empty strings, whitespace,
 * decimals, signs, exponent notation and trailing garbage.
 *
 * Callers MUST distinguish "absent" from "invalid" themselves: an absent key is
 * usually a legacy record worth falling back for, whereas a present-but-invalid
 * value is corrupt money data and should be surfaced, not silently ignored.
 * Use {@link isPresentMetadataValue} for that check.
 */
export function parseMetadataCents(
  value: string | null | undefined,
): number | null {
  if (typeof value !== "string") return null;
  if (!/^\d+$/.test(value)) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * True when a Stripe metadata key was actually supplied, regardless of whether
 * its contents are valid. Lets callers tell a legacy record (key absent) apart
 * from corrupt data (key present, unparseable).
 */
export function isPresentMetadataValue(
  value: string | null | undefined,
): value is string {
  return typeof value === "string";
}

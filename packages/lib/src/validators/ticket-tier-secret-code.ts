/**
 * Ticket tier purchase secret ("access code") normalization.
 *
 * All tiers store and compare this value in UPPERCASE (trimmed) across web, mobile, and APIs.
 */

export function normalizeTicketTierSecretCode(input: string): string {
  return input.trim().toUpperCase();
}

/** Returns null when empty after trim; otherwise trimmed uppercase. */
export function normalizeOptionalTicketTierSecretCode(
  input: string | null | undefined,
): string | null {
  if (input == null) return null;
  const n = normalizeTicketTierSecretCode(input);
  return n.length === 0 ? null : n;
}

/**
 * Pricing Constants for Flame Ticketing
 *
 * ACTIVE model (Stripe Connect, Jan 2026+):
 * - Organizer sets their desired ticket price (what they want to receive)
 * - Flame adds a platform fee (10% + $0.99 per ticket, paid by buyer)
 * - Fee calculation lives in apps/web/app/lib/stripe/fees.ts → calculateFee()
 *
 * @legacy — The constants below (FLAME_MARKUP_PERCENT, ECUADOR_IVA_RATE) are
 * from the pre-Stripe/Datafast era and are ONLY used for reverse-calculating
 * base prices from historical orders. Do NOT use them for new features.
 */

// @legacy — Old markup percentage (pre-Stripe). Used only by extractBasePriceHistorical().
export const FLAME_MARKUP_PERCENT = 7; // Changed from 10 to 7 (Nov 2025)

// @legacy — Ecuador IVA is no longer applied since Stripe Connect migration (Jan 2026).
// Kept for backwards-compatible price extraction from pre-Stripe orders.
export const ECUADOR_IVA_RATE = 0.15;

// Historical markup rates for extracting base prices from old purchases
export const MARKUP_HISTORY = {
  LEGACY_10_PERCENT: 10, // Used before Nov 8, 2025
  CURRENT_7_PERCENT: 7, // Used from Nov 8, 2025 onwards
  MIGRATION_DATE: new Date("2025-11-08T00:00:00Z"), // All Nov 7 orders use 10%, Nov 8+ use 7%
} as const;

// Stripe Connect migration date - after this date, ticket_tiers.price_cents stores BASE price directly
// Before this date, price_cents stored total price (base + fees) and needs extraction
export const STRIPE_CONNECT_MIGRATION_DATE = new Date("2026-01-15T00:00:00Z");

// Default platform fees for Stripe Connect "Guaranteed Net" model
// Changed from 12.5% + $0.30 to 10% + $0.99 (Mar 2026 — lower % to be more competitive, higher fixed to maintain revenue)
export const DEFAULT_PLATFORM_FEE_PERCENT = 10;
export const DEFAULT_FIXED_FEE_CENTS = 99;

// Fixed fee (in minor units) per supported currency — ~$0.99 USD equivalent.
// Mirrors Stripe's own per-currency fixed fee structure.
// USD/EUR are close enough that 99 minor units works. GBP is slightly adjusted.
// MXN, DOP, COP have significantly lower purchasing power and need higher raw values.
export const DEFAULT_FIXED_FEE_BY_CURRENCY: Record<string, number> = {
  USD: 99,
  EUR: 99,
  GBP: 75,
  MXN: 1800,
  DOP: 6000,
  COP: 420000,
};

export function getDefaultFixedFeeCents(currency: string): number {
  return DEFAULT_FIXED_FEE_BY_CURRENCY[currency.toUpperCase()] ?? DEFAULT_FIXED_FEE_CENTS;
}

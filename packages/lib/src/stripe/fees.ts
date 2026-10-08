/**
 * Stripe Fee Calculations
 *
 * Pure functions for calculating platform fees using the "Guaranteed Net" formula.
 * These functions are server-side utilities for fee calculation and should not be
 * used in client-side/web/mobile code. Fee calculations must always happen on the
 * server to prevent manipulation.
 */

import {
  DEFAULT_PLATFORM_FEE_PERCENT,
  DEFAULT_FIXED_FEE_CENTS,
} from "../pricing/constants";

export interface FeeCalculation {
  basePriceCents: number;
  platformFeePercent: number;
  platformFixedFeeCents: number;
  platformFeeCents: number;
  totalAmountCents: number;
}

export interface MarkupSettings {
  percent: number;
  fixedCents: number;
}

/**
 * Calculates the total charge and platform fee based on the "Guaranteed Net" formula.
 * Total Charge = Base Price + (Base Price * (Markup Percent / 100)) + Fixed Fee
 *
 * @param basePriceCents - The amount the organizer receives
 * @param feePercent - The percentage markup (e.g. 12.5)
 * @param fixedFeeCents - The fixed markup in cents (e.g. 30)
 */
export function calculateFee(
  basePriceCents: number,
  feePercent: number = DEFAULT_PLATFORM_FEE_PERCENT,
  fixedFeeCents: number = DEFAULT_FIXED_FEE_CENTS
): FeeCalculation {
  // Input validation
  if (typeof basePriceCents !== "number" || !Number.isFinite(basePriceCents)) {
    throw new TypeError(
      `basePriceCents must be a finite number, got: ${basePriceCents}`
    );
  }
  if (basePriceCents < 0) {
    throw new RangeError(
      `basePriceCents must be non-negative, got: ${basePriceCents}`
    );
  }

  if (typeof feePercent !== "number" || !Number.isFinite(feePercent)) {
    throw new TypeError(
      `feePercent must be a finite number, got: ${feePercent}`
    );
  }
  if (feePercent < 0) {
    throw new RangeError(`feePercent must be non-negative, got: ${feePercent}`);
  }

  if (typeof fixedFeeCents !== "number" || !Number.isFinite(fixedFeeCents)) {
    throw new TypeError(
      `fixedFeeCents must be a finite number, got: ${fixedFeeCents}`
    );
  }
  if (fixedFeeCents < 0) {
    throw new RangeError(
      `fixedFeeCents must be a non-negative finite number, got: ${fixedFeeCents}`
    );
  }

  // Coerce basePriceCents to integer
  const basePriceCentsInt = Math.round(basePriceCents);
  // Normalize fixedFeeCents to integer cents
  const fixedFeeCentsInt = Math.round(fixedFeeCents);

  // Formula: Total = Base + (Base * Percent/100) + Fixed
  const feeMultiplier = feePercent / 100;
  const percentageFee = basePriceCentsInt * feeMultiplier;

  const rawFee = percentageFee + fixedFeeCentsInt;
  const platformFeeCents = Math.round(rawFee);

  const totalAmountCents = basePriceCentsInt + platformFeeCents;

  return {
    basePriceCents: basePriceCentsInt,
    platformFeePercent: feePercent,
    platformFixedFeeCents: fixedFeeCentsInt,
    platformFeeCents,
    totalAmountCents,
  };
}

/**
 * Calculate unit price for a ticket purchase
 * Uses stage pricing if available, otherwise falls back to tier base price
 */
export function calculateUnitPrice(
  mode: "rsvp" | "hold" | null,
  rsvpDetails: {
    stage_price_cents?: number | null;
    ticket_tier?: { price_cents: number };
  } | null,
  holdDetails: {
    stage_price_cents?: number | null;
    ticket_tier?: { price_cents: number };
  } | null,
  ticketTier?: { price_cents: number }
): number {
  if (!mode) return 0;

  if (mode === "rsvp" && rsvpDetails?.stage_price_cents != null) {
    return rsvpDetails.stage_price_cents;
  }
  if (mode === "hold" && holdDetails?.stage_price_cents != null) {
    return holdDetails.stage_price_cents;
  }

  const tier =
    mode === "rsvp" ? rsvpDetails?.ticket_tier : holdDetails?.ticket_tier;
  return tier?.price_cents ?? ticketTier?.price_cents ?? 0;
}

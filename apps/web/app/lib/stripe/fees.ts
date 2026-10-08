import { supabaseAdmin } from "@/app/lib/supabase/server";
import { getDefaultFixedFeeCents } from "@project-flame/lib";

// NOTE: This default must match the database column default (events.markup_percent / events.markup_fixed_cents).
// Changed from 12.5% + $0.30 to 10% + $0.99 (Mar 2026)
export const DEFAULT_PLATFORM_FEE_PERCENT = 10;
export const DEFAULT_FIXED_FEE_CENTS = 99;

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
 * Fetches the markup settings for a given event.
 * Falls back to currency-aware defaults if not set.
 * @param currency - ISO 4217 currency code, used for fallback fixed fee when DB value is null.
 */
export async function getEventMarkup(eventId: string, currency = "USD"): Promise<MarkupSettings> {
  const fallbackFixed = getDefaultFixedFeeCents(currency);

  if (!supabaseAdmin) {
    console.error("Supabase admin client not initialized in getEventMarkup");
    return {
      percent: DEFAULT_PLATFORM_FEE_PERCENT,
      fixedCents: fallbackFixed,
    };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("events")
      .select("markup_percent, markup_fixed_cents")
      .eq("id", eventId)
      .single();

    if (error) {
      console.error(`Error fetching markup for event ${eventId}:`, error);
      return {
        percent: DEFAULT_PLATFORM_FEE_PERCENT,
        fixedCents: fallbackFixed,
      };
    }

    if (!data) {
      return {
        percent: DEFAULT_PLATFORM_FEE_PERCENT,
        fixedCents: fallbackFixed,
      };
    }

    let percent = DEFAULT_PLATFORM_FEE_PERCENT;
    if (data.markup_percent !== null) {
      const parsedPercent = Number(data.markup_percent);
      if (Number.isFinite(parsedPercent) && parsedPercent >= 0) {
        percent = parsedPercent;
      } else if (parsedPercent < 0) {
        console.warn(`Negative markup_percent detected for event ${eventId}: ${parsedPercent}. Using default.`);
      }
    }

    let fixedCents = fallbackFixed;
    if (data.markup_fixed_cents !== null) {
      const parsedFixed = Number(data.markup_fixed_cents);
      if (Number.isFinite(parsedFixed) && parsedFixed >= 0) {
        fixedCents = parsedFixed;
      } else if (parsedFixed < 0) {
        console.warn(`Negative markup_fixed_cents detected for event ${eventId}: ${parsedFixed}. Using default.`);
      }
    }

    return { percent, fixedCents };
  } catch (err) {
    console.error(`Exception fetching markup for event ${eventId}:`, err);
    return {
      percent: DEFAULT_PLATFORM_FEE_PERCENT,
      fixedCents: fallbackFixed,
    };
  }
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
  // Normalize fixedFeeCents to integer cents to ensure consistency
  // Cents must be integers (2 decimal places in dollars = integer cents)
  // Math.round() handles floating-point precision issues and ensures integer result
  const fixedFeeCentsInt = Math.round(fixedFeeCents);

  // Formula: Total = Base + (Base * Percent/100) + Fixed
  const feeMultiplier = feePercent / 100;
  const percentageFee = basePriceCentsInt * feeMultiplier;

  // Calculate total fee (percentage part + fixed part)
  // Round the percentage part before adding fixed?
  // Standard practice: Calculate total fee amount, then round.
  // Or: Base + Round(Base * %) + Fixed.
  // The goal is "Guaranteed Net" implies Base is exact.
  // Markup = Round(Base * %) + Fixed ?
  // Let's use: Markup = (Base * %) + Fixed.

  const rawFee = percentageFee + fixedFeeCentsInt;
  const platformFeeCents = Math.round(rawFee); // Round total fee to nearest cent

  // Total amount
  const totalAmountCents = basePriceCentsInt + platformFeeCents;

  return {
    basePriceCents: basePriceCentsInt,
    platformFeePercent: feePercent,
    platformFixedFeeCents: fixedFeeCentsInt,
    platformFeeCents,
    totalAmountCents,
  };
}

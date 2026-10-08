/**
 * Pricing Calculations for Flame Ticketing
 *
 * @legacy — This entire module is from the pre-Stripe/Datafast era (before Jan 2026).
 * It handles IVA (Ecuador VAT) which is NO LONGER applied to new purchases.
 *
 * Active fee calculation for new purchases lives in:
 *   apps/web/app/lib/stripe/fees.ts → calculateFee()
 *
 * These functions are kept ONLY for:
 * - Reverse-calculating base prices from historical (pre-Stripe) orders
 * - Email receipt display for old orders that included IVA
 *
 * Do NOT use calculateFinalPrice(), extractBasePrice(), or PriceBreakdown
 * for any new feature work. Use calculateFee() from stripe/fees.ts instead.
 */

import {
  FLAME_MARKUP_PERCENT,
  ECUADOR_IVA_RATE,
  MARKUP_HISTORY,
  STRIPE_CONNECT_MIGRATION_DATE,
} from "./constants";

export interface PriceBreakdown {
  basePrice: number; // What organizer receives
  serviceFee: number; // Flame's commission
  iva: number; // 15% tax on service fee
  finalPrice: number; // What customer pays (sum of all)
  basePriceCents: number; // basePrice in cents
  serviceFeeCents: number; // serviceFee in cents
  ivaCents: number; // iva in cents
  finalPriceCents: number; // finalPrice in cents
}

/**
 * Calculate the final customer price from organizer's base price
 *
 * @param basePriceDollars - The price the organizer wants to receive (in dollars)
 * @returns Breakdown of all price components
 *
 * @example
 * const breakdown = calculateFinalPrice(100);
 * // Returns:
 * // {
 * //   basePrice: 100.00,
 * //   serviceFee: 7.00,
 * //   iva: 1.05,
 * //   finalPrice: 108.05,
 * //   ...
 * // }
 */
export function calculateFinalPrice(basePriceDollars: number): PriceBreakdown {
  if (!Number.isFinite(basePriceDollars)) {
    throw new Error("Base price must be a non-negative finite number");
  }
  if (basePriceDollars < 0) {
    throw new Error("Base price must be a non-negative finite number");
  }
  const basePriceCents = Math.round(basePriceDollars * 100);
  const serviceFeeCents = Math.round(
    (basePriceCents * FLAME_MARKUP_PERCENT) / 100
  );
  const ivaCents = Math.round(serviceFeeCents * ECUADOR_IVA_RATE);
  const finalPriceCents = basePriceCents + serviceFeeCents + ivaCents;

  return {
    basePrice: +(basePriceCents / 100).toFixed(2),
    serviceFee: +(serviceFeeCents / 100).toFixed(2),
    iva: +(ivaCents / 100).toFixed(2),
    finalPrice: +(finalPriceCents / 100).toFixed(2),
    basePriceCents,
    serviceFeeCents,
    ivaCents,
    finalPriceCents,
  };
}

/**
 * Extract the organizer's base price from the final customer price using a specific markup rate
 * (Internal function - use extractBasePrice or extractBasePriceHistorical instead)
 */
function extractBasePriceWithMarkup(
  finalPriceCents: number,
  markupPercent: number
): PriceBreakdown {
  if (!Number.isFinite(finalPriceCents)) {
    throw new Error("Final price must be a finite number");
  }
  const totalCents = Math.max(0, Math.round(finalPriceCents));

  // total = base + (base*m) + (base*m*iva) = base * (1 + m + m*iva)
  const m = markupPercent / 100;
  const divisor = 1 + m + m * ECUADOR_IVA_RATE;

  let baseCents = Math.round(totalCents / divisor);
  let feeCents = Math.round((baseCents * markupPercent) / 100);
  let ivaCents = Math.round(feeCents * ECUADOR_IVA_RATE);

  // Reconcile rounding so parts sum to total
  let remainder = totalCents - (baseCents + feeCents + ivaCents);

  // Check if BASE0 is a round dollar amount or almost round
  const centsRemainder = baseCents % 100;
  const baseIsRoundDollar = centsRemainder === 0;
  const baseIsAlmostRoundDollar = centsRemainder >= 97 || centsRemainder <= 3;

  // If BASE0 is almost a round dollar, try rounding it
  if (baseIsAlmostRoundDollar) {
    const adjustment =
      centsRemainder >= 97 ? 100 - centsRemainder : -centsRemainder;

    const roundedBaseCents = baseCents + adjustment;
    const roundedFeeCents = Math.round(
      (roundedBaseCents * markupPercent) / 100
    );
    const roundedIvaCents = Math.round(roundedFeeCents * ECUADOR_IVA_RATE);
    const roundedTotal = roundedBaseCents + roundedFeeCents + roundedIvaCents;
    const roundedRemainder = totalCents - roundedTotal;

    if (Math.abs(roundedRemainder) <= 3) {
      baseCents = roundedBaseCents;
      feeCents = roundedFeeCents;
      ivaCents = roundedIvaCents;
      remainder = roundedRemainder;
    }
  }

  if (remainder !== 0) {
    if (
      (baseIsRoundDollar || baseIsAlmostRoundDollar) &&
      Math.abs(remainder) <= 3
    ) {
      const recalculatedIvaCents = Math.round(feeCents * ECUADOR_IVA_RATE);
      const newTotal = baseCents + feeCents + recalculatedIvaCents;
      const newRemainder = totalCents - newTotal;

      if (Math.abs(newRemainder) <= Math.abs(remainder)) {
        ivaCents = recalculatedIvaCents;
        remainder = newRemainder;

        if (remainder !== 0 && Math.abs(remainder) <= 3) {
          ivaCents = Math.max(0, ivaCents + remainder);
          remainder = totalCents - (baseCents + feeCents + ivaCents);
        }
      }
    }

    if (remainder !== 0) {
      const components = [
        {
          name: "base",
          value: baseCents,
          priority: baseIsRoundDollar || baseIsAlmostRoundDollar ? 3 : 1,
          ref: (v: number) => {
            baseCents = v;
          },
        },
        {
          name: "fee",
          value: feeCents,
          priority: 1,
          ref: (v: number) => {
            feeCents = v;
          },
        },
        {
          name: "iva",
          value: ivaCents,
          priority: 2,
          ref: (v: number) => {
            ivaCents = v;
          },
        },
      ];

      components.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return b.value - a.value;
      });

      const direction = remainder > 0 ? 1 : -1;
      let absRemainder = Math.abs(remainder);
      let componentIndex = 0;

      while (absRemainder > 0) {
        let adjustmentMade = false;

        for (let attempt = 0; attempt < components.length; attempt++) {
          const component = components[componentIndex];

          if (component.value + direction >= 0) {
            component.value += direction;
            component.ref(component.value);
            absRemainder--;
            adjustmentMade = true;
            componentIndex = (componentIndex + 1) % components.length;
            break;
          }

          componentIndex = (componentIndex + 1) % components.length;
        }

        if (!adjustmentMade) {
          baseCents = Math.max(0, baseCents + absRemainder * direction);
          break;
        }
      }
    }
  }

  const finalCents = baseCents + feeCents + ivaCents;
  const finalDollars = +(finalCents / 100).toFixed(2);

  return {
    basePrice: +(baseCents / 100).toFixed(2),
    serviceFee: +(feeCents / 100).toFixed(2),
    iva: +(ivaCents / 100).toFixed(2),
    finalPrice: finalDollars,
    basePriceCents: baseCents,
    serviceFeeCents: feeCents,
    ivaCents,
    finalPriceCents: finalCents,
  };
}

/**
 * Extract the organizer's base price from the final customer price
 * Uses the CURRENT markup rate (7%) - for editing tiers or new calculations
 */
export function extractBasePrice(finalPriceCents: number): PriceBreakdown {
  return extractBasePriceWithMarkup(finalPriceCents, FLAME_MARKUP_PERCENT);
}

/**
 * Extract the organizer's base price from a historical purchase
 * Uses stored fee_percentage if available, otherwise automatically detects the correct markup rate
 */
export function extractBasePriceHistorical(
  finalPriceCents: number,
  orderCreatedAt: string | Date,
  storedFeePercentage?: number | null
): PriceBreakdown {
  if (storedFeePercentage != null && Number.isFinite(storedFeePercentage)) {
    return extractBasePriceWithMarkup(finalPriceCents, storedFeePercentage);
  }

  // Validate orderDate - if invalid, fall back to round-dollar heuristics only
  const orderDate = new Date(orderCreatedAt);
  const isValidDate = !isNaN(orderDate.getTime());

  const breakdown7 = extractBasePriceWithMarkup(
    finalPriceCents,
    MARKUP_HISTORY.CURRENT_7_PERCENT
  );
  const breakdown10 = extractBasePriceWithMarkup(
    finalPriceCents,
    MARKUP_HISTORY.LEGACY_10_PERCENT
  );

  const remainder7 = Math.abs(breakdown7.basePriceCents % 100);
  const remainder10 = Math.abs(breakdown10.basePriceCents % 100);
  const isRound7 = remainder7 < 2 || remainder7 > 98;
  const isRound10 = remainder10 < 2 || remainder10 > 98;

  if (isRound7 && !isRound10) {
    return breakdown7;
  } else if (isRound10 && !isRound7) {
    return breakdown10;
  }

  if (isRound7 && isRound10) {
    if (remainder7 === remainder10) {
      return breakdown7;
    }
    return remainder7 < remainder10 ? breakdown7 : breakdown10;
  }

  // If date is invalid, default to current markup (safer for new orders)
  if (!isValidDate) {
    return breakdown7;
  }

  const markupToUse =
    orderDate < MARKUP_HISTORY.MIGRATION_DATE
      ? MARKUP_HISTORY.LEGACY_10_PERCENT
      : MARKUP_HISTORY.CURRENT_7_PERCENT;

  return extractBasePriceWithMarkup(finalPriceCents, markupToUse);
}

/**
 * Format price for display. Accepts optional ISO 4217 currency code.
 */
export function formatPrice(dollars: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(dollars);
}

/**
 * Check if price is free (zero)
 */
export function isFreePrice(cents: number): boolean {
  return cents === 0;
}

/**
 * Get the base price from a ticket price, handling both legacy (inclusive) and new (base-only) pricing models
 */
export function getBasePriceFromTicket(
  priceCents: number,
  createdAt: string | Date,
  feePercentage?: number | null
): number {
  const createdDate = new Date(createdAt);

  if (isNaN(createdDate.getTime())) {
    throw new Error(`Invalid creation date provided: ${createdAt}`);
  }

  if (createdDate >= STRIPE_CONNECT_MIGRATION_DATE) {
    return priceCents;
  }

  const breakdown = extractBasePriceHistorical(
    priceCents,
    createdAt,
    feePercentage
  );
  return breakdown.basePriceCents;
}

/**
 * Resolve the user-facing display amount (cents) for a single order in the
 * "My Tickets" surface.
 *
 * Bank-transfer orders are organizer-issued, off-platform payments — the
 * platform service fee (10% + 99c) does not apply. Stripe orders include the
 * fee in `total_cents` because that is what the user actually paid.
 *
 * For bank-transfer orders we prefer `subtotal_cents` (authoritative,
 * stored at write-time without fees per `create_bank_transfer_order_atomic`),
 * fall back to `unit_price_cents × quantity`, and fall back again to
 * `getBasePriceFromTicket(total_cents, created_at)` for sparse rows. That
 * helper is migration-date aware: returns `total_cents` as-is for rows on/after
 * `STRIPE_CONNECT_MIGRATION_DATE` (modern rows store base directly) and only
 * delegates to `extractBasePriceHistorical` for genuinely pre-Connect rows.
 * See `docs/fixes/MAY_2026_FIXES.md` #2 "Pattern note — when to use which
 * pricing helper".
 */
export function getOrderDisplayCents(
  order:
    | {
        total_cents?: number;
        subtotal_cents?: number;
        unit_price_cents?: number;
        quantity?: number;
        payment_provider?: string;
        created_at?: string;
      }
    | null
    | undefined
): number | null {
  if (!order) return null;

  const isBankTransfer = order.payment_provider === "bank_transfer";

  if (isBankTransfer) {
    if (order.subtotal_cents != null && order.subtotal_cents >= 0) {
      return order.subtotal_cents;
    }
    if (
      order.unit_price_cents != null &&
      order.unit_price_cents >= 0 &&
      order.quantity != null &&
      order.quantity > 0
    ) {
      return order.unit_price_cents * order.quantity;
    }
    if (
      order.total_cents != null &&
      order.total_cents > 0 &&
      order.created_at
    ) {
      // getBasePriceFromTicket throws on invalid date strings; fall through to
      // the total_cents default below in that (unlikely) case.
      try {
        return getBasePriceFromTicket(order.total_cents, order.created_at);
      } catch {
        // invalid created_at — fall through
      }
    }
    return order.total_cents ?? 0;
  }

  return order.total_cents ?? null;
}

/**
 * Calculate fee breakdown from total amount (reverse calculation)
 */
export function calculateFeeBreakdownFromTotal(
  totalCents: number,
  options?: { orderCreatedAt?: string | Date; feePercentage?: number | null }
): {
  basePriceCents: number;
  serviceFeeCents: number;
  ivaCents: number;
} {
  let breakdown: PriceBreakdown;

  if (options?.feePercentage != null && Number.isFinite(options.feePercentage)) {
    breakdown = extractBasePriceWithMarkup(totalCents, options.feePercentage);
  } else if (options?.orderCreatedAt) {
    breakdown = extractBasePriceHistorical(totalCents, options.orderCreatedAt);
  } else {
    breakdown = extractBasePrice(totalCents);
  }

  return {
    basePriceCents: breakdown.basePriceCents,
    serviceFeeCents: breakdown.serviceFeeCents,
    ivaCents: breakdown.ivaCents,
  };
}

/**
 * Calculate the organizer's actual base price from an order
 */
export function calculateOrganizerBasePrice(order: {
  total_amount_cents?: number;
  discount_amount_cents?: number;
  base_price_cents?: number | null;
  created_at: string;
  fee_percentage?: number | null;
}): number {
  if (order.base_price_cents !== null && order.base_price_cents !== undefined) {
    return order.base_price_cents;
  }

  const totalCents = order.total_amount_cents || 0;
  const discountCents = order.discount_amount_cents || 0;
  const subtotalBeforeDiscount = totalCents + discountCents;

  const priceBreakdown = extractBasePriceHistorical(
    subtotalBeforeDiscount,
    order.created_at,
    order.fee_percentage
  );

  let actualBasePrice = priceBreakdown.basePriceCents;
  if (discountCents > 0 && subtotalBeforeDiscount > 0) {
    let discountProportion = discountCents / subtotalBeforeDiscount;
    discountProportion = Math.min(Math.max(discountProportion, 0), 1);
    actualBasePrice = Math.round(
      priceBreakdown.basePriceCents * (1 - discountProportion)
    );
    actualBasePrice = Math.max(0, actualBasePrice);
  }

  return actualBasePrice;
}

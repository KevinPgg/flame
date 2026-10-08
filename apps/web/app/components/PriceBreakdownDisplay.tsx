"use client";

/**
 * @legacy — DEAD CODE. Not imported anywhere as of Apr 2026.
 * This component displayed the old Datafast-era price breakdown (base + fee + IVA).
 * IVA is no longer applied since Stripe Connect migration (Jan 2026).
 * Safe to delete in future cleanup. See WEB_NITPICKS_TODOS.md.
 */

import { formatPrice, type PriceBreakdown } from "@project-flame/lib";

interface PriceBreakdownDisplayProps {
  breakdown: PriceBreakdown | null;
  label?: string;
  className?: string;
  currency?: string;
}
export default function PriceBreakdownDisplay({
  breakdown,
  label = "Customer will pay",
  className = "",
  currency = "USD",
}: PriceBreakdownDisplayProps) {
  if (!breakdown || breakdown.basePrice === 0) {
    return null;
  }

  return (
    <div className={`bg-card border border-white-30 rounded-card p-3 text-sm font-poppins ${className}`}>
      <div className="flex justify-between items-center mb-2 pb-2 border-b border-white-30">
        <span className="text-white-80 font-poppins-medium text-sm">{label}:</span>
        <span className="text-white-100 font-poppins-semibold text-base">
          {formatPrice(breakdown.finalPrice, currency)}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-center text-xs">
          <span className="text-white-50">Your ticket price:</span>
          <span className="text-white-80 font-poppins-medium">
            {formatPrice(breakdown.basePrice, currency)}
          </span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-white-50">
            + Service fee:
          </span>
          <span className="text-white-80 font-poppins-medium">
            {formatPrice(breakdown.serviceFee, currency)}
          </span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-white-50">
            + IVA:
          </span>
          <span className="text-white-80 font-poppins-medium">
            {formatPrice(breakdown.iva, currency)}
          </span>
        </div>
      </div>
    </div>
  );
}

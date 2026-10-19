/**
 * Payouts (Flame 2.0 "Payouts", organization-wide). Connected accounts are created with a MANUAL
 * payout schedule (apps/web/app/lib/stripe/connect.ts), so money stays in the organizer's Stripe
 * balance until someone requests a payout (POST /api/organizer/payouts/create).
 */

/** Stripe payout minimums in minor units ($1 equivalent for most currencies). */
export const PAYOUT_MINIMUM_CENTS: Record<string, number> = {
  USD: 100,
  EUR: 100,
  GBP: 100,
  MXN: 2000,
  JPY: 100,
  DOP: 100,
  COP: 100,
};

export const payoutMinimumCents = (currency: string) => PAYOUT_MINIMUM_CENTS[currency.toUpperCase()] ?? 100;

export interface StripeMoney {
  amount: number;
  currency: string;
}

export interface BalanceRow {
  /** Upper-case ISO code. */
  currency: string;
  /** Ready to pay out now (minor units). */
  available: number;
  /** Still clearing (minor units). */
  pending: number;
  /** Whether "Request payout" makes sense (≥ the currency minimum). */
  canPayout: boolean;
}

/**
 * Stripe balance (`available[]` / `pending[]`, one entry per currency) → one row per currency,
 * the organization's default currency first, then by amount. Currencies with nothing are dropped,
 * except the default one so the screen never looks empty.
 */
export function balanceRows(
  balance: { available?: StripeMoney[]; pending?: StripeMoney[] } | null | undefined,
  defaultCurrency = "USD"
): BalanceRow[] {
  const map = new Map<string, { available: number; pending: number }>();
  const add = (list: StripeMoney[] | undefined, key: "available" | "pending") => {
    for (const m of list ?? []) {
      const cur = m.currency.toUpperCase();
      const row = map.get(cur) ?? { available: 0, pending: 0 };
      row[key] += m.amount;
      map.set(cur, row);
    }
  };
  add(balance?.available, "available");
  add(balance?.pending, "pending");
  const def = defaultCurrency.toUpperCase();
  if (!map.has(def)) map.set(def, { available: 0, pending: 0 });
  return [...map.entries()]
    .filter(([cur, r]) => cur === def || r.available !== 0 || r.pending !== 0)
    .map(([currency, r]) => ({ currency, ...r, canPayout: r.available >= payoutMinimumCents(currency) }))
    .sort((a, b) => (a.currency === def ? -1 : b.currency === def ? 1 : b.available + b.pending - (a.available + a.pending)));
}

export type PayoutStatus = "paid" | "pending" | "in_transit" | "canceled" | "failed";
export type PayoutTone = "good" | "warn" | "bad" | "muted";

export function payoutTone(status: string): PayoutTone {
  if (status === "paid") return "good";
  if (status === "pending" || status === "in_transit") return "warn";
  if (status === "failed") return "bad";
  return "muted";
}

/** Stripe Connect setup state from /api/stripe/connect/status. */
export type ConnectState = "not_connected" | "incomplete" | "ready";

export function connectState(s: { connected: boolean; chargesEnabled: boolean; payoutsEnabled: boolean } | null | undefined): ConnectState {
  if (!s?.connected) return "not_connected";
  return s.chargesEnabled && s.payoutsEnabled ? "ready" : "incomplete";
}

/**
 * Organizer event detail — pure functions shared by web and mobile (Flame 2.0).
 *
 * Inputs are the shapes /api/organizer/data already returns for each event
 * (purchases, ticket_tiers, bank_transfer_orders, promotional_tickets, promoter_links,
 * promotional_codes). Formulas match v1 (apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx).
 * Validation rules match the API routes, so the form rejects exactly what the server rejects.
 */

/** A card (Stripe) purchase — bank transfers are NOT in this list (same as v1). */
export interface PurchaseRow {
  id: string;
  userName: string;
  email: string;
  tierName: string;
  stageName: string | null;
  quantity: number;
  /** Buyer paid (includes service fee). */
  totalPrice: number;
  /** Organizer receives (net of service fee). */
  basePrice: number;
  scanned: boolean;
  createdAt: string;
}

export interface TierRow {
  id: string;
  name: string;
  price_cents: number;
  quantity_total: number;
  quantity_sold: number;
  /** Active holds + pending/approved RSVPs (server-computed). */
  quantity_reserved?: number | null;
  is_manually_sold_out?: boolean | null;
  is_hidden?: boolean | null;
}

/** Bank-transfer order as transformed by the API (one row per order). */
export interface BankTransferRow {
  order_quantity: number;
  order_total_cents: number | null;
  ticket_tiers?: { name: string } | null;
}

/** Free / comp ticket (one row per ticket unless `quantity` says otherwise). */
export interface CompRow {
  quantity?: number | null;
}

export interface PromoterLinkRow {
  id: string;
  promoter_code: string;
  promoter_name?: string | null;
  total_tickets_sold?: number | null;
  total_revenue_cents?: number | null;
}

export interface PromoCodeRow {
  id: string;
  code: string;
  discount_percentage: number;
  usage_limit: number;
  usage_count: number;
}

const sum = <T>(rows: T[], pick: (r: T) => number | null | undefined) =>
  rows.reduce((acc, r) => acc + (pick(r) || 0), 0);

/** Headline numbers (v1 "Purchased Details"): capacity, requested, sold (card), revenue (net). */
export function summarizeEventSales(input: {
  tiers: TierRow[];
  purchases: PurchaseRow[];
  pendingRsvps?: number | null;
}) {
  return {
    ticketQuantity: sum(input.tiers, (t) => t.quantity_total),
    requested: input.pendingRsvps || 0,
    sold: sum(input.purchases, (p) => p.quantity),
    revenueCents: sum(input.purchases, (p) => p.basePrice),
  };
}

export interface TierStat {
  tier: TierRow;
  sold: number;
  total: number;
  reserved: number;
  remaining: number;
  /** 0–1, sold over total. */
  soldRatio: number;
  /** Net card revenue for purchases whose tier name matches (purchases carry the name, not the id). */
  revenueCents: number;
  soldOut: boolean;
}

export function tierStats(tiers: TierRow[], purchases: PurchaseRow[]): TierStat[] {
  return tiers.map((tier) => {
    const sold = tier.quantity_sold || 0;
    const total = tier.quantity_total || 0;
    const reserved = tier.quantity_reserved || 0;
    const remaining = Math.max(0, total - sold - reserved);
    return {
      tier,
      sold,
      total,
      reserved,
      remaining,
      soldRatio: total > 0 ? Math.min(1, sold / total) : 0,
      revenueCents: sum(
        purchases.filter((p) => p.tierName === tier.name),
        (p) => p.basePrice
      ),
      soldOut: Boolean(tier.is_manually_sold_out) || remaining === 0,
    };
  });
}

/** Finance view per event (new in v2): card vs bank transfer vs comps. */
export function eventBreakdown(input: {
  purchases: PurchaseRow[];
  bankTransfers: BankTransferRow[];
  comps: CompRow[];
}) {
  const grossCents = sum(input.purchases, (p) => p.totalPrice);
  const netCents = sum(input.purchases, (p) => p.basePrice);
  const card = {
    orders: input.purchases.length,
    tickets: sum(input.purchases, (p) => p.quantity),
    grossCents,
    netCents,
    /** Flame service fee + payment processing, paid by the buyer on top of the price. */
    feesCents: Math.max(0, grossCents - netCents),
  };
  const bankTransfer = {
    orders: input.bankTransfers.length,
    tickets: sum(input.bankTransfers, (b) => b.order_quantity),
    /** Collected directly by the organizer (outside Stripe). */
    collectedCents: sum(input.bankTransfers, (b) => b.order_total_cents),
  };
  const comps = { tickets: sum(input.comps, (c) => c.quantity ?? 1) };
  return {
    card,
    bankTransfer,
    comps,
    totalTickets: card.tickets + bankTransfer.tickets + comps.tickets,
    organizerTotalCents: card.netCents + bankTransfer.collectedCents,
  };
}

/** Tickets and organizer money per tier, card + bank transfer, sorted by tickets. */
export function salesByTier(purchases: PurchaseRow[], bankTransfers: BankTransferRow[]) {
  const map = new Map<string, { tierName: string; tickets: number; netCents: number }>();
  const row = (name: string) => {
    let r = map.get(name);
    if (!r) map.set(name, (r = { tierName: name, tickets: 0, netCents: 0 }));
    return r;
  };
  for (const p of purchases) {
    const r = row(p.tierName);
    r.tickets += p.quantity || 0;
    r.netCents += p.basePrice || 0;
  }
  for (const b of bankTransfers) {
    const r = row(b.ticket_tiers?.name || "—");
    r.tickets += b.order_quantity || 0;
    r.netCents += b.order_total_cents || 0;
  }
  return Array.from(map.values()).sort((a, b) => b.tickets - a.tickets);
}

/** Leaderboard: most tickets first, then revenue, then code. */
export function promoterLeaderboard<L extends PromoterLinkRow>(links: L[]): L[] {
  return [...links].sort(
    (a, b) =>
      (b.total_tickets_sold || 0) - (a.total_tickets_sold || 0) ||
      (b.total_revenue_cents || 0) - (a.total_revenue_cents || 0) ||
      a.promoter_code.localeCompare(b.promoter_code)
  );
}

export function promoterLinkUrl(origin: string, eventSlug: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/events/${eventSlug}?promoter=${encodeURIComponent(code)}`;
}

export type CodeValidationError = "tooShort" | "tooLong" | "notAlphanumeric" | "duplicate";

function validateCode(
  raw: string,
  existing: string[],
  max: number
): { code: string; error: CodeValidationError | null } {
  const code = raw.trim().toUpperCase();
  if (code.length < 3) return { code, error: "tooShort" };
  if (code.length > max) return { code, error: "tooLong" };
  if (!/^[A-Z0-9]+$/.test(code)) return { code, error: "notAlphanumeric" };
  if (existing.some((c) => c.toUpperCase() === code)) return { code, error: "duplicate" };
  return { code, error: null };
}

/** Same rules as POST /api/organizer/promoter-links (3–50, A–Z 0–9, unique per event). */
export const validatePromoterCode = (raw: string, existing: string[]) => validateCode(raw, existing, 50);

/** Same rules as POST /api/organizer/promotional-codes (3–20, A–Z 0–9, unique per event). */
export const validatePromoCode = (raw: string, existing: string[]) => validateCode(raw, existing, 20);

/** Discounts the API accepts: 5–100 in steps of 5. */
export const PROMO_DISCOUNT_OPTIONS: readonly number[] = Array.from({ length: 20 }, (_, i) => (i + 1) * 5);

export function promoCodeStatus(c: PromoCodeRow) {
  const limit = Math.max(0, c.usage_limit || 0);
  const used = Math.max(0, c.usage_count || 0);
  return {
    used,
    limit,
    ratio: limit > 0 ? Math.min(1, used / limit) : 1,
    active: used < limit,
  };
}

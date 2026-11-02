/**
 * Organizer event detail — pure functions shared by web and mobile (Flame 2.0).
 *
 * Inputs are the shapes /api/organizer/data already returns for each event
 * (purchases, ticket_tiers, bank_transfer_orders, promotional_tickets, promoter_links,
 * promotional_codes). Formulas match v1 (apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx).
 * Validation rules match the API routes, so the form rejects exactly what the server rejects.
 */
import { getBasePriceFromTicket } from "../pricing/calculations";

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
  /** Needed to strip the fee that pre-2026-01-15 orders stored inside the total (see bankOrderNetCents). */
  created_at?: string | null;
  ticket_tiers?: { name: string } | null;
}

/**
 * What the organizer collects for one bank-transfer order. Orders created before the Stripe
 * Connect migration (2026-01-15) stored the platform fee inside `total_amount_cents`; v1 strips
 * it with getBasePriceFromTicket (OrgEventDetailClient → SendTicketsSection). Newer orders store
 * the subtotal as-is. No date (or an invalid one) → the stored total, never a crash.
 */
export function bankOrderNetCents(order: { order_total_cents?: number | null; created_at?: string | null }): number {
  const total = order.order_total_cents || 0;
  if (!total || !order.created_at) return total;
  try {
    return getBasePriceFromTicket(total, order.created_at);
  } catch {
    return total;
  }
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
    collectedCents: sum(input.bankTransfers, bankOrderNetCents),
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
    r.netCents += bankOrderNetCents(b);
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

/** Most promoters one "Paste a list" batch may create (POST /api/organizer/promoter-links/bulk). */
export const PROMOTER_BATCH_MAX = 100;

/**
 * "Paste a list" (prototype `owParseNames`): one name per line or separated by commas/semicolons;
 * strips list markers ("1.", "2)", "-", "•", "*"), collapses spaces, drops 1-letter entries and
 * repeats (case-insensitive), keeps the first spelling.
 */
export function parsePromoterNames(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\n,;]+/)) {
    const name = raw
      .replace(/^\s*(\d+[.)-]?|[-•*])\s*/, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    const key = name.toLowerCase();
    if (name.length > 1 && !seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

/**
 * Code for a promoter name (prototype `owCodeFor`): first word + initial of the second, accents
 * removed, A–Z only ("David Camacho" → DAVIDC); padded to 3 with X; numbered on clash
 * (DAVIDC2, DAVIDC3…). `taken` holds upper-case codes and is updated.
 */
export function promoterCodeFor(name: string, taken: Set<string>): string {
  const words = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, "")
    .split(" ")
    .filter(Boolean);
  let base = ((words[0] || "PROMO") + (words[1] ? words[1][0] : "")).slice(0, 40);
  if (base.length < 3) base = (base + "XXX").slice(0, 3);
  let code = base;
  for (let n = 2; taken.has(code); n++) code = `${base}${n}`;
  taken.add(code);
  return code;
}

/** Names → { name, code } with codes unique against the event's existing ones. */
export function buildPromoterBatch(names: string[], existingCodes: string[]): { name: string; code: string }[] {
  const taken = new Set(existingCodes.map((c) => c.toUpperCase()));
  return names.map((name) => ({ name, code: promoterCodeFor(name, taken) }));
}

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

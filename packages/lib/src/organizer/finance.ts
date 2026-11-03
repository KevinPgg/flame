/**
 * Finance (Flame 2.0, prototype OW_SCREENS.finance, 2026-11-02): every event of the organization
 * added up — revenue, tickets sold, tickets via promoter links — plus one row per event.
 * Same money rule as the event's Breakdown tab (`eventBreakdown`): what the organizer gets =
 * card net + bank transfers collected directly. Comps are not "sold".
 * Only OWNED events count (co-hosted events don't add to the co-host, like the dashboard).
 */
import { eventBreakdown, type BankTransferRow, type CompRow, type PromoterLinkRow, type PurchaseRow } from "./event-detail";

export interface FinanceEvent {
  id: string;
  name: string;
  starts_at: string;
  timezone?: string | null;
  currency?: string | null;
  purchases?: PurchaseRow[] | null;
  bank_transfer_orders?: BankTransferRow[] | null;
  promotional_tickets?: CompRow[] | null;
  promoter_links?: Pick<PromoterLinkRow, "total_tickets_sold">[] | null;
}

export interface FinanceRow {
  id: string;
  name: string;
  starts_at: string;
  timezone: string | null;
  currency: string;
  sold: number;
  revenueCents: number;
}

export interface OrganizationFinance {
  events: number;
  /** One entry per currency, biggest first (an organization can sell in more than one). */
  revenue: Array<{ currency: string; cents: number }>;
  sold: number;
  viaPromoters: number;
  /** Most recent event first. */
  rows: FinanceRow[];
}

export function organizationFinance(events: FinanceEvent[]): OrganizationFinance {
  const rows: FinanceRow[] = events.map((e) => {
    const b = eventBreakdown({
      purchases: e.purchases ?? [],
      bankTransfers: e.bank_transfer_orders ?? [],
      comps: e.promotional_tickets ?? [],
    });
    return {
      id: e.id,
      name: e.name,
      starts_at: e.starts_at,
      timezone: e.timezone ?? null,
      currency: (e.currency || "USD").toUpperCase(),
      sold: b.card.tickets + b.bankTransfer.tickets,
      revenueCents: b.organizerTotalCents,
    };
  });
  rows.sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());

  const byCurrency = new Map<string, number>();
  for (const r of rows) byCurrency.set(r.currency, (byCurrency.get(r.currency) ?? 0) + r.revenueCents);
  const revenue = [...byCurrency].map(([currency, cents]) => ({ currency, cents })).sort((a, b) => b.cents - a.cents);
  if (revenue.length === 0) revenue.push({ currency: "USD", cents: 0 });

  return {
    events: rows.length,
    revenue,
    sold: rows.reduce((a, r) => a + r.sold, 0),
    viaPromoters: events.reduce((a, e) => a + (e.promoter_links ?? []).reduce((x, l) => x + (l.total_tickets_sold || 0), 0), 0),
    rows,
  };
}

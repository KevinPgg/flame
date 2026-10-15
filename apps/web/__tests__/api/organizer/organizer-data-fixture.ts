/** Organization + events + cohost event for /api/organizer/data tests (uses purchases-fixture orders). */
import { orders, rsvps, ticketStages, EV_A, EV_B, TIER_A, TIER_B } from "./purchases-fixture";

export const ORG = "11111111-1111-4111-8111-111111111111";
export const OWNER_ORG = "33333333-3333-4333-8333-333333333333";
export const EV_CO = "aaaaaaaa-0000-4000-8000-0000000000c0";
const TIER_CO = "tttttttt-0000-4000-8000-0000000000c0";
const org = { id: ORG, name: "Kora", slug: "kora", approved: true, created_at: "2025-01-01T00:00:00Z", logo_url: null };
const far = new Date(Date.now() + 30 * 86_400_000).toISOString();

const event = (id: string, tiers: unknown[], over: Record<string, unknown> = {}) => ({
  id,
  name: `Event ${id.slice(-2)}`,
  slug: `ev-${id.slice(-2)}`,
  organization_id: ORG,
  starts_at: far,
  ends_at: far,
  currency: "USD",
  ticket_tiers: tiers,
  promotional_tickets: [],
  bank_transfer_orders: [],
  promoter_links: [],
  promotional_codes: [],
  ...over,
});

export function organizerDataTables() {
  const promoterOrders = [
    { id: "p-1", event_id: EV_A, promoter_code: "ANA", quantity: 2, total_amount_cents: 4598, discount_amount_cents: null, fee_percentage: null, created_at: "2026-05-01T00:00:00Z", base_price_cents: 4000, status: "paid", payment_provider: "stripe" },
    { id: "p-2", event_id: EV_A, promoter_code: "ANA", quantity: 1, total_amount_cents: 2000, discount_amount_cents: null, fee_percentage: null, created_at: "2026-05-02T00:00:00Z", base_price_cents: 2000, status: "completed", payment_provider: "bank_transfer" },
    { id: "p-3", event_id: EV_B, promoter_code: "LUIS", quantity: 1, total_amount_cents: 2050, discount_amount_cents: 513, fee_percentage: null, created_at: "2025-10-01T00:00:00Z", base_price_cents: null, status: "completed", payment_provider: "datafast" },
  ];
  const coOrder = { ...orders[8], id: "o-co", event_id: EV_CO, base_price_cents: 3000, ticket_tiers: { id: TIER_CO, name: "Co", price_cents: 3000 } };
  return {
    users: [{ id: "u-owner", clerk_id: "c-owner", email: "owner@x.com" }],
    organization_members: [{ user_id: "u-owner", organization_id: ORG, role: "owner", organizations: org }],
    organizations: [org],
    events: [
      event(EV_A, [
        { id: TIER_A, name: "General", price_cents: 2000, quantity_total: 100, quantity_sold: 6 },
        { id: TIER_B, name: "VIP", price_cents: 5000, quantity_total: 50, quantity_sold: 2 },
      ], {
        registration_form_config: [{ id: "instagram", label: "Instagram", type: "text" }],
        promoter_links: [
          { id: "pl-ana", promoter_code: "ANA", promoter_name: "Ana", created_at: "2026-01-01T00:00:00Z" },
          { id: "pl-none", promoter_code: "NONE", promoter_name: null, created_at: "2026-01-01T00:00:00Z" },
        ],
      }),
      event(EV_B, [{ id: "tier-b1", name: "General", price_cents: 1000, quantity_total: 10, quantity_sold: 1 }], {
        promoter_links: [{ id: "pl-luis", promoter_code: "LUIS", promoter_name: "Luis", created_at: "2026-01-01T00:00:00Z" }],
      }),
    ],
    event_assignments: [
      {
        id: "as-co",
        event_id: EV_CO,
        organization_id: OWNER_ORG,
        cohost_organization_id: ORG,
        user_id: null,
        source_org: { id: OWNER_ORG, name: "Hush", slug: "hush" },
        cohost_org: null,
        events: event(EV_CO, [{ id: TIER_CO, name: "Co", price_cents: 3000, quantity_total: 20, quantity_sold: 4 }], { organization_id: OWNER_ORG }),
      },
    ],
    orders: [...orders, coOrder, ...promoterOrders],
    ticket_stages: ticketStages,
    rsvps: [...rsvps, { id: "r-co", event_id: EV_CO, status: "pending", stripe_payment_intent_id: null, registration_data: null, ticket_tier_id: TIER_CO, requested_quantity: 1 }],
    holds: [
      { id: "h-1", tier_id: TIER_A, quantity: 2, expires_at: far, order_id: null, ticket_tiers: { event_id: EV_A } },
    ],
  };
}

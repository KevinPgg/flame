/**
 * Orders covering every branch of the organizer purchase calculation, for two events.
 * Shared by the characterization test (same output before/after batching) and the
 * organizer-data route tests.
 */
export const EV_A = "aaaaaaaa-0000-4000-8000-000000000001";
export const EV_B = "aaaaaaaa-0000-4000-8000-000000000002";
export const TIER_A = "tttttttt-0000-4000-8000-00000000000a";
export const TIER_B = "tttttttt-0000-4000-8000-00000000000b";

const user = (n: number, first: string | null = `Ana${n}`, last: string | null = "Loor") => ({
  id: `user-${n}`,
  first_name: first,
  last_name: last,
  email: `buyer${n}@x.com`,
});
const tierA = { id: TIER_A, name: "General", price_cents: 2000 };
const tierB = { id: TIER_B, name: "VIP", price_cents: 5000 };

type O = Record<string, unknown>;
const order = (id: string, eventId: string, over: O): O => ({
  id,
  event_id: eventId,
  user_id: "user-1",
  quantity: 1,
  unit_price_cents: 2000,
  total_amount_cents: 2299,
  discount_amount_cents: null,
  fee_percentage: null,
  base_price_cents: 2000,
  status: "paid",
  payment_provider: "stripe",
  stripe_payment_intent_id: null,
  created_at: "2026-05-01T10:00:00Z",
  users: user(1),
  ticket_tiers: tierA,
  tickets: [{ id: `${id}-t1`, checked_in_at: null, metadata: null }],
  promoter_code: null,
  ...over,
});

export const orders: O[] = [
  // Stripe: stored net price wins.
  order("o-01", EV_A, { quantity: 2, total_amount_cents: 4598, base_price_cents: 4000, users: user(1) }),
  // Legacy (no base_price_cents) with a discount: historical extraction × discount proportion.
  order("o-02", EV_A, {
    base_price_cents: null,
    total_amount_cents: 2050,
    discount_amount_cents: 513,
    created_at: "2025-10-01T00:00:00Z",
    status: "completed",
    payment_provider: "datafast",
    users: user(2, "Luis", null),
  }),
  // Stage from ticket metadata, checked in.
  order("o-03", EV_A, {
    ticket_tiers: tierB,
    unit_price_cents: 4000,
    total_amount_cents: 4599,
    base_price_cents: 4000,
    users: user(3, null, null),
    tickets: [{ id: "o-03-t1", checked_in_at: "2026-05-02T03:00:00Z", metadata: { stage_name: "Early bird" } }],
    stripe_payment_intent_id: "pi_3",
  }),
  // Stage inferred from (tier, unit price) lookup.
  order("o-04", EV_A, { ticket_tiers: tierB, unit_price_cents: 5500, total_amount_cents: 6324, base_price_cents: 5500, stripe_payment_intent_id: "pi_4" }),
  // Excluded: bank transfer, pending, and NULL provider (SQL `<>` drops NULLs).
  order("o-05", EV_A, { payment_provider: "bank_transfer" }),
  order("o-06", EV_A, { status: "pending" }),
  order("o-07", EV_A, { payment_provider: null }),
  // Invalid row (no user) is skipped, the rest still load.
  order("o-08", EV_A, { users: null }),
  // Event B.
  order("o-09", EV_B, { total_amount_cents: 1150, base_price_cents: 1000, unit_price_cents: 1000, users: user(9) }),
];

export const ticketStages = [
  { ticket_tier_id: TIER_B, price_cents: 4000, name: "Early bird" },
  { ticket_tier_id: TIER_B, price_cents: 5500, name: "Regular" },
];

export const rsvps = [
  { id: "r1", event_id: EV_A, status: "purchased", stripe_payment_intent_id: "pi_3", registration_data: { instagram: "@ana" }, ticket_tier_id: TIER_B, requested_quantity: 1 },
  { id: "r2", event_id: EV_A, status: "approved", stripe_payment_intent_id: "pi_4", registration_data: { instagram: "@old" }, ticket_tier_id: TIER_B, requested_quantity: 2 },
  { id: "r3", event_id: EV_A, status: "pending", stripe_payment_intent_id: null, registration_data: null, ticket_tier_id: TIER_A, requested_quantity: 3 },
  { id: "r4", event_id: EV_B, status: "rejected", stripe_payment_intent_id: null, registration_data: null, ticket_tier_id: null, requested_quantity: 1 },
];

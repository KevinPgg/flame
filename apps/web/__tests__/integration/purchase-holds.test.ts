import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Flame 2.0 · phase 0 — safety net for the inventory hold step of checkout.
 *
 * Exercises the real SQL functions the purchase flow relies on, against the local Supabase:
 *   - atomic_create_hold_with_stage_validation  (POST /api/holds/create)
 *   - cleanup_expired_holds                      (called lazily before availability / new holds)
 *   - mark_hold_payment_started                  (legacy Datafast path; keeps the grace window)
 *
 * Phase 3 (checkout redesign) changes code around these RPCs; these tests must stay green.
 * Tests marked `it.fails` document KNOWN GAPS: they pass while the gap exists. When someone fixes
 * the gap the test turns red — then switch it to a normal `it` so it guards the fix.
 *
 * Run: pnpm --filter web test:integration   (needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * in apps/web/.env.local pointing at the LOCAL Supabase — never at production).
 */

type HoldResult = {
  success: boolean;
  error?: string;
  hold_id?: string;
  expires_at?: string;
  stage_name?: string | null;
  stage_price_cents?: number;
  available_in_stage?: number;
  promoter_code?: string | null;
  fee_percentage?: number;
};

const uid = () => Math.random().toString(36).slice(2, 10);
const HOUR = 3600_000;

let supabase: SupabaseClient;
let organizer: { id: string };
let buyerA: { id: string };
let buyerB: { id: string };
let organization: { id: string };
let event: { id: string };
/** 5 tickets, max 4 per user, $20. */
let tier: { id: string };
/** Tier with one 3-ticket stage at $15. */
let stagedTier: { id: string };
let stage: { id: string };

async function insertUser(label: string) {
  const { data, error } = await supabase
    .from('users')
    .insert({
      clerk_id: `test_holds_${label}_${uid()}`,
      email: `holds.${label}.${uid()}@example.com`,
      first_name: 'Hold',
      last_name: label,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

async function createHold(
  userId: string,
  tierId: string,
  quantity: number,
  opts: { stageId?: string; promoterCode?: string; expiresMinutes?: number } = {}
): Promise<HoldResult> {
  const { data, error } = await supabase.rpc('atomic_create_hold_with_stage_validation', {
    p_user_id: userId,
    p_event_id: event.id,
    p_tier_id: tierId,
    p_quantity: quantity,
    p_stage_id: opts.stageId ?? null,
    p_expires_minutes: opts.expiresMinutes ?? 30,
    p_promoter_code: opts.promoterCode ?? null,
  });
  if (error) throw error;
  return data as HoldResult;
}

async function expireAllHolds() {
  const { error } = await supabase
    .from('holds')
    .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
    .eq('event_id', event.id);
  if (error) throw error;
}

beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials for integration tests');
  if (/supabase\.co/.test(url) && !process.env.ALLOW_REMOTE_DB_TESTS) {
    throw new Error(
      `Refusing to run hold tests against a hosted Supabase (${url}). Point .env.local at the local instance.`
    );
  }
  supabase = createClient(url, key, { auth: { persistSession: false } });

  organizer = await insertUser('organizer');
  buyerA = await insertUser('buyerA');
  buyerB = await insertUser('buyerB');

  const org = await supabase
    .from('organizations')
    .insert({ name: 'Holds Test Org', slug: `holds-org-${uid()}`, approved: true, owner_user_id: organizer.id })
    .select('id')
    .single();
  if (org.error) throw org.error;
  organization = org.data;

  const ev = await supabase
    .from('events')
    .insert({
      organization_id: organization.id,
      name: 'Holds Test Event',
      slug: `holds-event-${uid()}`,
      city: 'Guayaquil',
      venue: 'Test Venue',
      status: 'published',
      starts_at: new Date(Date.now() + 48 * HOUR).toISOString(),
      ends_at: new Date(Date.now() + 54 * HOUR).toISOString(),
    })
    .select('id')
    .single();
  if (ev.error) throw ev.error;
  event = ev.data;

  const salesWindow = {
    sales_start: new Date(Date.now() - 24 * HOUR).toISOString(),
    sales_end: new Date(Date.now() + 24 * HOUR).toISOString(),
  };

  const t1 = await supabase
    .from('ticket_tiers')
    .insert({ event_id: event.id, name: 'General', price_cents: 2000, quantity_total: 5, quantity_sold: 0, per_user_limit: 4, ...salesWindow })
    .select('id')
    .single();
  if (t1.error) throw t1.error;
  tier = t1.data;

  const t2 = await supabase
    .from('ticket_tiers')
    .insert({ event_id: event.id, name: 'Staged', price_cents: 1500, quantity_total: 10, quantity_sold: 0, ...salesWindow })
    .select('id')
    .single();
  if (t2.error) throw t2.error;
  stagedTier = t2.data;

  const st = await supabase
    .from('ticket_stages')
    .insert({ ticket_tier_id: stagedTier.id, name: 'Early Bird', price_cents: 1500, quantity: 3, sold_quantity: 0, order_index: 0 })
    .select('id')
    .single();
  if (st.error) throw st.error;
  stage = st.data;
});

beforeEach(async () => {
  await supabase.from('holds').delete().eq('event_id', event.id);
  await supabase.from('orders').delete().eq('event_id', event.id);
  await supabase
    .from('ticket_tiers')
    .update({ quantity_sold: 0, is_manually_sold_out: false, is_hidden: false })
    .in('id', [tier.id, stagedTier.id]);
  await supabase.from('ticket_stages').update({ sold_quantity: 0 }).eq('id', stage.id);
});

afterAll(async () => {
  if (!supabase || !event) return;
  await supabase.from('holds').delete().eq('event_id', event.id);
  await supabase.from('orders').delete().eq('event_id', event.id);
  await supabase.from('ticket_stages').delete().eq('id', stage?.id ?? '');
  await supabase.from('ticket_tiers').delete().eq('event_id', event.id);
  await supabase.from('events').delete().eq('id', event.id);
  await supabase.from('organizations').delete().eq('id', organization.id);
  await supabase.from('users').delete().in('id', [organizer.id, buyerA.id, buyerB.id]);
});

describe('atomic_create_hold_with_stage_validation', () => {
  it('creates a 30-minute hold and snapshots promoter code, currency and fee', async () => {
    const before = Date.now();
    const res = await createHold(buyerA.id, tier.id, 2, { promoterCode: 'PROMO1' });

    expect(res.success).toBe(true);
    expect(res.promoter_code).toBe('PROMO1');
    const minutes = (new Date(res.expires_at!).getTime() - before) / 60_000;
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThan(31);

    const { data: hold } = await supabase
      .from('holds')
      .select('quantity, promoter_code, currency, fee_percentage, order_id')
      .eq('id', res.hold_id!)
      .single();
    expect(hold).toMatchObject({ quantity: 2, promoter_code: 'PROMO1', currency: 'usd', order_id: null });
    expect(Number(hold!.fee_percentage)).toBeGreaterThan(0);
  });

  it('rejects quantity 0', async () => {
    const res = await createHold(buyerA.id, tier.id, 0);
    expect(res).toMatchObject({ success: false, error: 'Ticket quantity must be at least 1' });
  });

  it("counts other users' active holds against inventory", async () => {
    expect((await createHold(buyerA.id, tier.id, 3)).success).toBe(true);
    const res = await createHold(buyerB.id, tier.id, 3);
    expect(res).toMatchObject({ success: false, error: 'Only 2 tickets available for this tier' });
  });

  it('a retry by the same user replaces their own hold instead of locking them out', async () => {
    await createHold(buyerA.id, tier.id, 4);
    const retry = await createHold(buyerA.id, tier.id, 4);
    expect(retry.success).toBe(true);

    const { count } = await supabase
      .from('holds')
      .select('id', { count: 'exact', head: true })
      .eq('tier_id', tier.id)
      .eq('user_id', buyerA.id);
    expect(count).toBe(1);
  });

  it('enforces the per-user limit including completed orders', async () => {
    const order = await supabase.from('orders').insert({
      user_id: buyerA.id,
      organization_id: organization.id,
      event_id: event.id,
      ticket_tier_id: tier.id,
      quantity: 3,
      unit_price_cents: 2000,
      subtotal_cents: 6000,
      fees_cents: 0,
      total_cents: 6000,
      total_amount_cents: 6000,
      status: 'completed',
      idempotency_key: `holds-test-${uid()}`,
    });
    if (order.error) throw order.error;

    const res = await createHold(buyerA.id, tier.id, 2);
    expect(res).toMatchObject({ success: false, error: 'Maximum 4 tickets per user for this tier' });
    expect((await createHold(buyerA.id, tier.id, 1)).success).toBe(true);
  });

  it('reports sold out when everything is sold', async () => {
    await supabase.from('ticket_tiers').update({ quantity_sold: 5 }).eq('id', tier.id);
    const res = await createHold(buyerA.id, tier.id, 1);
    expect(res).toMatchObject({ success: false, error: 'This ticket tier is sold out' });
  });

  it('expired holds no longer block other buyers', async () => {
    await createHold(buyerA.id, tier.id, 4);
    await expireAllHolds();
    expect((await createHold(buyerB.id, tier.id, 4)).success).toBe(true);
  });

  it('respects the sales window', async () => {
    await supabase
      .from('ticket_tiers')
      .update({
        sales_start: new Date(Date.now() + 1 * HOUR).toISOString(),
        sales_end: new Date(Date.now() + 2 * HOUR).toISOString(),
      })
      .eq('id', tier.id);
    expect(await createHold(buyerA.id, tier.id, 1)).toMatchObject({
      success: false,
      error: 'Ticket sales have not started yet',
    });

    await supabase
      .from('ticket_tiers')
      .update({
        sales_start: new Date(Date.now() - 3 * HOUR).toISOString(),
        sales_end: new Date(Date.now() - 1 * HOUR).toISOString(),
      })
      .eq('id', tier.id);
    expect(await createHold(buyerA.id, tier.id, 1)).toMatchObject({
      success: false,
      error: 'Ticket sales have ended',
    });

    await supabase
      .from('ticket_tiers')
      .update({
        sales_start: new Date(Date.now() - 24 * HOUR).toISOString(),
        sales_end: new Date(Date.now() + 24 * HOUR).toISOString(),
      })
      .eq('id', tier.id);
  });

  it('uses the stage price and stage inventory when a stage is given', async () => {
    const res = await createHold(buyerA.id, stagedTier.id, 2, { stageId: stage.id });
    expect(res).toMatchObject({ success: true, stage_name: 'Early Bird', stage_price_cents: 1500 });

    const over = await createHold(buyerB.id, stagedTier.id, 2, { stageId: stage.id });
    expect(over.success).toBe(false);
    expect(over.error).toContain('Only 1 ticket(s) available for the "Early Bird" stage');

    await supabase.from('ticket_stages').update({ sold_quantity: 3 }).eq('id', stage.id);
    await supabase.from('holds').delete().eq('event_id', event.id);
    const soldOut = await createHold(buyerB.id, stagedTier.id, 1, { stageId: stage.id });
    expect(soldOut.error).toContain('"Early Bird" stage is sold out');
  });

  it('rejects a tier that belongs to another event', async () => {
    const { data, error } = await supabase.rpc('atomic_create_hold_with_stage_validation', {
      p_user_id: buyerA.id,
      p_event_id: crypto.randomUUID(),
      p_tier_id: tier.id,
      p_quantity: 1,
    });
    expect(error).toBeNull();
    expect((data as HoldResult).success).toBe(false);
  });

  // KNOWN GAP (found 2026-10-08): "Sold out" set by the organizer (is_manually_sold_out) is only
  // enforced in the UI (EventDetail.tsx / useEventDetails.ts). Neither this RPC nor
  // POST /api/holds/create checks it, so a direct API call can still reserve and buy.
  it.fails('rejects holds on a tier the organizer marked as sold out', async () => {
    await supabase.from('ticket_tiers').update({ is_manually_sold_out: true }).eq('id', tier.id);
    const res = await createHold(buyerA.id, tier.id, 1);
    expect(res.success).toBe(false);
  });
});

describe('cleanup_expired_holds', () => {
  it('deletes only expired, unused holds', async () => {
    const expired = await createHold(buyerA.id, tier.id, 1);
    await expireAllHolds();
    const active = await createHold(buyerB.id, tier.id, 1);

    const { data, error } = await supabase.rpc('cleanup_expired_holds');
    expect(error).toBeNull();
    expect(data[0].deleted_count).toBeGreaterThanOrEqual(1);

    const { data: left } = await supabase.from('holds').select('id').eq('event_id', event.id);
    const ids = (left ?? []).map((h) => h.id);
    expect(ids).toContain(active.hold_id);
    expect(ids).not.toContain(expired.hold_id);
  });

  it('keeps an expired hold whose payment started less than 15 minutes ago', async () => {
    const res = await createHold(buyerA.id, tier.id, 1);
    const mark = await supabase.rpc('mark_hold_payment_started', {
      p_hold_id: res.hold_id,
      p_checkout_id: 'test_checkout',
      p_extend_minutes: 10,
    });
    expect(mark.data).toMatchObject({ success: true });

    await expireAllHolds();
    await supabase.rpc('cleanup_expired_holds');
    const kept = await supabase.from('holds').select('id').eq('id', res.hold_id!);
    expect(kept.data).toHaveLength(1);

    await supabase
      .from('holds')
      .update({ payment_started_at: new Date(Date.now() - 16 * 60_000).toISOString() })
      .eq('id', res.hold_id!);
    await supabase.rpc('cleanup_expired_holds');
    const gone = await supabase.from('holds').select('id').eq('id', res.hold_id!);
    expect(gone.data).toHaveLength(0);
  });
});

describe('mark_hold_payment_started', () => {
  it('extends the hold and flags payment in progress', async () => {
    const res = await createHold(buyerA.id, tier.id, 1);
    const { data } = await supabase.rpc('mark_hold_payment_started', {
      p_hold_id: res.hold_id,
      p_checkout_id: 'test_checkout',
      p_extend_minutes: 10,
    });
    expect(data).toMatchObject({ success: true, extended_by_minutes: 10 });
    const minutesAdded =
      (new Date(data.new_expiration).getTime() - new Date(data.old_expiration).getTime()) / 60_000;
    expect(Math.round(minutesAdded)).toBe(10);

    const { data: hold } = await supabase
      .from('holds')
      .select('payment_in_progress, payment_started_at')
      .eq('id', res.hold_id!)
      .single();
    expect(hold!.payment_in_progress).toBe(true);
    expect(hold!.payment_started_at).not.toBeNull();
  });

  it('refuses unknown or expired holds', async () => {
    const unknown = await supabase.rpc('mark_hold_payment_started', {
      p_hold_id: crypto.randomUUID(),
      p_checkout_id: 'x',
    });
    expect(unknown.data).toMatchObject({ success: false, error: 'Hold not found' });

    const res = await createHold(buyerA.id, tier.id, 1);
    await expireAllHolds();
    const expired = await supabase.rpc('mark_hold_payment_started', {
      p_hold_id: res.hold_id,
      p_checkout_id: 'x',
    });
    expect(expired.data).toMatchObject({ success: false, error: 'Hold has expired' });
  });
});

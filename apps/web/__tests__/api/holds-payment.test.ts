/**
 * Fase 3.1 — B3 and B4 on the hold endpoints.
 *  - POST /api/holds/start-payment marks the hold "payment in progress" (+10 min) before paying.
 *  - POST /api/holds/create refuses (409) to replace a hold whose payment is running.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./organizer/fake-supabase";

const state = vi.hoisted(() => ({ clerk: null as string | null, db: null as any, rpcs: [] as Array<{ name: string; args: any }>, rpcResult: {} as Record<string, any> }));

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: state.clerk })) }));
vi.mock("@/app/lib/supabase/server", () => ({
  get supabaseAdmin() {
    return state.db;
  },
}));
vi.mock("@/app/lib/auth", () => ({
  resolveDbUserFromClerkId: async (clerkId: string) => {
    const u = state.db.tables.users.find((x: any) => x.clerk_id === clerkId);
    if (!u) throw new Error("User not found");
    return u;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { POST as startPayment } from "@/app/api/holds/start-payment/route";
import { POST as createHold } from "@/app/api/holds/create/route";

const MIN = 60_000;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const HOLD = "11111111-1111-4111-8111-111111111111";
const EVENT = "22222222-2222-4222-8222-222222222222";
const TIER = "33333333-3333-4333-8333-333333333333";

function db(holds: any[]) {
  const tables = {
    users: [{ id: "u1", clerk_id: "clerk_1" }],
    events: [{ id: EVENT, name: "Ev", slug: "ev", requires_rsvp: false, status: "published" }],
    ticket_tiers: [{ id: TIER, event_id: EVENT, name: "GA", price_cents: 1500, is_hidden: false, secret_code: null, sales_start: null, sales_end: null, per_user_limit: null }],
    holds,
  };
  const d: any = fakeSupabase(tables);
  d.tables = tables;
  d.rpc = vi.fn(async (name: string, args: any) => {
    state.rpcs.push({ name, args });
    return { data: state.rpcResult[name] ?? null, error: null };
  });
  state.db = d;
  return d;
}

const post = (url: string, body: unknown) =>
  new NextRequest(`http://localhost:3000${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const start = (body: unknown = { hold_id: HOLD, payment_intent_id: "pi_123abc" }) => startPayment(post("/api/holds/start-payment", body));

const hold = (extra: Record<string, unknown> = {}) => ({
  id: HOLD,
  user_id: "u1",
  tier_id: TIER,
  expires_at: iso(5 * MIN),
  created_at: iso(-25 * MIN),
  order_id: null,
  payment_in_progress: false,
  payment_started_at: null,
  ...extra,
});

beforeEach(() => {
  state.clerk = "clerk_1";
  state.rpcs = [];
  state.rpcResult = {};
});

describe("POST /api/holds/start-payment (B3)", () => {
  it("marks the hold with the PaymentIntent and extends it 10 minutes", async () => {
    db([hold()]);
    state.rpcResult.mark_hold_payment_started = { success: true, new_expiration: "2026-10-28T20:00:00Z" };
    const res = await start();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, expires_at: "2026-10-28T20:00:00Z", extended: true });
    expect(state.rpcs).toEqual([{ name: "mark_hold_payment_started", args: { p_hold_id: HOLD, p_checkout_id: "stripe:pi_123abc", p_extend_minutes: 10 } }]);
  });

  it("sign-in, a valid body and the buyer's own hold are required", async () => {
    db([hold({ user_id: "someone-else" })]);
    state.clerk = null;
    expect((await start()).status).toBe(401);
    state.clerk = "clerk_1";
    expect((await start({ hold_id: "nope", payment_intent_id: "pi_1" })).status).toBe(400);
    expect((await start({ hold_id: HOLD, payment_intent_id: "cs_live_x" })).status).toBe(400);
    const res = await start();
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("HOLD_NOT_FOUND");
    expect(state.rpcs).toEqual([]);
  });

  it("an expired or already-used hold can't start a payment (nothing is charged)", async () => {
    db([hold({ expires_at: iso(-1 * MIN) })]);
    let res = await start();
    expect(res.status).toBe(410);
    expect((await res.json()).code).toBe("HOLD_EXPIRED");
    db([hold({ order_id: "o1" })]);
    res = await start();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("HOLD_USED");
    expect(state.rpcs).toEqual([]);
  });

  it("calling again within 10 minutes (declined card, retry) doesn't extend again", async () => {
    db([hold({ payment_in_progress: true, payment_started_at: iso(-3 * MIN) })]);
    const res = await start();
    expect(await res.json()).toMatchObject({ ok: true, extended: false });
    expect(state.rpcs).toEqual([]);
  });

  it("a hold older than an hour is never stretched (pays with what's left)", async () => {
    db([hold({ created_at: iso(-61 * MIN) })]);
    const res = await start();
    expect(await res.json()).toMatchObject({ ok: true, extended: false });
    expect(state.rpcs).toEqual([]);
  });

  it("the database's own answer wins (expired between the read and the update)", async () => {
    db([hold()]);
    state.rpcResult.mark_hold_payment_started = { success: false, error: "Hold has expired" };
    const res = await start();
    expect(res.status).toBe(410);
  });
});

describe("POST /api/holds/create (B4)", () => {
  const body = { event_id: EVENT, ticket_tier_id: TIER, quantity: 1 };

  it("a hold of the same tier with a payment running → 409, the hold is not replaced", async () => {
    db([hold({ payment_in_progress: true, payment_started_at: iso(-2 * MIN) })]);
    const res = await createHold(post("/api/holds/create", body));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "PAYMENT_IN_PROGRESS" });
    expect(state.rpcs.map((r) => r.name)).not.toContain("atomic_create_hold_with_stage_validation");
  });

  it("an abandoned hold (no payment running) is still replaced as before", async () => {
    db([hold()]);
    state.rpcResult.cleanup_expired_holds = [{ deleted_count: 0, affected_tier_ids: [] }];
    await createHold(post("/api/holds/create", body));
    expect(state.rpcs.map((r) => r.name)).toContain("atomic_create_hold_with_stage_validation");
  });

  it("another user's paying hold doesn't block this one", async () => {
    db([hold({ user_id: "u2", payment_in_progress: true, payment_started_at: iso(-2 * MIN) })]);
    state.rpcResult.cleanup_expired_holds = [{ deleted_count: 0, affected_tier_ids: [] }];
    await createHold(post("/api/holds/create", body));
    expect(state.rpcs.map((r) => r.name)).toContain("atomic_create_hold_with_stage_validation");
  });
});

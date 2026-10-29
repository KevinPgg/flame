/** Fase 3.4: hourly reconciliation of paid RSVPs whose webhook never arrived (case of 10-28). */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./organizer/fake-supabase";

const state = vi.hoisted(() => ({ db: null as any, pi: {} as Record<string, string>, created: [] as string[] }));
vi.mock("@/app/lib/supabase/server", () => ({
  get supabaseAdmin() {
    return state.db;
  },
}));
vi.mock("@/app/lib/stripe/stripe", () => ({
  stripe: { paymentIntents: { retrieve: vi.fn(async (id: string) => ({ id, status: state.pi[id] ?? "requires_capture" })) } },
}));
vi.mock("@/app/lib/stripe/rsvp-order", () => ({
  createOrderAndTicketsFromRsvp: vi.fn(async (rsvp: { id: string }) => {
    state.created.push(rsvp.id);
  }),
}));

import { GET } from "@/app/api/cron/reconcile-rsvp-payments/route";

const req = (auth?: string) => new NextRequest("http://localhost:3000/api/cron/reconcile-rsvp-payments", { headers: auth ? { authorization: auth } : {} });
const rsvp = (id: string, pi: string | null, status = "approved") => ({ id, status, stripe_payment_intent_id: pi, approved_at: new Date(Date.now() - 3600_000).toISOString() });

beforeEach(() => {
  process.env.CRON_SECRET = "s3cret";
  state.created = [];
  state.pi = { pi_lost: "succeeded", pi_done: "succeeded", pi_auth: "requires_capture" };
  state.db = fakeSupabase({
    rsvps: [rsvp("lost", "pi_lost"), rsvp("done", "pi_done"), rsvp("auth", "pi_auth"), rsvp("free", null), rsvp("paid", "pi_x", "paid")],
    orders: [{ id: "o1", stripe_payment_intent_id: "pi_done" }],
  });
});

describe("GET /api/cron/reconcile-rsvp-payments", () => {
  it("needs the cron secret", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
  });

  it("creates the tickets only for approved RSVPs whose payment Stripe captured and that have no order", async () => {
    const res = await GET(req("Bearer s3cret"));
    expect(await res.json()).toEqual({ checked: 3, created: 1, notCaptured: 1, alreadyOrdered: 1, failed: 0 });
    expect(state.created).toEqual(["lost"]);
  });
});

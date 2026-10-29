/**
 * Fase 3.5 (2026-10-29): force-reduce never cancels what is already committed.
 *  - approved RSVPs (card already charged) are not rejected and count as taken;
 *  - holds with a payment in progress (< 20 min) are not deleted and count as taken;
 *  - capacity can't go below sold + approved + paying (400 BELOW_COMMITTED).
 * Pending RSVPs and idle holds are still released, as before.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./fake-supabase";

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: "c-owner" })) }));
vi.mock("@/app/lib/supabase/server", () => ({ get supabaseAdmin() { return state.db; } }));
vi.mock("@/app/lib/stripe/stripe", () => ({
  stripe: { paymentIntents: { retrieve: vi.fn(async () => ({ status: "requires_capture" })), cancel: vi.fn(async () => ({})) } },
}));
vi.mock("@/app/lib/email/rsvp-notifications", () => ({ sendRsvpRejectionEmail: vi.fn(async () => undefined) }));
vi.mock("@/app/lib/push-notifications", () => ({ sendPushNotification: vi.fn(async () => undefined) }));
vi.mock("@/app/lib/utils/event-access", () => ({ requireEventAccess: vi.fn(async () => null) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { POST } from "@/app/api/organizer/tiers/[tierId]/force-reduce/route";

const TIER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ORG = "11111111-1111-4111-8111-111111111111";
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const inMin = (min: number) => new Date(Date.now() + min * 60_000).toISOString();

function seed(extra: { sold?: number; holds?: any[]; rsvps?: any[] } = {}) {
  const tables: Record<string, any[]> = {
    users: [{ id: "u-owner", clerk_id: "c-owner" }],
    organization_members: [{ user_id: "u-owner", organization_id: ORG, role: "owner" }],
    organizations: [{ id: ORG, name: "Kora" }],
    ticket_tiers: [
      {
        id: TIER, name: "General", quantity_total: 100, quantity_sold: extra.sold ?? 10,
        events: { id: "ev", name: "Ev", slug: "ev", starts_at: inMin(9000), venue: "V", timezone: "America/Guayaquil", organization_id: ORG },
      },
    ],
    holds: extra.holds ?? [],
    rsvps: extra.rsvps ?? [],
  };
  state.db = fakeSupabase(tables);
  return state.db;
}
const run = async (n: number) => {
  const res = await POST(
    new NextRequest(`http://localhost/api/organizer/tiers/${TIER}/force-reduce`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ new_quantity_total: n }),
    }),
    { params: Promise.resolve({ tierId: TIER }) },
  );
  return { status: res.status, json: (await res.json()) as any };
};

const holds = [
  { id: "h-idle", tier_id: TIER, quantity: 2, order_id: null, expires_at: inMin(20), payment_in_progress: false, payment_started_at: null },
  { id: "h-paying", tier_id: TIER, quantity: 3, order_id: null, expires_at: inMin(20), payment_in_progress: true, payment_started_at: ago(5) },
  { id: "h-stale", tier_id: TIER, quantity: 1, order_id: null, expires_at: inMin(20), payment_in_progress: true, payment_started_at: ago(45) },
];
const rsvps = [
  { id: "r-pending", ticket_tier_id: TIER, status: "pending", requested_quantity: 2, user_id: "u1", stripe_payment_intent_id: "pi_p", users: { email: "p@x.com", first_name: "P", last_name: null } },
  { id: "r-approved", ticket_tier_id: TIER, status: "approved", requested_quantity: 4, user_id: "u2", stripe_payment_intent_id: "pi_a", users: { email: "a@x.com", first_name: "A", last_name: null } },
];

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("force-reduce keeps committed capacity", () => {
  it("refuses to go below sold + approved RSVPs + paying holds", async () => {
    const db = seed({ sold: 10, holds, rsvps });
    const { status, json } = await run(16); // committed = 10 + 4 + 3 = 17
    expect(status).toBe(400);
    expect(json.code).toBe("BELOW_COMMITTED");
    expect(json.details).toEqual({ sold: 10, approved_rsvps: 4, paying_holds: 3, minimum: 17 });
    expect(db.writes()).toEqual([]); // nothing touched
  });

  it("at the floor: releases only idle/stale holds and pending RSVPs", async () => {
    const db = seed({ sold: 10, holds, rsvps });
    const { status, json } = await run(17);
    expect(status).toBe(200);
    const writes = db.writes();
    const del = writes.find((w: any) => w.table === "holds" && w.op === "delete");
    expect(del.filters).toContain("id in h-idle|h-stale");
    const rej = writes.find((w: any) => w.table === "rsvps" && w.op === "update");
    expect(rej.filters).toContain("id in r-pending");
    expect(rej.filters).toContain("status=pending");
    expect(JSON.stringify(json)).not.toContain("r-approved");
  });

  it("with nothing committed besides sold, behaves as before", async () => {
    const db = seed({ sold: 0, holds: [holds[0]], rsvps: [rsvps[0]] });
    const { status } = await run(0);
    expect(status).toBe(200);
    expect(db.writes().some((w: any) => w.table === "ticket_tiers" && w.op === "update")).toBe(true);
  });
});

/**
 * GET /api/organizer/data — the response must stay identical (values recorded from the route
 * before batching, 2026-10-15) while the number of queries stops growing with the number of events.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./fake-supabase";
import { organizerDataTables, EV_CO } from "./organizer-data-fixture";
import { EV_A, EV_B, orders } from "./purchases-fixture";

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: "c-owner" })) }));
vi.mock("@/app/lib/supabase/server", () => ({
  get supabaseAdmin() {
    return state.db;
  },
}));
vi.mock("@/app/lib/auth", () => ({ resolveDbUserFromClerkId: async () => ({ id: "u-owner" }) }));
import { GET } from "@/app/api/organizer/data/route";

const pick = (e: any) => ({
  id: e.id,
  pending_rsvps: e.pending_rsvps,
  approved_rsvps: e.approved_rsvps,
  rejected_rsvps: e.rejected_rsvps,
  purchased_rsvps: e.purchased_rsvps,
  totalRevenue: e.totalRevenue,
  totalAttendees: e.totalAttendees,
  purchaseIds: (e.purchases ?? []).map((p: any) => p.id).sort(),
  reg: (e.purchases ?? []).filter((p: any) => p.registrationData).map((p: any) => p.id).sort(),
  reserved: (e.ticket_tiers ?? []).map((t: any) => [t.id.slice(-4), t.quantity_reserved]),
  promoters: (e.promoter_links ?? []).map((l: any) => [l.promoter_code, l.total_tickets_sold, l.total_revenue_cents]),
});

async function load(tables = organizerDataTables(), opts = {}) {
  state.db = fakeSupabase(tables as never, opts);
  const res = await GET(new NextRequest("http://localhost/api/organizer/data?org=kora"));
  return { res, json: await res.json(), calls: state.db.calls as Array<{ table: string }> };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("GET /api/organizer/data — same numbers as before batching", () => {
  it("owned events: RSVP counts, revenue, attendees, purchases, reserved per tier, promoter stats", async () => {
    const { res, json } = await load();
    expect(res.status).toBe(200);
    expect(json.events.map(pick)).toEqual([
      {
        id: EV_A,
        pending_rsvps: 1,
        approved_rsvps: 1,
        rejected_rsvps: 0,
        purchased_rsvps: 1,
        totalRevenue: 15340,
        totalAttendees: 8,
        purchaseIds: ["o-01", "o-02", "o-03", "o-04"],
        reg: ["o-03", "o-04"],
        // General: 2 held + 3 pending RSVP; VIP: 2 approved RSVP.
        reserved: [["000a", 5], ["000b", 2]],
        // Promoter stats include bank transfers (they count as sales).
        promoters: [["ANA", 3, 6000], ["NONE", 0, 0]],
      },
      {
        id: EV_B,
        pending_rsvps: 0,
        approved_rsvps: 0,
        rejected_rsvps: 1,
        purchased_rsvps: 0,
        totalRevenue: 1000,
        totalAttendees: 1,
        purchaseIds: ["o-09"],
        reg: [],
        reserved: [["r-b1", 0]],
        promoters: [["LUIS", 1, 1840]],
      },
    ]);
  });

  it("co-hosted events: counts and revenue, but no purchase rows", async () => {
    const { json } = await load();
    expect(json.cohost_events.map((c: any) => ({ owner: c.owner_org_name, ...pick(c.event) }))).toEqual([
      {
        owner: "Hush",
        id: EV_CO,
        pending_rsvps: 1,
        approved_rsvps: 0,
        rejected_rsvps: 0,
        purchased_rsvps: 0,
        totalRevenue: 3000,
        totalAttendees: 4,
        purchaseIds: [],
        reg: [],
        reserved: [["00c0", undefined]], // co-hosted tiers carry no reservation hint
        promoters: [],
      },
    ]);
  });
});

describe("GET /api/organizer/data — queries do not grow with the number of events", () => {
  const withExtraEvents = (n: number) => {
    const t = organizerDataTables();
    const template = t.events[1];
    for (let i = 0; i < n; i++) {
      const id = `eeeeeeee-0000-4000-8000-${String(i).padStart(12, "0")}`;
      t.events.push({ ...template, id, ticket_tiers: [], promoter_links: [] } as never);
      t.orders.push({ ...orders[0], id: `x-${i}`, event_id: id } as never);
      t.rsvps.push({ id: `xr-${i}`, event_id: id, status: "pending", stripe_payment_intent_id: null, registration_data: null, ticket_tier_id: null, requested_quantity: 1 } as never);
    }
    return t;
  };

  it("2 events and 42 events cost the same number of queries", async () => {
    const small = await load(withExtraEvents(0));
    const large = await load(withExtraEvents(40));
    expect(large.json.events).toHaveLength(42);
    expect(large.calls.length).toBe(small.calls.length);
  });

  it("org-wide reads page past the 1000-row cap (RSVP counts and revenue stay exact)", async () => {
    const t = organizerDataTables();
    for (let i = 0; i < 1500; i++) {
      t.rsvps.push({ id: `bulk-${String(i).padStart(5, "0")}`, event_id: EV_B, status: "pending", stripe_payment_intent_id: null, registration_data: null, ticket_tier_id: null, requested_quantity: 1 } as never);
      t.orders.push({ ...orders[8], id: `bulk-o-${String(i).padStart(5, "0")}`, base_price_cents: 10 } as never);
    }
    const { json } = await load(t);
    const b = json.events.find((e: any) => e.id === EV_B);
    expect(b.pending_rsvps).toBe(1500);
    expect(b.totalRevenue).toBe(1000 + 1500 * 10);
  });

  it("a failing org-wide orders read is a 500, not silently wrong numbers", async () => {
    const { res } = await load(organizerDataTables(), { failTables: ["orders"] });
    expect(res.status).toBe(500);
  });
});

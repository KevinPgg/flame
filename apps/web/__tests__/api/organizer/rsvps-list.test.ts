/** GET /api/organizer/rsvps — every request of an event, past PostgREST's 1000-row cap. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeSupabase } from "./fake-supabase";

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: "c-owner" })) }));
vi.mock("@/app/lib/supabase/server", () => ({
  get supabaseAdmin() {
    return state.db;
  },
}));
import { GET } from "@/app/api/organizer/rsvps/route";

const ORG = "org-1";
const EV = "ev-1";
const tables = (n: number) => ({
  users: [{ id: "u-owner", clerk_id: "c-owner" }],
  organization_members: [{ user_id: "u-owner", organization_id: ORG, role: "owner" }],
  event_assignments: [],
  events: [{ id: EV, organization_id: ORG, registration_form_config: [{ id: "ig", label: "Instagram" }] }],
  rsvps: Array.from({ length: n }, (_, i) => ({
    id: `r-${String(i).padStart(5, "0")}`,
    event_id: EV,
    status: i % 3 === 0 ? "pending" : "approved",
    requested_at: "2026-10-01T00:00:00Z",
    requested_quantity: 1,
    users: { first_name: "A", last_name: "B", email: `g${i}@x.com` },
    ticket_tiers: { name: "General", price_cents: 1000 },
  })),
});
const get = () => GET(new Request(`http://localhost/api/organizer/rsvps?event_id=${EV}`));

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));

describe("GET /api/organizer/rsvps", () => {
  it("returns all 1500 requests (was cut at 1000) and the form config", async () => {
    state.db = fakeSupabase(tables(1500) as never);
    const res = await get();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.count).toBe(1500);
    expect(new Set(json.rsvps.map((r: { id: string }) => r.id)).size).toBe(1500);
    expect(json.registration_form_config).toEqual([{ id: "ig", label: "Instagram" }]);
  });

  it("a read error is a 500, never a partial list", async () => {
    const t = tables(10);
    state.db = fakeSupabase(t as never, { failTables: ["rsvps"] });
    expect((await get()).status).toBe(500);
  });
});

/** GET /api/holds/active — the buyer's purchase in progress (Kevin 2026-10-28). */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeSupabase } from "./organizer/fake-supabase";

const state = vi.hoisted(() => ({ clerk: null as string | null, db: null as any }));
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

import { GET } from "@/app/api/holds/active/route";

const MIN = 60_000;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const hold = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  user_id: "u1",
  order_id: null,
  expires_at: iso(20 * MIN),
  created_at: iso(-5 * MIN),
  quantity: 2,
  payment_in_progress: false,
  stage_name: null,
  events: { name: "White Party", slug: "white-party", image_url: "f.jpg" },
  ticket_tiers: { name: "Tier 1" },
  ...extra,
});
function db(holds: any[]) {
  const tables = { users: [{ id: "u1", clerk_id: "c1" }], holds };
  const d: any = fakeSupabase(tables);
  d.tables = tables;
  state.db = d;
}

beforeEach(() => {
  state.clerk = "c1";
});

describe("GET /api/holds/active", () => {
  it("the running reservation with its event and tier", async () => {
    db([hold("h1")]);
    const body = await (await GET()).json();
    expect(body.hold).toMatchObject({ id: "h1", quantity: 2, tier: "Tier 1", event: { name: "White Party", slug: "white-party" } });
  });
  it("none when expired, already ordered, payment started (no paying twice) or someone else's", async () => {
    db([
      hold("expired", { expires_at: iso(-MIN) }),
      hold("paid", { order_id: "o1" }),
      hold("paying", { payment_in_progress: true }),
      hold("theirs", { user_id: "u2" }),
    ]);
    expect((await (await GET()).json()).hold).toBeNull();
  });
  it("signed out → 401", async () => {
    db([]);
    state.clerk = null;
    expect((await GET()).status).toBe(401);
  });
});

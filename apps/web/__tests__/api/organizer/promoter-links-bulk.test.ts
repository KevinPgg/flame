/** "Paste a list" of promoters (2026-11-02): POST /api/organizer/promoter-links/bulk. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./fake-supabase";

const state = vi.hoisted(() => ({ db: null as any, clerk: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: state.clerk })) }));
vi.mock("@/app/lib/supabase/server", () => ({
  get supabaseAdmin() {
    return state.db;
  },
}));
import { POST } from "@/app/api/organizer/promoter-links/bulk/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const EV = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  const tables: Record<string, any[]> = {
    users: [
      { id: "u-owner", clerk_id: "c-owner" },
      { id: "u-org", clerk_id: "c-org" },
    ],
    organization_members: [
      { id: "m1", user_id: "u-owner", organization_id: ORG, role: "owner" },
      { id: "m2", user_id: "u-org", organization_id: ORG, role: "organizer" },
    ],
    events: [{ id: EV, organization_id: ORG }],
    event_assignments: [],
    promoter_links: [{ id: "pl1", event_id: EV, promoter_code: "DAVIDC" }],
  };
  state.db = Object.assign(fakeSupabase(tables), { tables });
});

const post = (who: string | null, body: unknown) => {
  state.clerk = who;
  return POST(new NextRequest("http://localhost/api/organizer/promoter-links/bulk", { method: "POST", body: JSON.stringify(body) }));
};

describe("POST /api/organizer/promoter-links/bulk", () => {
  it("creates one link per pasted name with codes unique against the event", async () => {
    const res = await post("c-owner", { event_id: EV, names: "1. David Camacho\nJuan León, david camacho" });
    expect(res.status).toBe(200);
    const { promoter_links } = await res.json();
    expect(promoter_links.map((l: any) => [l.promoter_name, l.promoter_code])).toEqual([
      ["David Camacho", "DAVIDC2"],
      ["Juan León", "JUANL"],
    ]);
    expect(promoter_links.every((l: any) => l.event_id === EV && l.created_by === "u-owner" && l.total_tickets_sold === 0)).toBe(true);
    expect(state.db.writes()).toHaveLength(1); // one insert for the whole batch
  });

  it("accepts an array of names", async () => {
    const res = await post("c-owner", { event_id: EV, names: ["Ana Ruiz", "Ana Ríos"] });
    const { promoter_links } = await res.json();
    expect(promoter_links.map((l: any) => l.promoter_code)).toEqual(["ANAR", "ANAR2"]);
  });

  it("rejects an empty list and more than 100 names", async () => {
    expect((await post("c-owner", { event_id: EV, names: " \n, " })).status).toBe(400);
    const many = Array.from({ length: 101 }, (_, i) => `Promotor Numero${i}`).join("\n");
    expect((await post("c-owner", { event_id: EV, names: many })).status).toBe(400);
  });

  it("an organizer not assigned to the event can't create links", async () => {
    expect((await post("c-org", { event_id: EV, names: "Ana Ruiz" })).status).toBe(403);
    expect(state.db.writes()).toHaveLength(0);
  });

  it("401 without session", async () => {
    expect((await post(null, { event_id: EV, names: "Ana Ruiz" })).status).toBe(401);
  });
});

/**
 * DELETE /api/ticket-tiers (2026-10-16): the "last tier" check ran after the tier's stages were
 * deleted, so trying to delete an event's only staged tier answered 400 but had already wiped
 * its price stages.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./fake-supabase";

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: "c-owner" })), currentUser: vi.fn(async () => null) }));
vi.mock("@/app/lib/supabase/server", () => ({
  get supabaseAdmin() {
    return state.db;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import * as tiers from "@/app/api/ticket-tiers/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const EV = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const T1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const T2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function seed(tierIds: string[]) {
  const tables = {
    users: [{ id: "u-owner", clerk_id: "c-owner" }],
    organization_members: [{ user_id: "u-owner", organization_id: ORG, role: "owner" }],
    ticket_tiers: tierIds.map((id) => ({ id, event_id: EV, quantity_sold: 0, events: { id: EV, organization_id: ORG } })),
    ticket_stages: [
      { id: "s1", ticket_tier_id: T1, sold_quantity: 0 },
      { id: "s2", ticket_tier_id: T1, sold_quantity: 0 },
    ],
  };
  state.db = fakeSupabase(tables);
  return state.db;
}
const del = (id: string) => tiers.DELETE(new NextRequest(`http://localhost/api/ticket-tiers?id=${id}`, { method: "DELETE" }));

describe("DELETE /api/ticket-tiers", () => {
  it("the only tier: refused and its stages are left alone", async () => {
    const db = seed([T1]);
    const res = await del(T1);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/last ticket tier/);
    expect(db.writes()).toEqual([]);
  });

  it("one of several: stages then tier are deleted", async () => {
    const db = seed([T1, T2]);
    const res = await del(T1);
    expect(res.status).toBe(200);
    expect(db.writes().map((w: { table: string; op: string }) => `${w.op} ${w.table}`)).toEqual(["delete ticket_stages", "delete ticket_tiers"]);
  });
});

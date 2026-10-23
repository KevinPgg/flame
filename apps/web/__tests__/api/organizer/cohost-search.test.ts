/**
 * Fase 1b: the app searches organizations to add as co-host through the web API
 * (GET /api/organizations/[id]/cohost-assignments?search=), never Supabase directly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./fake-supabase";

const state = vi.hoisted(() => ({ db: null as any, clerk: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: state.clerk })) }));
vi.mock("../../../app/lib/supabase/server", () => ({
  get supabaseAdmin() {
    return state.db;
  },
}));

import { GET } from "@/app/api/organizations/[id]/cohost-assignments/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const EV = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  state.db = fakeSupabase({
    users: [
      { id: "u-owner", clerk_id: "c-owner" },
      { id: "u-org", clerk_id: "c-org" },
    ],
    organization_members: [
      { user_id: "u-owner", organization_id: ORG, role: "owner" },
      { user_id: "u-org", organization_id: ORG, role: "organizer" },
    ],
    organizations: [
      { id: ORG, name: "Kora Club", slug: "kora", approved: true, logo_url: null, city: "Guayaquil" },
      { id: "o-luna", name: "Luna Club", slug: "luna", approved: true, logo_url: null, city: "Quito" },
      { id: "o-sol", name: "Sol Club", slug: "sol", approved: true, logo_url: null, city: "Quito" },
      { id: "o-pend", name: "Pending Club", slug: "pend", approved: false, logo_url: null, city: null },
      { id: "o-bar", name: "Bar Norte", slug: "bar", approved: true, logo_url: null, city: null },
    ],
    event_assignments: [{ id: "a1", organization_id: ORG, event_id: EV, cohost_organization_id: "o-sol" }],
  });
});

const get = (q: string) =>
  GET(new NextRequest(`http://localhost/api/organizations/${ORG}/cohost-assignments?${q}`), { params: Promise.resolve({ id: ORG }) });

describe("GET cohost-assignments?search=", () => {
  it("approved orgs by name, without itself and the event's current co-hosts", async () => {
    state.clerk = "c-owner";
    const res = await get(`search=club&event_id=${EV}`);
    expect(res.status).toBe(200);
    expect((await res.json()).organizations.map((o: { id: string }) => o.id)).toEqual(["o-luna"]);
  });
  it("empty term → empty list; organizer role → 403; anonymous → 401", async () => {
    state.clerk = "c-owner";
    expect((await (await get("search=%25%25")).json()).organizations).toEqual([]);
    state.clerk = "c-org";
    expect((await get("search=club")).status).toBe(403);
    state.clerk = null;
    expect((await get("search=club")).status).toBe(401);
  });
});

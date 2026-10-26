/**
 * Fase 1b.5: restricted people search (Kevin, 2026-10-23) and the organization profile read the
 * app needs. Partial matches come only from the DB function `search_org_people` (the
 * organization's circle); anyone else only by exact e-mail.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./fake-supabase";

const state = vi.hoisted(() => ({ db: null as any, clerk: null as string | null, rpcCalls: [] as unknown[] }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: state.clerk })) }));
vi.mock("../../../app/lib/supabase/server", () => ({
  get supabaseAdmin() {
    return state.db;
  },
}));

import { GET as people } from "@/app/api/organizer/people/route";
import { GET as orgDetails } from "@/app/api/organizations/[id]/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const CIRCLE = [{ id: "u-ana", email: "ana@x.com", first_name: "Ana", last_name: "Ruiz" }];

beforeEach(() => {
  state.rpcCalls = [];
  const db = fakeSupabase({
    users: [
      { id: "u-owner", clerk_id: "c-owner" },
      { id: "u-org", clerk_id: "c-org" },
      { id: "u-view", clerk_id: "c-view" },
      { id: "u-stranger", clerk_id: "c-s", email: "Luis@X.com", first_name: "Luis", last_name: "Mora" },
      { id: "u-ana", clerk_id: "c-ana", email: "ana@x.com", first_name: "Ana", last_name: "Ruiz" },
    ],
    organization_members: [
      { user_id: "u-owner", organization_id: ORG, role: "owner" },
      { user_id: "u-org", organization_id: ORG, role: "organizer" },
      { user_id: "u-view", organization_id: ORG, role: "viewer" },
    ],
    organizations: [{ id: ORG, name: "Kora Club", slug: "kora", instagram_handle: "kora", city: "Guayaquil", description: "Hi", logo_url: null }],
  });
  (db as { rpc: unknown }).rpc = async (fn: string, args: unknown) => {
    state.rpcCalls.push([fn, args]);
    return { data: CIRCLE, error: null };
  };
  state.db = db;
});

const search = (q: string, org = ORG) => people(new NextRequest(`http://localhost/api/organizer/people?organizationId=${org}&q=${encodeURIComponent(q)}`));

describe("GET /api/organizer/people", () => {
  it("partial text → only the organization's circle (DB function), marked related", async () => {
    state.clerk = "c-org";
    const res = await search("an");
    expect(res.status).toBe(200);
    expect((await res.json()).people).toEqual([{ ...CIRCLE[0], related: true }]);
    expect(state.rpcCalls).toEqual([["search_org_people", { p_org: ORG, p_query: "an", p_limit: 8 }]]);
  });

  it("someone outside the circle only appears with their exact e-mail", async () => {
    state.clerk = "c-owner";
    const partial = await (await search("luis@x.co")).json();
    expect(partial.people.map((p: { id: string }) => p.id)).toEqual(["u-ana"]);
    const exact = await (await search("luis@x.com")).json(); // stored as "Luis@X.com"
    expect(exact.people[0]).toMatchObject({ id: "u-stranger", related: false });
  });

  it("1 character → nothing (no query); viewer 403; anonymous 401; bad org 400", async () => {
    state.clerk = "c-owner";
    expect((await (await search("a")).json()).people).toEqual([]);
    expect(state.rpcCalls).toEqual([]);
    state.clerk = "c-view";
    expect((await search("ana")).status).toBe(403);
    state.clerk = null;
    expect((await search("ana")).status).toBe(401);
    state.clerk = "c-owner";
    expect((await search("ana", "nope")).status).toBe(400);
  });
});

describe("GET /api/organizations/[id]", () => {
  const read = () => orgDetails(new NextRequest(`http://localhost/api/organizations/${ORG}`), { params: Promise.resolve({ id: ORG }) });
  it("any member reads the profile with their role; others 403", async () => {
    state.clerk = "c-view";
    const res = await read();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      organization: { id: ORG, name: "Kora Club", slug: "kora", instagram_handle: "kora", city: "Guayaquil", description: "Hi", logo_url: null },
      role: "viewer",
    });
    state.clerk = "c-s";
    expect((await read()).status).toBe(403);
  });
});

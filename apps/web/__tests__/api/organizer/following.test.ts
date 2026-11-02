/** Fase 4.2 Seguir organizadores: /api/me/following (private) and public counts. */
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
import { GET, PUT } from "@/app/api/me/following/route";
import { GET as COUNTS } from "@/app/api/organizations/followers/route";

const KORA = "11111111-1111-4111-8111-111111111111";
const PEND = "22222222-2222-4222-8222-222222222222";
const org = (id: string, name: string, approved = true) => ({ id, name, slug: name.toLowerCase(), logo_url: null, city: "Quito", approved });

beforeEach(() => {
  state.clerk = "c-ana";
  const tables: Record<string, any[]> = {
    users: [{ id: "u-ana", clerk_id: "c-ana" }, { id: "u-bo", clerk_id: "c-bo" }],
    organizations: [org(KORA, "Kora"), org(PEND, "Pend", false)],
    organization_follows: [
      { user_id: "u-ana", organization_id: KORA, created_at: "2026-11-02T10:00:00Z", organizations: org(KORA, "Kora") },
      { user_id: "u-ana", organization_id: PEND, created_at: "2026-11-01T10:00:00Z", organizations: org(PEND, "Pend", false) },
      { user_id: "u-bo", organization_id: KORA, created_at: "2026-11-02T11:00:00Z", organizations: org(KORA, "Kora") },
    ],
  };
  const db = fakeSupabase(tables);
  // organization_follower_counts(): counts rows of organization_follows (the fake doesn't run SQL).
  db.rpc = vi.fn(async (_fn: string, { p_org_ids }: { p_org_ids: string[] }) => ({
    data: p_org_ids
      .map((id) => ({ organization_id: id, followers: tables.organization_follows.filter((f) => f.organization_id === id).length }))
      .filter((r) => r.followers > 0),
    error: null,
  })) as any;
  state.db = Object.assign(db, { tables });
});

const put = (body: unknown) => PUT(new NextRequest("http://localhost/api/me/following", { method: "PUT", body: JSON.stringify(body) }));

describe("GET /api/me/following", () => {
  it("only the caller's, only approved organizations, with their follower count", async () => {
    const { organizations } = await (await GET()).json();
    expect(organizations).toEqual([{ id: KORA, name: "Kora", slug: "kora", logo_url: null, city: "Quito", followers_count: 2 }]);
  });
  it("401 signed out", async () => {
    state.clerk = null;
    expect((await GET()).status).toBe(401);
  });
});

describe("PUT /api/me/following", () => {
  it("follow: upsert for the caller and returns the count", async () => {
    state.clerk = "c-bo";
    const res = await put({ organization_id: KORA, following: true });
    expect(await res.json()).toEqual({ organization_id: KORA, following: true, followers_count: 2 });
    expect(state.db.writes()[0]).toMatchObject({ table: "organization_follows", op: "upsert" });
  });
  it("can't follow an organization under review", async () => {
    expect((await put({ organization_id: PEND, following: true })).status).toBe(404);
    expect(state.db.writes()).toHaveLength(0);
  });
  it("unfollow only deletes the caller's row", async () => {
    await put({ organization_id: KORA, following: false });
    expect(state.db.writes()).toEqual([{ table: "organization_follows", op: "delete", filters: ["user_id=u-ana", `organization_id=${KORA}`] }]);
  });
  it("400 on a bad body", async () => {
    expect((await put({ organization_id: "x", following: true })).status).toBe(400);
    expect((await put({ organization_id: KORA })).status).toBe(400);
  });
});

describe("GET /api/organizations/followers (public)", () => {
  const get = (q: string) => COUNTS(new NextRequest(`http://localhost/api/organizations/followers${q}`));
  it("counts per id, 0 when nobody follows; no session needed", async () => {
    state.clerk = null;
    const other = "33333333-3333-4333-8333-333333333333";
    expect(await (await get(`?ids=${KORA},${other}`)).json()).toEqual({ counts: { [KORA]: 2, [other]: 0 } });
  });
  it("400 without ids, with bad ids or more than 50", async () => {
    expect((await get("")).status).toBe(400);
    expect((await get("?ids=nope")).status).toBe(400);
    expect((await get(`?ids=${Array(51).fill(KORA).join(",")}`)).status).toBe(400);
  });
});

/** Fase 4.1 Guardar eventos: /api/me/saved-events (private list, idempotent PUT). */
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
import { GET, PUT } from "@/app/api/me/saved-events/route";

const PUB = "11111111-1111-4111-8111-111111111111";
const DRAFT = "22222222-2222-4222-8222-222222222222";
const ev = (id: string, status: string, extra = {}) => ({
  id, status, name: id, slug: id, starts_at: "2026-12-01T22:00:00Z", ends_at: "2026-12-02T04:00:00Z",
  organizations: [{ name: "Kora", slug: "kora", logo_url: null }],
  ticket_tiers: [{ id: "t1", price_cents: 1000, is_hidden: false }, { id: "t2", price_cents: 0, is_hidden: true }],
  ...extra,
});

beforeEach(() => {
  state.clerk = "c-ana";
  state.db = fakeSupabase({
    users: [{ id: "u-ana", clerk_id: "c-ana" }, { id: "u-bo", clerk_id: "c-bo" }],
    events: [ev(PUB, "published"), ev(DRAFT, "draft")],
    saved_events: [
      { user_id: "u-ana", event_id: PUB, created_at: "2026-11-02T10:00:00Z", events: ev(PUB, "published") },
      { user_id: "u-ana", event_id: DRAFT, created_at: "2026-11-01T10:00:00Z", events: ev(DRAFT, "draft") },
      { user_id: "u-bo", event_id: PUB, created_at: "2026-11-02T11:00:00Z", events: ev(PUB, "published") },
    ],
  });
});

const put = (body: unknown) => PUT(new NextRequest("http://localhost/api/me/saved-events", { method: "PUT", body: JSON.stringify(body) }));

describe("GET /api/me/saved-events", () => {
  it("only the caller's saves, only published events, hidden tiers left out, org flattened", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const { events } = await res.json();
    expect(events.map((e: any) => e.id)).toEqual([PUB]);
    expect(events[0].organizations).toEqual({ name: "Kora", slug: "kora", logo_url: null });
    expect(events[0].ticket_tiers.map((t: any) => t.id)).toEqual(["t1"]);
    expect(events[0]).not.toHaveProperty("status");
  });

  it("401 signed out; empty list for a person without a users row", async () => {
    state.clerk = null;
    expect((await GET()).status).toBe(401);
    state.clerk = "c-new";
    expect((await (await GET()).json()).events).toEqual([]);
  });
});

describe("PUT /api/me/saved-events", () => {
  it("saves a published event with an upsert for the caller", async () => {
    const res = await put({ event_id: PUB, saved: true });
    expect(await res.json()).toEqual({ event_id: PUB, saved: true });
    const w = state.db.writes();
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ table: "saved_events", op: "upsert" });
  });

  it("can't save a draft or a missing event", async () => {
    expect((await put({ event_id: DRAFT, saved: true })).status).toBe(404);
    expect((await put({ event_id: "33333333-3333-4333-8333-333333333333", saved: true })).status).toBe(404);
    expect(state.db.writes()).toHaveLength(0);
  });

  it("removing only touches the caller's row", async () => {
    const res = await put({ event_id: PUB, saved: false });
    expect(await res.json()).toEqual({ event_id: PUB, saved: false });
    const w = state.db.writes();
    expect(w).toEqual([{ table: "saved_events", op: "delete", filters: ["user_id=u-ana", `event_id=${PUB}`] }]);
  });

  it("400 on a bad body", async () => {
    expect((await put({ event_id: "x", saved: true })).status).toBe(400);
    expect((await put({ event_id: PUB })).status).toBe(400);
  });
});

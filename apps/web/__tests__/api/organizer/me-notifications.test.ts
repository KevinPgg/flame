/** Fase 2.1: /api/me/notifications — the web bell's data, always the caller's own rows. */
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

import { GET, PATCH, DELETE } from "@/app/api/me/notifications/route";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  state.clerk = "c-ana";
  state.db = fakeSupabase({
    users: [{ id: "u-ana", clerk_id: "c-ana" }],
    notifications: [
      { id: A, user_id: "u-ana", type: "ticket_sold", title: "Sold", body: "1 ticket", data: { eventId: "e1", orgId: "o1" }, read: false, created_at: "2026-10-27T10:00:00Z" },
      { id: B, user_id: "u-ana", type: "rsvp_approved", title: "Approved", body: "You're in", data: {}, read: true, created_at: "2026-10-26T10:00:00Z" },
      { id: "x", user_id: "u-bob", type: "rsvp_approved", title: "Not mine", body: "", data: {}, read: false, created_at: "2026-10-27T11:00:00Z" },
    ],
    organizations: [{ id: "o1", slug: "kora" }],
    events: [{ id: "e1", slug: "luna", image_url: "https://img/luna.jpg" }],
  });
});
const req = (method: string, body: unknown) => new NextRequest("http://localhost/api/me/notifications", { method, body: JSON.stringify(body) });

describe("/api/me/notifications", () => {
  it("GET: only mine, newest first, with where each opens and the flyer", async () => {
    const json = await (await GET()).json();
    expect(json.notifications.map((n: any) => n.id)).toEqual([A, B]);
    expect(json.notifications[0]).toMatchObject({
      read: false,
      image: "https://img/luna.jpg",
      href: "/v2/organizer/event/e1?org=kora&tab=purchases",
    });
    expect(json.notifications[1]).toMatchObject({ href: "/account", image: null });
  });

  it("PATCH marks read (some or all) on my rows only", async () => {
    expect((await PATCH(req("PATCH", { ids: [A] }))).status).toBe(200);
    expect((await PATCH(req("PATCH", { all: true }))).status).toBe(200);
    const writes = state.db.writes();
    expect(writes[0]).toMatchObject({ table: "notifications", op: "update", filters: ["user_id=u-ana", `id in ${A}`] });
    expect(writes[1]).toMatchObject({ op: "update", filters: ["user_id=u-ana", "read=false"] });
  });

  it("DELETE removes some or all of mine", async () => {
    expect((await DELETE(req("DELETE", { ids: [A, B] }))).status).toBe(200);
    expect((await DELETE(req("DELETE", { all: true }))).status).toBe(200);
    const writes = state.db.writes();
    expect(writes[0]).toMatchObject({ op: "delete", filters: ["user_id=u-ana", `id in ${A}|${B}`] });
    expect(writes[1]).toMatchObject({ op: "delete", filters: ["user_id=u-ana"] });
  });

  it("bad bodies 400; signed out 401", async () => {
    expect((await DELETE(req("DELETE", {}))).status).toBe(400);
    expect((await PATCH(req("PATCH", { ids: ["not-a-uuid"] }))).status).toBe(400);
    expect((await PATCH(req("PATCH", { all: false }))).status).toBe(400);
    state.clerk = null;
    expect((await GET()).status).toBe(401);
  });
});

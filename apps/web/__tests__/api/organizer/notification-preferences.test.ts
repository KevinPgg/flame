/** Fase 1b.5b: notification preferences through the API (the app no longer writes Supabase directly). */
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

import { GET, PUT } from "@/app/api/me/notification-preferences/route";

beforeEach(() => {
  state.clerk = "c-ana";
  state.db = fakeSupabase({ users: [{ id: "u-ana", clerk_id: "c-ana", notification_preferences: { ticket_sold: false } }] });
});
const put = (body: unknown) => PUT(new NextRequest("http://localhost/api/me/notification-preferences", { method: "PUT", body: JSON.stringify(body) }));

describe("/api/me/notification-preferences", () => {
  it("GET merges defaults", async () => {
    const json = await (await GET()).json();
    expect(json.preferences).toMatchObject({ ticket_sold: false, event_reminder: true, ticket_received: true });
  });

  it("PUT keeps the rest and writes the whole set to the caller's row", async () => {
    const res = await put({ event_reminder: false });
    expect(res.status).toBe(200);
    expect((await res.json()).preferences).toMatchObject({ event_reminder: false, ticket_sold: false, rsvp_pending: true });
    const write = state.db.writes()[0];
    expect(write).toMatchObject({ table: "users", op: "update", filters: ["id=u-ana"] });
  });

  it("invalid bodies 400; signed out 401", async () => {
    expect((await put({ nope: true })).status).toBe(400);
    expect((await put({ ticket_sold: "x" })).status).toBe(400);
    state.clerk = null;
    expect((await GET()).status).toBe(401);
  });
});

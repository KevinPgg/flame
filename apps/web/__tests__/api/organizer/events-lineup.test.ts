/** Fase 4.3 Line-up: PATCH /api/events normalizes the line-up, rejects bad links, [] clears it. */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
vi.mock("@/app/lib/push-notifications", () => ({ sendPushToEventTicketHolders: vi.fn(async () => undefined) }));
vi.mock("@/app/lib/email/date-change-notifications", () => ({ sendDateChangeEmail: vi.fn(async () => true) }));
import * as events from "@/app/api/events/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const EV = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

beforeEach(() => {
  const future = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
  state.db = fakeSupabase({
    users: [{ id: "u-owner", clerk_id: "c-owner", email: "o@x.com" }],
    organization_members: [{ user_id: "u-owner", organization_id: ORG, role: "owner" }],
    organizations: [{ id: ORG, name: "Kora" }],
    events: [{ id: EV, organization_id: ORG, name: "Salsa", slug: "salsa", venue: "Porto", timezone: "America/Guayaquil", starts_at: future(10), ends_at: future(10.2), organizations: { id: ORG }, lineup: [] }],
    orders: [],
    tickets: [],
  });
});

const patch = (body: unknown) =>
  events.PATCH(new NextRequest("http://localhost/api/events", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

describe("PATCH /api/events · lineup", () => {
  it("stores the normalized line-up", async () => {
    const res = await patch({ id: EV, lineup: [{ name: " Perdomo ", instagram: "@perdomo.dj", soundcloud: "perdomo" }, { name: "Chuy", spotify: "open.spotify.com/artist/1?si=x" }] });
    expect(res.status).toBe(200);
    expect((await res.json()).lineup).toEqual([
      { name: "Perdomo", instagram: "perdomo.dj", soundcloud: "https://soundcloud.com/perdomo" },
      { name: "Chuy", spotify: "https://open.spotify.com/artist/1" },
    ]);
  });

  it("[] clears it", async () => {
    const res = await patch({ id: EV, lineup: [] });
    expect(res.status).toBe(200);
    expect((await res.json()).lineup).toEqual([]);
  });

  it("a bad link or a missing name is a 400 and nothing is written", async () => {
    expect((await patch({ id: EV, lineup: [{ name: "X", spotify: "https://evil.com/a" }] })).status).toBe(400);
    expect((await patch({ id: EV, lineup: [{ name: "", instagram: "a" }] })).status).toBe(400);
    expect((await patch({ id: EV, lineup: "nope" })).status).toBe(400);
    expect(state.db.writes()).toHaveLength(0);
  });

  it("not sent → line-up untouched (other fields still save)", async () => {
    const res = await patch({ id: EV, venue: "Otro" });
    expect(res.status).toBe(200);
    expect(await res.json()).not.toHaveProperty("lineup");
  });
});

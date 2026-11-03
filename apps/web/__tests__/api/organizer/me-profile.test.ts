/** Edit profile API (2026-11-02): name through Clerk first, Instagram + colour in users. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./fake-supabase";

const state = vi.hoisted(() => ({ db: null as any, clerkFails: false, clerkCalls: [] as any[] }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "c-1" })),
  clerkClient: vi.fn(async () => ({
    users: {
      updateUser: vi.fn(async (id: string, p: unknown) => {
        state.clerkCalls.push([id, p]);
        if (state.clerkFails) throw new Error("clerk down");
        return {};
      }),
    },
  })),
}));
vi.mock("@/app/lib/supabase/server", () => ({
  get supabaseAdmin() {
    return state.db;
  },
}));
import { GET, PATCH } from "@/app/api/me/profile/route";

const DEFAULT = "https://x.supabase.co/storage/v1/object/public/profile-images/default.jpg";
beforeEach(() => {
  state.clerkFails = false;
  state.clerkCalls = [];
  state.db = fakeSupabase({
    users: [{ id: "u1", clerk_id: "c-1", email: "k@x.com", first_name: "Kevin", last_name: "P", profile_image_url: DEFAULT, instagram: null, avatar_color: null }],
  });
});

const patch = (body: unknown) => PATCH(new NextRequest("http://localhost/api/me/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const updates = () => state.db.writes().filter((w: any) => w.table === "users" && w.op === "update");

describe("/api/me/profile", () => {
  it("GET: the default image counts as no photo", async () => {
    const res = await GET();
    expect(await res.json()).toEqual({ email: "k@x.com", first_name: "Kevin", last_name: "P", instagram: null, avatar_color: null, photo_url: null });
  });

  it("PATCH: new name goes to Clerk, then everything to users (Instagram normalized)", async () => {
    const res = await patch({ first_name: " Kevin  A. ", last_name: "Palacios", instagram: "https://instagram.com/kevin.p?igsh=1", avatar_color: "#1b4d3e" });
    expect(res.status).toBe(200);
    expect(state.clerkCalls).toEqual([["c-1", { firstName: "Kevin A.", lastName: "Palacios" }]]);
    expect(updates()).toHaveLength(1);
    expect(await res.json()).toMatchObject({ first_name: "Kevin A.", last_name: "Palacios", instagram: "kevin.p", avatar_color: "#1B4D3E", photo_url: null });
  });

  it("PATCH: same name → Clerk is not called", async () => {
    await patch({ first_name: "Kevin", last_name: "P", instagram: "", avatar_color: null });
    expect(state.clerkCalls).toHaveLength(0);
    expect(updates()).toHaveLength(1);
  });

  it("PATCH: Clerk refuses → 502 and nothing saved", async () => {
    state.clerkFails = true;
    const res = await patch({ first_name: "Otro", last_name: "", instagram: "", avatar_color: null });
    expect(res.status).toBe(502);
    expect(updates()).toHaveLength(0);
  });

  it("PATCH: invalid fields → 400 per field", async () => {
    const res = await patch({ first_name: "", instagram: "not valid!", avatar_color: "#123456" });
    expect(res.status).toBe(400);
    expect((await res.json()).fields).toEqual({ first_name: "firstNameRequired", instagram: "instagramInvalid", avatar_color: "colorInvalid" });
  });
});

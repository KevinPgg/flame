/** Fase 4.3: artist photo — from Spotify / SoundCloud (copied to our storage) or uploaded. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./fake-supabase";

const state = vi.hoisted(() => ({ db: null as any, clerk: "c-owner" as string | null }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: state.clerk })) }));
vi.mock("@/app/lib/supabase/server", () => ({
  get supabaseAdmin() {
    return state.db;
  },
}));
import { POST } from "@/app/api/organizer/lineup-photo/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const uploads: string[] = [];

beforeEach(() => {
  uploads.length = 0;
  state.clerk = "c-owner";
  const db = fakeSupabase({
    users: [{ id: "u-owner", clerk_id: "c-owner", email: "o@x.com" }, { id: "u-view", clerk_id: "c-view", email: "v@x.com" }],
    organization_members: [
      { user_id: "u-owner", organization_id: ORG, role: "owner" },
      { user_id: "u-view", organization_id: ORG, role: "viewer" },
    ],
  });
  db.storage.from = () => ({
    upload: async (path: string) => (uploads.push(path), { data: { path }, error: null }),
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://abc.supabase.co/storage/v1/object/public/event-images/${path}` } }),
    remove: async () => ({ data: [], error: null }),
    list: async () => ({ data: [], error: null }),
  });
  state.db = db;
});
afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown) => POST(new NextRequest("http://localhost/api/organizer/lineup-photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const stubRemote = (oembed: Record<string, unknown> | null, image = true) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/oembed")) return oembed ? new Response(JSON.stringify(oembed)) : new Response("nope", { status: 404 });
      if (image) return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
      return new Response("x", { status: 500 });
    })
  );

describe("POST /api/organizer/lineup-photo", () => {
  it("Spotify: reads the profile picture and copies it under artists/<org>/", async () => {
    stubRemote({ thumbnail_url: "https://i.scdn.co/image/abc" });
    const res = await json({ organizationId: ORG, source: "spotify", url: "open.spotify.com/artist/123" });
    expect(res.status).toBe(200);
    const { photo_url } = await res.json();
    expect(photo_url).toMatch(new RegExp(`/event-images/artists/${ORG}/[0-9a-f-]{36}\\.jpg$`));
    expect(uploads[0]).toMatch(new RegExp(`^artists/${ORG}/`));
  });

  it("SoundCloud placeholder (no picture) → 422 NO_PHOTO, nothing stored", async () => {
    stubRemote({ thumbnail_url: "https://soundcloud.com/images/fb_placeholder.png" });
    const res = await json({ organizationId: ORG, source: "soundcloud", url: "perdomo" });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("NO_PHOTO");
    expect(uploads).toHaveLength(0);
  });

  it("a link that isn't Spotify → 422 SOURCE_UNREACHABLE", async () => {
    stubRemote({ thumbnail_url: "x" });
    const res = await json({ organizationId: ORG, source: "spotify", url: "https://youtube.com/x" });
    expect(res.status).toBe(422);
  });

  it("upload: stores the file; refuses other types", async () => {
    const form = new FormData();
    form.append("organizationId", ORG);
    form.append("file", new File([new Uint8Array([1, 2])], "a.jpg", { type: "image/jpeg" }));
    const res = await POST(new NextRequest("http://localhost/api/organizer/lineup-photo", { method: "POST", body: form }));
    expect(res.status).toBe(200);
    const bad = new FormData();
    bad.append("organizationId", ORG);
    bad.append("file", new File([new Uint8Array([1])], "a.gif", { type: "image/gif" }));
    expect((await POST(new NextRequest("http://localhost/api/organizer/lineup-photo", { method: "POST", body: bad }))).status).toBe(400);
  });

  it("viewers and strangers can't; 401 signed out", async () => {
    stubRemote({ thumbnail_url: "https://i.scdn.co/image/abc" });
    state.clerk = "c-view";
    expect((await json({ organizationId: ORG, source: "spotify", url: "open.spotify.com/artist/1" })).status).toBe(403);
    state.clerk = null;
    expect((await json({ organizationId: ORG, source: "spotify", url: "open.spotify.com/artist/1" })).status).toBe(401);
  });
});

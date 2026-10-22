/**
 * Settings v2 (2026-10-16): language preference endpoint and organization logo permissions
 * (owner/admin only, like PATCH /api/organizations/[id]).
 */
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
vi.mock("../../../app/lib/supabase/server", () => ({
  get supabaseAdmin() {
    return state.db;
  },
}));

import * as language from "@/app/api/me/language/route";
import * as uploadOrgImage from "@/app/api/upload-org-image/route";

const ORG = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  const tables: Record<string, any[]> = {
    users: [
      { id: "u-owner", clerk_id: "c-owner", language: "en" },
      { id: "u-org", clerk_id: "c-org", language: "en" },
      { id: "u-viewer", clerk_id: "c-viewer", language: "en" },
    ],
    organizations: [{ id: ORG, slug: "kora" }],
    organization_members: [
      { id: "m1", user_id: "u-owner", organization_id: ORG, role: "owner" },
      { id: "m2", user_id: "u-org", organization_id: ORG, role: "organizer" },
      { id: "m3", user_id: "u-viewer", organization_id: ORG, role: "viewer" },
    ],
  };
  state.db = Object.assign(fakeSupabase(tables), { tables });
});

const put = (body: unknown) =>
  language.PUT(new NextRequest("http://localhost/api/me/language", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

describe("GET /api/me/language", () => {
  it("returns the saved language, English when unknown, 401 when anonymous", async () => {
    state.db.tables.users[0].language = "es";
    state.clerk = "c-owner";
    expect(await (await language.GET()).json()).toEqual({ language: "es" });
    state.clerk = "c-nobody";
    expect(await (await language.GET()).json()).toEqual({ language: "en" });
    state.clerk = null;
    expect((await language.GET()).status).toBe(401);
  });
});

describe("PUT /api/me/language", () => {
  it("saves a supported language for the signed-in person", async () => {
    state.clerk = "c-owner";
    const res = await put({ language: "es" });
    expect(res.status).toBe(200);
    expect(state.db.writes()).toEqual([expect.objectContaining({ table: "users", op: "update" })]);
  });
  it("rejects other languages and anonymous calls", async () => {
    state.clerk = "c-owner";
    expect((await put({ language: "fr" })).status).toBe(400);
    state.clerk = null;
    expect((await put({ language: "es" })).status).toBe(401);
    expect(state.db.writes()).toEqual([]);
  });
});

describe("/api/upload-org-image — owner/admin only", () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  // jsdom's File has no arrayBuffer(); the route reads the bytes to check the real image type.
  const png = () => Object.assign(new File([bytes], "logo.png", { type: "image/png" }), { arrayBuffer: async () => bytes.buffer.slice(0) });
  const upload = () => {
    const form = new FormData();
    form.append("file", png());
    form.append("organizationSlug", "kora");
    form.append("type", "logo");
    const request = new NextRequest("http://localhost/api/upload-org-image", { method: "POST" });
    Object.defineProperty(request, "formData", { value: async () => form });
    return uploadOrgImage.POST(request);
  };
  const del = () =>
    uploadOrgImage.DELETE(
      new NextRequest(`http://localhost/api/upload-org-image?path=${encodeURIComponent("organizations/kora/logo-1760000000000.png")}&type=logo`, { method: "DELETE" })
    );

  it.each(["c-org", "c-viewer"])("%s can't upload or delete the logo", async (who) => {
    state.clerk = who;
    expect((await upload()).status).toBe(403);
    expect((await del()).status).toBe(403);
    expect(state.db.writes()).toEqual([]);
  });

  it("owner uploads and deletes", async () => {
    state.clerk = "c-owner";
    const up = await upload();
    expect(up.status).toBe(200);
    expect((await up.json()).url).toContain("organizations/kora/logo-");
    expect((await del()).status).toBe(200);
  });
});

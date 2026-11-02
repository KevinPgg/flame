/** Payouts create (2026-11-02): the app sends a Bearer token and no Origin — must not be blocked by CSRF. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./fake-supabase";

const state = vi.hoisted(() => ({ db: null as any, clerk: "c-owner" as string | null }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: state.clerk })) }));
vi.mock("@/app/lib/supabase/server", () => ({
  get supabaseAdmin() {
    return state.db;
  },
}));
vi.mock("@/app/lib/stripe/stripe", () => ({ stripe: {} }));
import { POST } from "@/app/api/organizer/payouts/create/route";

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "http://192.168.100.57:3000";
  state.db = fakeSupabase({ users: [], organization_members: [], organizations: [] });
});

const post = (headers: Record<string, string>) =>
  POST(new NextRequest("http://localhost/api/organizer/payouts/create", { method: "POST", headers, body: "{}" }));

describe("payouts/create CSRF gate", () => {
  it("blocks a request with no Origin, no Referer and no Bearer token (browser cookie case)", async () => {
    expect((await post({})).status).toBe(403);
  });
  it("blocks a foreign Origin", async () => {
    expect((await post({ origin: "https://evil.example" })).status).toBe(403);
  });
  it("lets the app through: Bearer token, no Origin", async () => {
    const res = await post({ authorization: "Bearer tok_123" });
    expect(res.status).not.toBe(403);
  });
  it("still accepts the web app's own Origin", async () => {
    expect((await post({ origin: "http://192.168.100.57:3000" })).status).not.toBe(403);
  });
});

/** Fase 4.5: team invitations — invite by e-mail, answer in the app or by the e-mail link. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./fake-supabase";

const state = vi.hoisted(() => ({ db: null as any, clerk: "c-owner" as string | null, pushes: [] as any[] }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: state.clerk })) }));
vi.mock("@/app/lib/supabase/server", () => ({
  get supabaseAdmin() {
    return state.db;
  },
}));
vi.mock("@/app/lib/push-notifications", () => ({ sendPushNotification: vi.fn(async (p: unknown) => (state.pushes.push(p), true)) }));
import { POST as invite, GET as list } from "@/app/api/organizations/[id]/invitations/route";
import { GET as mine } from "@/app/api/me/invitations/route";
import { POST as answer } from "@/app/api/me/invitations/[invitationId]/route";
import { GET as byToken, POST as answerByToken } from "@/app/api/invitations/[token]/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();
let tables: Record<string, any[]>;

beforeEach(() => {
  delete process.env.BREVO_API_KEY;
  state.clerk = "c-owner";
  state.pushes = [];
  tables = {
    users: [
      { id: "u-owner", clerk_id: "c-owner", email: "owner@x.com", first_name: "Ana", last_name: null },
      { id: "u-org", clerk_id: "c-org", email: "org@x.com" },
      { id: "u-zoe", clerk_id: "c-zoe", email: "zoe@x.com", language: "es" },
      { id: "u-bo", clerk_id: "c-bo", email: "bo@x.com" },
    ],
    organization_members: [
      { id: "m1", user_id: "u-owner", organization_id: ORG, role: "owner" },
      { id: "m2", user_id: "u-org", organization_id: ORG, role: "organizer" },
    ],
    organizations: [{ id: ORG, name: "Kora", slug: "kora", logo_url: null }],
    organization_invitations: [
      { id: "inv-zoe", organization_id: ORG, email: "zoe@x.com", role: "admin", token: "tok-zoe-123456", status: "pending", created_at: "", expires_at: future, organizations: { id: ORG, name: "Kora", slug: "kora", logo_url: null } },
      { id: "inv-old", organization_id: ORG, email: "zoe@x.com", role: "organizer", token: "tok-old-123456", status: "pending", created_at: "", expires_at: past, organizations: { id: ORG, name: "Kora", slug: "kora", logo_url: null } },
    ],
  };
  state.db = fakeSupabase(tables);
});

const json = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, { method: "POST", body: JSON.stringify(body) });
const orgParams = { params: Promise.resolve({ id: ORG }) };

describe("owner / admin side", () => {
  it("invites any e-mail (normalized); a Flame user gets the bell/push", async () => {
    const res = await invite(json(`/api/organizations/${ORG}/invitations`, { email: "  New@X.com ", role: "organizer" }), orgParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invitation).toMatchObject({ email: "new@x.com", role: "organizer", state: "pending" });
    expect(body.invitation).not.toHaveProperty("token");
    expect(body.emailSent).toBe(false); // no BREVO_API_KEY in tests
    expect(state.pushes).toHaveLength(0); // new@x.com has no account
  });

  it("someone with an account is notified in the app, in their language", async () => {
    tables.organization_invitations.length = 0;
    await invite(json(`/api/organizations/${ORG}/invitations`, { email: "bo@x.com", role: "admin" }), orgParams);
    expect(state.pushes[0]).toMatchObject({ userId: "u-bo", type: "team_invitation", data: { orgId: ORG } });
  });

  it("already a member → 409; bad e-mail or role → 400; organizers can't invite", async () => {
    expect((await invite(json(`/api/organizations/${ORG}/invitations`, { email: "ORG@x.com", role: "admin" }), orgParams)).status).toBe(409);
    expect((await invite(json(`/api/organizations/${ORG}/invitations`, { email: "nope", role: "admin" }), orgParams)).status).toBe(400);
    expect((await invite(json(`/api/organizations/${ORG}/invitations`, { email: "a@b.co", role: "owner" }), orgParams)).status).toBe(400);
    state.clerk = "c-org";
    expect((await invite(json(`/api/organizations/${ORG}/invitations`, { email: "a@b.co", role: "admin" }), orgParams)).status).toBe(403);
  });

  it("list: pending ones with expired marked; no tokens", async () => {
    const { invitations } = await (await list(new NextRequest(`http://localhost/api/organizations/${ORG}/invitations`), orgParams)).json();
    expect(invitations.map((i: any) => [i.id, i.state])).toEqual([["inv-zoe", "pending"], ["inv-old", "expired"]]);
    expect(invitations[0]).not.toHaveProperty("token");
  });
});

describe("invited person", () => {
  it("sees only open, unexpired invitations to their e-mail", async () => {
    state.clerk = "c-zoe";
    const { invitations } = await (await mine()).json();
    expect(invitations.map((i: any) => i.id)).toEqual(["inv-zoe"]);
    expect(invitations[0].organization.name).toBe("Kora");
  });

  it("accept → becomes a member with the invited role", async () => {
    state.clerk = "c-zoe";
    const res = await answer(json("/api/me/invitations/inv-zoe", { action: "accept" }), { params: Promise.resolve({ invitationId: "inv-zoe" }) });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("accepted");
    const w = state.db.writes();
    expect(w.map((x: any) => [x.table, x.op])).toEqual([["organization_members", "insert"], ["organization_invitations", "update"]]);
  });

  it("someone else can't answer it; an expired one is 410", async () => {
    state.clerk = "c-bo";
    expect((await answer(json("/api/me/invitations/inv-zoe", { action: "accept" }), { params: Promise.resolve({ invitationId: "inv-zoe" }) })).status).toBe(404);
    state.clerk = "c-zoe";
    expect((await answer(json("/api/me/invitations/inv-old", { action: "accept" }), { params: Promise.resolve({ invitationId: "inv-old" }) })).status).toBe(410);
  });

  it("e-mail link: public preview; answering needs the invited account", async () => {
    const tok = { params: Promise.resolve({ token: "tok-zoe-123456" }) };
    state.clerk = null;
    const info = await (await byToken(new NextRequest("http://localhost/api/invitations/tok-zoe-123456"), tok)).json();
    expect(info).toMatchObject({ role: "admin", email: "zoe@x.com", state: "pending", organization: { name: "Kora" } });
    expect((await answerByToken(json("/api/invitations/tok-zoe-123456", { action: "accept" }), tok)).status).toBe(401);
    state.clerk = "c-bo";
    const wrong = await answerByToken(json("/api/invitations/tok-zoe-123456", { action: "accept" }), tok);
    expect(wrong.status).toBe(403);
    expect((await wrong.json()).code).toBe("WRONG_ACCOUNT");
    state.clerk = "c-zoe";
    expect((await answerByToken(json("/api/invitations/tok-zoe-123456", { action: "decline" }), tok)).status).toBe(200);
  });
});

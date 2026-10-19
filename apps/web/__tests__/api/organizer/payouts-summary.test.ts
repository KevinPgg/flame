/** Payouts v2 (2026-10-18): live Stripe summary for owners/admins. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./fake-supabase";

const state = vi.hoisted(() => ({ db: null as any, clerk: null as string | null, fail: false }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: state.clerk })) }));
vi.mock("@/app/lib/supabase/server", () => ({
  get supabaseAdmin() {
    return state.db;
  },
}));
const stripeMock = vi.hoisted(() => ({
  balance: { retrieve: vi.fn() },
  payouts: { list: vi.fn() },
  accounts: { retrieve: vi.fn() },
}));
vi.mock("@/app/lib/stripe/stripe", () => ({ stripe: stripeMock }));
import { GET } from "@/app/api/organizer/payouts/summary/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const NOSTRIPE = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  const tables: Record<string, any[]> = {
    users: [
      { id: "u-owner", clerk_id: "c-owner" },
      { id: "u-admin", clerk_id: "c-admin" },
      { id: "u-org", clerk_id: "c-org" },
    ],
    organization_members: [
      { id: "m1", user_id: "u-owner", organization_id: ORG, role: "owner" },
      { id: "m2", user_id: "u-admin", organization_id: ORG, role: "admin" },
      { id: "m3", user_id: "u-org", organization_id: ORG, role: "organizer" },
      { id: "m4", user_id: "u-owner", organization_id: NOSTRIPE, role: "owner" },
    ],
    organizations: [
      { id: ORG, stripe_account_id: "acct_1" },
      { id: NOSTRIPE, stripe_account_id: null },
    ],
  };
  state.db = Object.assign(fakeSupabase(tables), { tables });
  stripeMock.balance.retrieve.mockReset().mockResolvedValue({
    available: [{ amount: 1000, currency: "usd", source_types: {} }],
    pending: [{ amount: 500, currency: "usd" }],
  });
  stripeMock.payouts.list.mockReset().mockResolvedValue({
    data: [{ id: "po_1", amount: 900, currency: "usd", status: "paid", arrival_date: 1, created: 0, automatic: false, destination: "ba_1" }],
  });
  stripeMock.accounts.retrieve.mockReset().mockResolvedValue({
    default_currency: "usd",
    settings: { payouts: { schedule: { interval: "manual" } } },
    external_accounts: { data: [{ object: "bank_account", bank_name: "Banco Pichincha", last4: "6721", currency: "usd", routing_number: "x", default_for_currency: true }] },
  });
});

const get = (who: string | null, org = ORG) => {
  state.clerk = who;
  return GET(new NextRequest(`http://localhost/api/organizer/payouts/summary?organizationId=${org}`));
};

describe("GET /api/organizer/payouts/summary", () => {
  it("owner/admin get balance, history and bank (no routing numbers or other Stripe fields leak)", async () => {
    for (const who of ["c-owner", "c-admin"]) {
      const res = await get(who);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        connected: true,
        defaultCurrency: "USD",
        schedule: "manual",
        balance: { available: [{ amount: 1000, currency: "usd" }], pending: [{ amount: 500, currency: "usd" }] },
        payouts: [{ id: "po_1", amount: 900, currency: "usd", status: "paid", arrival_date: 1, created: 0, automatic: false }],
        bank: { bankName: "Banco Pichincha", last4: "6721", currency: "USD" },
      });
    }
    expect(stripeMock.balance.retrieve).toHaveBeenCalledWith({}, { stripeAccount: "acct_1" });
  });

  it("organizer → 403 and Stripe is never called; anonymous → 401", async () => {
    expect((await get("c-org")).status).toBe(403);
    expect((await get(null)).status).toBe(401);
    expect(stripeMock.balance.retrieve).not.toHaveBeenCalled();
  });

  it("no Stripe account → connected:false; Stripe error → 502", async () => {
    expect(await (await get("c-owner", NOSTRIPE)).json()).toEqual({ connected: false });
    stripeMock.payouts.list.mockRejectedValueOnce(new Error("stripe down"));
    expect((await get("c-owner")).status).toBe(502);
  });
});

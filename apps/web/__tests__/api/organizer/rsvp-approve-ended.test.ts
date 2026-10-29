/**
 * Fase 3.5 (2026-10-29): approving an RSVP captures the card. Once the event ended the UI hides
 * the button (canDecideRsvp); the API refuses too (409 EVENT_ENDED) and touches nothing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./fake-supabase";

const state = vi.hoisted(() => ({ db: null as any }));
const capture = vi.hoisted(() => vi.fn());
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: "c-owner" })) }));
vi.mock("@/app/lib/supabase/server", () => ({ get supabaseAdmin() { return state.db; } }));
vi.mock("@/app/lib/stripe/stripe", () => ({ stripe: { paymentIntents: { capture, retrieve: vi.fn(), cancel: vi.fn() } } }));
vi.mock("@/app/lib/email/ticket-notifications", () => ({ sendTicketConfirmationEmail: vi.fn() }));
vi.mock("@/app/lib/push-notifications", () => ({ sendPushNotification: vi.fn() }));
vi.mock("@/app/lib/orders", () => ({ createOrder: vi.fn(), generateTickets: vi.fn() }));
vi.mock("@/app/lib/utils/event-rsvp-authz", () => ({ canManageEventRsvps: vi.fn(async () => true) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { PATCH } from "@/app/api/organizer/rsvps/[id]/approve/route";

const seed = (endsAt: string) => {
  state.db = fakeSupabase({
    users: [{ id: "u-owner", clerk_id: "c-owner" }],
    rsvps: [
      {
        id: "r1", status: "pending", requested_quantity: 1, stripe_payment_intent_id: "pi_1",
        users: { id: "u1", email: "a@x.com", first_name: "A", last_name: null },
        events: { id: "ev", name: "Ev", starts_at: endsAt, ends_at: endsAt, venue: "V", timezone: "UTC", organization_id: "org", currency: "USD" },
        ticket_tiers: { id: "t", name: "GA", price_cents: 1000 },
      },
    ],
  });
  return state.db;
};
const approve = () =>
  PATCH(new NextRequest("http://localhost/api/organizer/rsvps/r1/approve", { method: "PATCH" }), { params: Promise.resolve({ id: "r1" }) } as any);

beforeEach(() => {
  capture.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("RSVP approve after the event ended", () => {
  it("returns 409 EVENT_ENDED without writing or charging", async () => {
    const db = seed(new Date(Date.now() - 3_600_000).toISOString());
    const res = await approve();
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).code).toBe("EVENT_ENDED");
    expect(db.writes()).toEqual([]);
    expect(capture).not.toHaveBeenCalled();
  });

  it("an upcoming event gets past the guard", async () => {
    seed(new Date(Date.now() + 86_400_000).toISOString());
    const res = await approve();
    expect(res.status).not.toBe(409);
  });
});

/**
 * v1 organizer page (server-rendered): what it hands to the dashboard must follow the same role
 * rule as the API (organizer → assigned events only) and stay exact past 1000 rows.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeSupabase } from "./fake-supabase";
import { organizerDataTables, ORG, EV_CO } from "./organizer-data-fixture";
import { EV_A, EV_B } from "./purchases-fixture";

const state = vi.hoisted(() => ({ db: null as any, clerk: "c-owner" }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: state.clerk })),
  currentUser: vi.fn(async () => ({ id: state.clerk, firstName: "K", lastName: "P", emailAddresses: [] })),
}));
vi.mock("@/app/lib/supabase/server", () => ({
  get supabaseAdmin() {
    return state.db;
  },
}));
vi.mock("@/app/lib/auth", () => ({
  resolveDbUserFromClerkId: async (clerk: string) => ({ id: clerk.replace("c-", "u-") }),
}));
vi.mock("@/app/components", () => ({ Navbar: () => null }));
vi.mock("@/app/components/OrganizerDashboard", () => ({ default: () => null }));
import OrganizerPage from "@/app/organizer/page";

function tables() {
  const t = organizerDataTables();
  const org = t.organizations[0];
  t.users.push({ id: "u-org", clerk_id: "c-org", email: "org@x.com" });
  t.organization_members.push({ user_id: "u-org", organization_id: ORG, role: "organizer", organizations: org } as never);
  t.event_assignments.push({ id: "as-org", event_id: EV_A, user_id: "u-org", organization_id: ORG, cohost_organization_id: null } as never);
  return t;
}

async function dashboardProps(who: "owner" | "org", t = tables()) {
  state.clerk = `c-${who}`;
  state.db = fakeSupabase(t as never);
  const el = (await OrganizerPage({ searchParams: Promise.resolve({ org: "kora" }) })) as React.ReactElement<{
    children: React.ReactElement<any>[];
  }>;
  const children = React.Children.toArray(el.props.children) as React.ReactElement<any>[];
  return children.find((c) => c.props && "events" in c.props)!.props as {
    events: Array<{ id: string; pending_rsvps: number; totalRevenue: number }>;
    initialCohostEvents: Array<{ event: { id: string; totalRevenue: number; pending_rsvps: number } }>;
  };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("organizer page (SSR)", () => {
  it("owner: every event and the co-hosted one, with batched co-host revenue", async () => {
    const p = await dashboardProps("owner");
    expect(p.events.map((e) => e.id).sort()).toEqual([EV_A, EV_B].sort());
    expect(p.initialCohostEvents.map((c) => [c.event.id, c.event.totalRevenue, c.event.pending_rsvps])).toEqual([[EV_CO, 3000, 1]]);
  });

  it("organizer: only the assigned event reaches the HTML", async () => {
    const p = await dashboardProps("org");
    expect(p.events.map((e) => e.id)).toEqual([EV_A]);
    expect(p.initialCohostEvents).toEqual([]);
  });

  it("RSVP counts stay exact past 1000 rows", async () => {
    const t = tables();
    for (let i = 0; i < 1500; i++)
      t.rsvps.push({ id: `bulk-${String(i).padStart(5, "0")}`, event_id: EV_B, status: "pending", stripe_payment_intent_id: null, registration_data: null, ticket_tier_id: null, requested_quantity: 1 } as never);
    const p = await dashboardProps("owner", t);
    expect(p.events.find((e) => e.id === EV_B)!.pending_rsvps).toBe(1500);
  });
});

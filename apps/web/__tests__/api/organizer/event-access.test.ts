/**
 * Organizer API authorization (2026-10-15): inside an organization, owner/admin act on every
 * event, an organizer only on events assigned to them, a viewer on none. Before this, every
 * route below only checked "is a member of the organization".
 *
 * Each route runs for real against an in-memory database. "Passes" = the request got past the
 * permission check (it may then fail later on purpose, e.g. a tier that doesn't exist → 404).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./fake-supabase";

const state = vi.hoisted(() => ({ clerk: null as string | null, db: null as any }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: state.clerk })),
  currentUser: vi.fn(async () => (state.clerk ? { id: state.clerk, emailAddresses: [] } : null)),
}));
vi.mock("@/app/lib/supabase/server", () => ({
  get supabaseAdmin() {
    return state.db;
  },
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => new Proxy({}, { get: (_t, k) => (state.db as any)[k] }),
}));
vi.mock("@/app/lib/auth", () => ({
  resolveDbUserFromClerkId: async (clerkId: string) => {
    const u = state.db.tables.users.find((x: any) => x.clerk_id === clerkId);
    if (!u) throw new Error("User not found");
    return u;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/app/lib/stripe/stripe", () => ({ stripe: { paymentIntents: { cancel: vi.fn() } } }));
vi.mock("@/app/lib/push-notifications", () => ({
  sendPushNotification: vi.fn(async () => undefined),
  sendPushToEventTicketHolders: vi.fn(async () => undefined),
}));
vi.mock("@/app/lib/email/promotional-ticket-notifications", () => ({ sendPromotionalTicketEmail: vi.fn(async () => undefined) }));
vi.mock("@/app/lib/email/ticket-notifications", () => ({ sendTicketConfirmationEmail: vi.fn(async () => undefined) }));
vi.mock("@/app/lib/email/date-change-notifications", () => ({ sendDateChangeEmail: vi.fn(async () => undefined) }));

import { getEventAccess, requireEventAccess, visibleEventIds } from "@/app/lib/utils/event-access";
import { canManageEventRsvps } from "@/app/lib/utils/event-rsvp-authz";
import * as promoTickets from "@/app/api/organizer/promotional-tickets/route";
import * as promoTicketsList from "@/app/api/organizer/promotional-tickets/[eventId]/route";
import * as bankTickets from "@/app/api/organizer/bank-transfer-tickets/route";
import * as promoCodes from "@/app/api/organizer/promotional-codes/route";
import * as promoCodeId from "@/app/api/organizer/promotional-codes/[id]/route";
import * as promoterLinks from "@/app/api/organizer/promoter-links/route";
import * as promoterLinkId from "@/app/api/organizer/promoter-links/[id]/route";
import * as forceReduce from "@/app/api/organizer/tiers/[tierId]/force-reduce/route";
import * as tiers from "@/app/api/ticket-tiers/route";
import * as events from "@/app/api/events/route";
import * as searchUsers from "@/app/api/organizer/search-users/route";
import * as rsvps from "@/app/api/organizer/rsvps/route";
import * as organizerData from "@/app/api/organizer/data/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const EV = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EV2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TIER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MISSING_TIER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const people = {
  owner: { id: "u-owner", role: "owner" },
  admin: { id: "u-admin", role: "admin" },
  assigned: { id: "u-assigned", role: "organizer" },
  unassigned: { id: "u-unassigned", role: "organizer" },
  /** Organizer of ORG whose only assignment row was written by another organization. */
  foreignAssignment: { id: "u-foreign", role: "organizer" },
  viewer: { id: "u-viewer", role: "viewer" },
  outsider: { id: "u-outsider", role: null },
} as const;
type Who = keyof typeof people;

const orgObj = { id: ORG, name: "Kora", slug: "kora", approved: true, created_at: "2025-01-01T00:00:00Z", logo_url: null };
const members = Object.values(people)
  .filter((p) => p.role)
  .map((p) => ({ user_id: p.id, organization_id: ORG, role: p.role, organizations: orgObj }));

function seed(opts: { failTables?: string[] } = {}) {
  const future = new Date(Date.now() + 10 * 86_400_000).toISOString();
  const eventRow = (id: string) => ({
    id,
    name: `Event ${id.slice(0, 4)}`,
    slug: `ev-${id.slice(0, 4)}`,
    organization_id: ORG,
    starts_at: future,
    ends_at: future,
    venue: "Venue",
    city: "Guayaquil",
    timezone: "America/Guayaquil",
    currency: "USD",
    status: "published",
    organizations: { id: ORG, name: "Kora", organization_members: members.map((m) => ({ user_id: m.user_id })) },
  });
  const tables: Record<string, any[]> = {
    users: Object.entries(people).map(([k, p]) => ({
      id: p.id,
      clerk_id: `c-${k}`,
      email: `${k}@x.com`,
      first_name: k,
      last_name: "T",
      role: "organizer",
    })),
    organization_members: members,
    organizations: [orgObj],
    event_assignments: [
      { id: "as1", event_id: EV, user_id: people.assigned.id, organization_id: ORG, cohost_organization_id: null },
      { id: "as2", event_id: EV, user_id: people.foreignAssignment.id, organization_id: OTHER_ORG, cohost_organization_id: null },
    ],
    events: [eventRow(EV), eventRow(EV2)],
    ticket_tiers: [
      {
        id: TIER,
        event_id: EV,
        name: "General",
        quantity_total: 100,
        quantity_sold: 0,
        sales_start: null,
        sales_end: future,
        events: { id: EV, organization_id: ORG, starts_at: future, ends_at: future, name: "Event", slug: "ev", venue: "V", timezone: "America/Guayaquil" },
      },
    ],
    promotional_codes: [
      { id: "pc1", event_id: EV, code: "SAVE10", usage_count: 0, events: { id: EV, organization_id: ORG, organizations: { id: ORG, organization_members: members.map((m) => ({ user_id: m.user_id })) } } },
    ],
    promoter_links: [{ id: "pl1", event_id: EV, promoter_code: "ANA", events: { organization_id: ORG } }],
  };
  const db = fakeSupabase(tables, opts);
  state.db = Object.assign(db, { tables });
  return db;
}

const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = <T,>(p: T) => ({ params: Promise.resolve(p) });

async function call(who: Who, fn: () => Promise<Response>) {
  state.clerk = `c-${who}`;
  const db = seed();
  const res = await fn();
  const json = (await res.clone().json().catch(() => ({}))) as { error?: string };
  return { status: res.status, error: json.error, writes: db.writes(), json };
}

const future = () => new Date(Date.now() + 5 * 86_400_000).toISOString();

/** Every event-scoped organizer route, called for the event EV. */
const ROUTES: Array<[string, () => Promise<Response>]> = [
  ["POST promotional-tickets", () => promoTickets.POST(req("/api/organizer/promotional-tickets", "POST", { event_id: EV, ticket_tier_id: MISSING_TIER, quantity: 1, recipient_email: "guest@x.com" }))],
  ["GET promotional-tickets/[eventId]", () => promoTicketsList.GET(req(`/api/organizer/promotional-tickets/${EV}`), params({ eventId: EV }))],
  ["POST bank-transfer-tickets", () => bankTickets.POST(req("/api/organizer/bank-transfer-tickets", "POST", { event_id: EV, ticket_tier_id: MISSING_TIER, quantity: 1, recipient_email: "guest@x.com" }))],
  ["POST promotional-codes", () => promoCodes.POST(req("/api/organizer/promotional-codes", "POST", { event_id: EV, code: "NEW10", discount_percentage: "10", usage_limit: "5" }))],
  ["GET promotional-codes", () => promoCodes.GET(req(`/api/organizer/promotional-codes?event_id=${EV}`))],
  ["DELETE promotional-codes/[id]", () => promoCodeId.DELETE(req("/api/organizer/promotional-codes/pc1", "DELETE"), params({ id: "pc1" }))],
  ["GET promoter-links", () => promoterLinks.GET(req(`/api/organizer/promoter-links?event_id=${EV}`))],
  ["POST promoter-links", () => promoterLinks.POST(req("/api/organizer/promoter-links", "POST", { event_id: EV, promoter_code: "LUIS", promoter_name: null }))],
  ["DELETE promoter-links/[id]", () => promoterLinkId.DELETE(req("/api/organizer/promoter-links/pl1", "DELETE"), params({ id: "pl1" }))],
  ["POST tiers/[tierId]/force-reduce", () => forceReduce.POST(req(`/api/organizer/tiers/${TIER}/force-reduce`, "POST", { new_quantity_total: 50 }), params({ tierId: TIER }))],
  ["GET ticket-tiers", () => tiers.GET(req(`/api/ticket-tiers?event_id=${EV}`))],
  ["POST ticket-tiers", () => tiers.POST(req("/api/ticket-tiers", "POST", { event_id: EV, name: "VIP", price_cents: 1000, quantity_total: 10, per_user_limit: 2, sales_end: future() }))],
  ["PATCH ticket-tiers", () => tiers.PATCH(req("/api/ticket-tiers", "PATCH", { id: TIER, is_hidden: true }))],
  ["DELETE ticket-tiers", () => tiers.DELETE(req(`/api/ticket-tiers?id=${TIER}`, "DELETE"))],
  ["PATCH events", () => events.PATCH(req("/api/events", "PATCH", { id: EV, name: "Renamed" }))],
  ["GET rsvps", () => rsvps.GET(req(`/api/organizer/rsvps?event_id=${EV}`))],
];

const passed = (r: { status: number; error?: string }) =>
  r.status !== 401 && r.status !== 403 && r.error !== "Failed to verify permissions";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe.each(ROUTES)("%s", (_name, run) => {
  it.each(["owner", "admin", "assigned"] as const)("%s passes", async (who) => {
    const r = await call(who, run);
    expect(passed(r), `${who}: ${r.status} ${r.error}`).toBe(true);
  });

  it.each(["unassigned", "foreignAssignment", "viewer", "outsider"] as const)("%s → 403, nothing written", async (who) => {
    const r = await call(who, run);
    expect(r.status, `${who}: ${r.error}`).toBe(403);
    expect(r.writes).toEqual([]);
  });
});

describe("POST /api/events (create) — owner/admin only, like the web and app UIs", () => {
  const body = () => ({
    event: { organization_id: ORG, name: "New", slug: "new-ev", city: "Guayaquil", venue: "V", starts_at: future(), ends_at: future() },
    ticket_tiers: [{ name: "GA", price_cents: 0, quantity_total: 10, per_user_limit: 2, sales_end: future() }],
  });
  it.each(["owner", "admin"] as const)("%s passes", async (who) => {
    const r = await call(who, () => events.POST(req("/api/events", "POST", body())));
    expect(passed(r), `${r.status} ${r.error}`).toBe(true);
  });
  it.each(["assigned", "viewer", "outsider"] as const)("%s → 403", async (who) => {
    const r = await call(who, () => events.POST(req("/api/events", "POST", body())));
    expect(r.status).toBe(403);
    expect(r.writes).toEqual([]);
  });
});

describe("GET /api/organizer/search-users — only roles that can send tickets", () => {
  it.each(["owner", "assigned"] as const)("%s passes", async (who) => {
    const r = await call(who, () => searchUsers.GET(req("/api/organizer/search-users?email=owner%40x.com")));
    expect(passed(r)).toBe(true);
  });
  it.each(["viewer", "outsider"] as const)("%s → 403", async (who) => {
    const r = await call(who, () => searchUsers.GET(req("/api/organizer/search-users?email=owner%40x.com")));
    expect(r.status).toBe(403);
  });
});

describe("GET /api/organizer/data — sales data never leaves the server for unassigned events", () => {
  const ids = async (who: Who) => {
    const r = await call(who, () => organizerData.GET(req("/api/organizer/data?org=kora")));
    expect(r.status, String(r.error)).toBe(200);
    return ((r.json as { events?: Array<{ id: string }> }).events ?? []).map((e) => e.id).sort();
  };
  it("owner and admin get every event", async () => {
    expect(await ids("owner")).toEqual([EV, EV2].sort());
    expect(await ids("admin")).toEqual([EV, EV2].sort());
  });
  it("an organizer gets only the events assigned to them", async () => {
    expect(await ids("assigned")).toEqual([EV]);
    expect(await ids("unassigned")).toEqual([]);
    expect(await ids("foreignAssignment")).toEqual([]);
  });
  it("a viewer gets no events", async () => {
    expect(await ids("viewer")).toEqual([]);
  });
});

describe("event-access helpers", () => {
  it("getEventAccess: roles and assignments", async () => {
    const db = seed() as any;
    const access = (u: string) => getEventAccess(db, u, EV, ORG);
    expect(await access(people.owner.id)).toEqual({ allowed: true, role: "owner" });
    expect(await access(people.assigned.id)).toEqual({ allowed: true, role: "organizer" });
    expect(await access(people.unassigned.id)).toEqual({ allowed: false, role: "organizer" });
    expect(await access(people.foreignAssignment.id)).toEqual({ allowed: false, role: "organizer" });
    expect(await access(people.viewer.id)).toEqual({ allowed: false, role: "viewer" });
    expect(await access(people.outsider.id)).toEqual({ allowed: false, role: null });
    // The assignment of one event never opens another one.
    expect(await getEventAccess(db, people.assigned.id, EV2, ORG)).toEqual({ allowed: false, role: "organizer" });
  });

  it("a failing query is a 500, never an allow", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const noMembers = seed({ failTables: ["organization_members"] }) as any;
    expect(await getEventAccess(noMembers, people.owner.id, EV, ORG)).toMatchObject({ allowed: false, failed: true });
    const res = await requireEventAccess(noMembers, people.owner.id, EV, ORG);
    expect(res?.status).toBe(500);
    const noAssignments = seed({ failTables: ["event_assignments"] }) as any;
    expect(await getEventAccess(noAssignments, people.assigned.id, EV, ORG)).toMatchObject({ allowed: false, failed: true });
    await expect(visibleEventIds(noAssignments, people.assigned.id, ORG, "organizer")).rejects.toThrow();
  });

  it("requireEventAccess: null when allowed, 403 otherwise", async () => {
    const db = seed() as any;
    expect(await requireEventAccess(db, people.admin.id, EV, ORG)).toBeNull();
    expect((await requireEventAccess(db, people.unassigned.id, EV, ORG))?.status).toBe(403);
  });

  it("visibleEventIds: null = all for owner/admin; assignments for organizer; none otherwise", async () => {
    const db = seed() as any;
    expect(await visibleEventIds(db, people.owner.id, ORG, "owner")).toBeNull();
    expect(await visibleEventIds(db, people.admin.id, ORG, "admin")).toBeNull();
    expect([...(await visibleEventIds(db, people.assigned.id, ORG, "organizer"))!]).toEqual([EV]);
    expect([...(await visibleEventIds(db, people.foreignAssignment.id, ORG, "organizer"))!]).toEqual([]);
    expect([...(await visibleEventIds(db, people.viewer.id, ORG, "viewer"))!]).toEqual([]);
  });

  it("canManageEventRsvps: primary side follows role + assignment; cohost owner/admin still allowed", async () => {
    const db = seed() as any;
    db.tables.organization_members.push({ user_id: people.unassigned.id, organization_id: OTHER_ORG, role: "admin" });
    db.tables.event_assignments.push({ id: "co1", event_id: EV, user_id: null, organization_id: ORG, cohost_organization_id: OTHER_ORG });
    expect(await canManageEventRsvps(db, people.assigned.id, ORG, EV)).toBe(true);
    expect(await canManageEventRsvps(db, people.viewer.id, ORG, EV)).toBe(false);
    // Unassigned organizer in ORG, but admin of the cohost org → allowed via the cohost path.
    expect(await canManageEventRsvps(db, people.unassigned.id, ORG, EV)).toBe(true);
    expect(await canManageEventRsvps(db, people.foreignAssignment.id, ORG, EV)).toBe(false);
  });
});

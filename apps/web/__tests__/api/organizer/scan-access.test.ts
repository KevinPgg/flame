/**
 * Door scanning by person (2026-10-16): members of the event's org (any role) and of co-host
 * orgs, platform admins, and people designated for the event can verify / check in. The shared
 * per-event code still works until SCANNER_ACCESS_CODES=off.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./fake-supabase";

const state = vi.hoisted(() => ({ db: null as any, clerk: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: state.clerk })) }));
vi.mock("@/app/lib/supabase/server", () => ({
  get supabaseAdmin() {
    return state.db;
  },
}));

import { getScanAccess, scannableEventIds } from "@/app/lib/utils/scan-access";
import * as verify from "@/app/api/qr-scanner/verify/route";
import * as checkin from "@/app/api/qr-scanner/checkin/route";
import * as validateCode from "@/app/api/qr-scanner/validate-code/route";
import * as scanners from "@/app/api/organizer/events/[id]/scanners/route";
import * as scannerEvents from "@/app/api/qr-scanner/events/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const COHOST = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const EV = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EV2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PAST = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const users = {
  owner: { id: "u-owner", role: "organizer" },
  viewerMember: { id: "u-viewer", role: "user" },
  unassignedOrganizer: { id: "u-unassigned", role: "organizer" },
  cohostMember: { id: "u-cohost", role: "organizer" },
  door: { id: "u-door", role: "user" },
  stranger: { id: "u-stranger", role: "user" },
  otherOrgOrganizer: { id: "u-other", role: "organizer" },
  platformAdmin: { id: "u-padmin", role: "admin" },
} as const;
type Who = keyof typeof users;

function seed() {
  const event = (id: string, ends_at = "2030-01-01T06:00:00Z") => ({
    id,
    name: `Event ${id.slice(0, 2)}`,
    organization_id: ORG,
    qr_scanner_code: "DOOR1",
    status: "published",
    starts_at: "2030-01-01T00:00:00Z",
    ends_at,
    venue: "V",
    organizations: { name: "Kora" },
  });
  const tables: Record<string, any[]> = {
    users: Object.entries(users).map(([k, u]) => ({ ...u, clerk_id: `c-${k}`, email: `${k.toLowerCase()}@x.com`, first_name: k, last_name: null })),
    organization_members: [
      { id: "m1", user_id: "u-owner", organization_id: ORG, role: "owner" },
      { id: "m2", user_id: "u-viewer", organization_id: ORG, role: "viewer" },
      { id: "m3", user_id: "u-unassigned", organization_id: ORG, role: "organizer" },
      { id: "m4", user_id: "u-cohost", organization_id: COHOST, role: "organizer" },
      { id: "m5", user_id: "u-other", organization_id: OTHER, role: "owner" },
    ],
    events: [event(EV), event(EV2), event(PAST, "2020-01-01T06:00:00Z")],
    event_assignments: [{ id: "a1", event_id: EV, organization_id: ORG, cohost_organization_id: COHOST, user_id: null }],
    event_scanners: [{ id: "s1", event_id: EV, user_id: "u-door", created_at: "2026-10-01T00:00:00Z", users: { email: "door@x.com", first_name: "door", last_name: null } }],
    tickets: [
      {
        id: "t1",
        order_id: "o1",
        status: "issued",
        checked_in_at: null,
        qr_token: "q1",
        attendee_name: "Ana",
        attendee_email: "ana@x.com",
        created_at: "2026-10-01T00:00:00Z",
        ticket_tier: { name: "General", price_cents: 2000 },
        events: event(EV),
        order: { id: "o1", quantity: 1 },
      },
      {
        id: "t2",
        order_id: "o2",
        status: "issued",
        checked_in_at: null,
        qr_token: "q2",
        attendee_name: "Bo",
        attendee_email: "bo@x.com",
        created_at: "2026-10-01T00:00:00Z",
        ticket_tier: { name: "General", price_cents: 2000 },
        events: event(EV2),
        order: { id: "o2", quantity: 1 },
      },
    ],
  };
  state.db = Object.assign(fakeSupabase(tables), { tables });
  return state.db;
}

const json = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const verifyAs = (who: Who | null, eventId = EV, orderId = "o1", extra: Record<string, unknown> = {}) => {
  state.clerk = who ? `c-${who}` : null;
  return verify.POST(json("/api/qr-scanner/verify", "POST", { qrData: { orderId, eventId, ticketNumber: 1 }, deviceId: "d1", ...extra }));
};
const checkinAs = (who: Who | null, ticketId = "t1", extra: Record<string, unknown> = {}) => {
  state.clerk = who ? `c-${who}` : null;
  return checkin.POST(json("/api/qr-scanner/checkin", "POST", { ticketId, deviceId: "d1", isPromotionalTicket: false, ...extra }));
};

beforeEach(() => {
  seed();
  delete process.env.SCANNER_ACCESS_CODES;
});
afterEach(() => {
  delete process.env.SCANNER_ACCESS_CODES;
});

describe("getScanAccess", () => {
  const ev = { id: EV, organization_id: ORG };
  it.each([
    ["owner", "member"],
    ["viewerMember", "member"],
    ["unassignedOrganizer", "member"],
    ["cohostMember", "cohost"],
    ["door", "designated"],
    ["platformAdmin", "platform_admin"],
  ] as const)("%s → allowed (%s)", async (who, via) => {
    expect(await getScanAccess(state.db, users[who], ev)).toEqual({ allowed: true, via });
  });

  it.each(["stranger", "otherOrgOrganizer"] as const)("%s → denied", async (who) => {
    expect(await getScanAccess(state.db, users[who], ev)).toEqual({ allowed: false });
  });

  it("designation is per event", async () => {
    expect((await getScanAccess(state.db, users.door, { id: EV2, organization_id: ORG })).allowed).toBe(false);
  });

  it("DB error → failed (500), never allowed", async () => {
    state.db = fakeSupabase({}, { failTables: ["organization_members"] });
    expect(await getScanAccess(state.db, users.owner, ev)).toEqual({ allowed: false, failed: true });
  });

  it("scannable events for the picker", async () => {
    expect((await scannableEventIds(state.db, users.owner))!.sort()).toEqual([EV, EV2, PAST].sort());
    expect(await scannableEventIds(state.db, users.cohostMember)).toEqual([EV]);
    expect(await scannableEventIds(state.db, users.door)).toEqual([EV]);
    expect(await scannableEventIds(state.db, users.stranger)).toEqual([]);
    expect(await scannableEventIds(state.db, users.platformAdmin)).toBeNull();
  });
});

describe("POST /api/qr-scanner/verify (signed in)", () => {
  it.each(["owner", "viewerMember", "cohostMember", "door", "platformAdmin"] as const)("%s can verify", async (who) => {
    const res = await verifyAs(who);
    expect(res.status).toBe(200);
    expect((await res.json()).ticket.attendee_name).toBe("Ana");
  });

  it.each(["stranger", "otherOrgOrganizer"] as const)("%s gets 403 and no attendee data", async (who) => {
    const res = await verifyAs(who);
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).not.toContain("ana@x.com");
  });

  it("a person designated for one event can't verify another event's tickets", async () => {
    expect((await verifyAs("door", EV2, "o2")).status).toBe(403);
  });

  it("anonymous without code → 401", async () => {
    expect((await verifyAs(null)).status).toBe(401);
  });

  it("access code still works by default; SCANNER_ACCESS_CODES=off turns it off", async () => {
    expect((await verifyAs(null, EV, "o1", { accessCode: "DOOR1" })).status).toBe(200);
    process.env.SCANNER_ACCESS_CODES = "off";
    expect((await verifyAs(null, EV, "o1", { accessCode: "DOOR1" })).status).toBe(403);
  });
});

describe("POST /api/qr-scanner/checkin (signed in)", () => {
  it("designated door staff can check in", async () => {
    const res = await checkinAs("door");
    expect(res.status).toBe(200);
    expect(state.db.writes().map((w: { op: string; table: string }) => `${w.op} ${w.table}`)).toEqual(["update tickets"]);
  });

  it("member with viewer role can check in (members scan by default)", async () => {
    expect((await checkinAs("viewerMember")).status).toBe(200);
  });

  it.each(["stranger", "otherOrgOrganizer"] as const)("%s can't check in, nothing written", async (who) => {
    expect((await checkinAs(who)).status).toBe(403);
    expect(state.db.writes()).toEqual([]);
  });

  it("code off → 403 even with the right code", async () => {
    process.env.SCANNER_ACCESS_CODES = "off";
    expect((await checkinAs(null, "t1", { accessCode: "DOOR1" })).status).toBe(403);
  });

  it("validate-code honours the switch", async () => {
    state.clerk = null;
    expect((await validateCode.POST(json("/api/qr-scanner/validate-code", "POST", { code: "DOOR1" }))).status).toBe(200);
    process.env.SCANNER_ACCESS_CODES = "off";
    expect((await validateCode.POST(json("/api/qr-scanner/validate-code", "POST", { code: "DOOR1" }))).status).toBe(403);
  });
});

describe("/api/organizer/events/[id]/scanners", () => {
  const params = { params: Promise.resolve({ id: EV }) };
  const as = (who: Who) => (state.clerk = `c-${who}`);

  it("owner lists, adds by e-mail (any account) and removes", async () => {
    as("owner");
    const list = await (await scanners.GET(json(`/api/organizer/events/${EV}/scanners`, "GET"), params)).json();
    expect(list.scanners).toEqual([{ id: "s1", user_id: "u-door", created_at: "2026-10-01T00:00:00Z", email: "door@x.com", first_name: "door", last_name: null }]);

    const add = await scanners.POST(json(`/api/organizer/events/${EV}/scanners`, "POST", { email: " Stranger@X.com " }), params);
    expect(add.status).toBe(201);
    expect(state.db.writes()[0]).toMatchObject({ table: "event_scanners", op: "insert" });

    const del = await scanners.DELETE(json(`/api/organizer/events/${EV}/scanners?scannerId=s1`, "DELETE"), params);
    expect(del.status).toBe(200);
  });

  it("explains members, duplicates and unknown e-mails", async () => {
    as("owner");
    const member = await scanners.POST(json(`/api/organizer/events/${EV}/scanners`, "POST", { email: "viewerMember@x.com" }), params);
    expect(member.status).toBe(409);
    expect((await member.json()).code).toBe("ALREADY_MEMBER");
    const dup = await scanners.POST(json(`/api/organizer/events/${EV}/scanners`, "POST", { email: "door@x.com" }), params);
    expect((await dup.json()).code).toBe("ALREADY_SCANNER");
    const none = await scanners.POST(json(`/api/organizer/events/${EV}/scanners`, "POST", { email: "ghost@x.com" }), params);
    expect(none.status).toBe(404);
    const bad = await scanners.POST(json(`/api/organizer/events/${EV}/scanners`, "POST", { email: "nope" }), params);
    expect(bad.status).toBe(400);
    expect(state.db.writes()).toEqual([]);
  });

  it.each(["viewerMember", "unassignedOrganizer", "door", "stranger", "otherOrgOrganizer"] as const)("%s can't manage the list", async (who) => {
    as(who);
    expect((await scanners.GET(json(`/api/organizer/events/${EV}/scanners`, "GET"), params)).status).toBe(403);
    expect((await scanners.POST(json(`/api/organizer/events/${EV}/scanners`, "POST", { email: "stranger@x.com" }), params)).status).toBe(403);
    expect(state.db.writes()).toEqual([]);
  });
});

describe("GET /api/qr-scanner/events", () => {
  const list = async (who: Who | null) => {
    state.clerk = who ? `c-${who}` : null;
    const res = await scannerEvents.GET();
    return { status: res.status, ids: res.ok ? ((await res.json()).events as Array<{ id: string; organization_name: string }>).map((e) => e.id) : [] };
  };
  it("members see their organization's events (not the ones that ended long ago)", async () => {
    expect((await list("owner")).ids.sort()).toEqual([EV, EV2].sort());
    expect((await list("viewerMember")).ids.sort()).toEqual([EV, EV2].sort());
  });
  it("co-host members and designated people see only their event", async () => {
    expect((await list("cohostMember")).ids).toEqual([EV]);
    expect((await list("door")).ids).toEqual([EV]);
  });
  it("strangers see nothing; anonymous → 401", async () => {
    expect((await list("stranger")).ids).toEqual([]);
    expect((await list(null)).status).toBe(401);
  });
});

/**
 * PUT /api/organizations/[id]/event-assignments (2026-10-16): only members of the organization,
 * and only events it owns or co-hosts. Before, any user id and any event id were written.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./fake-supabase";

const state = vi.hoisted(() => ({ db: null as any, clerk: "c-owner" }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: state.clerk })) }));
vi.mock("@/app/lib/supabase/server", () => ({
  get supabaseAdmin() {
    return state.db;
  },
}));

import * as assignments from "@/app/api/organizations/[id]/event-assignments/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const OWN_EV = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COHOST_EV = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FOREIGN_EV = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ORGANIZER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const STRANGER = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function seed() {
  state.db = fakeSupabase({
    users: [
      { id: "u-owner", clerk_id: "c-owner" },
      { id: ORGANIZER, clerk_id: "c-org" },
    ],
    organization_members: [
      { user_id: "u-owner", organization_id: ORG, role: "owner" },
      { user_id: ORGANIZER, organization_id: ORG, role: "organizer" },
    ],
    events: [
      { id: OWN_EV, organization_id: ORG },
      { id: COHOST_EV, organization_id: OTHER },
      { id: FOREIGN_EV, organization_id: OTHER },
    ],
    event_assignments: [{ id: "c1", event_id: COHOST_EV, organization_id: OTHER, cohost_organization_id: ORG, user_id: null }],
  });
  return state.db;
}
const put = (body: unknown) =>
  assignments.PUT(
    new NextRequest(`http://localhost/api/organizations/${ORG}/event-assignments`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: ORG }) }
  );

describe("PUT event-assignments", () => {
  it("owner scopes an organizer to an owned and a co-hosted event", async () => {
    state.clerk = "c-owner";
    const db = seed();
    const res = await put({ userId: ORGANIZER, eventIds: [OWN_EV, COHOST_EV, OWN_EV] });
    expect(res.status).toBe(200);
    expect(db.writes().map((w: { op: string; table: string }) => `${w.op} ${w.table}`)).toEqual(["delete event_assignments", "insert event_assignments"]);
  });

  it("an event of another organization is refused and nothing is written", async () => {
    state.clerk = "c-owner";
    const db = seed();
    const res = await put({ userId: ORGANIZER, eventIds: [OWN_EV, FOREIGN_EV] });
    expect(res.status).toBe(400);
    expect(db.writes()).toEqual([]);
  });

  it("someone who isn't a member is refused", async () => {
    state.clerk = "c-owner";
    const db = seed();
    expect((await put({ userId: STRANGER, eventIds: [OWN_EV] })).status).toBe(400);
    expect(db.writes()).toEqual([]);
  });

  it("clearing all assignments still works", async () => {
    state.clerk = "c-owner";
    const db = seed();
    expect((await put({ userId: ORGANIZER, eventIds: [] })).status).toBe(200);
    expect(db.writes().map((w: { op: string }) => w.op)).toEqual(["delete"]);
  });

  it("organizers can't change assignments", async () => {
    state.clerk = "c-org";
    const db = seed();
    expect((await put({ userId: ORGANIZER, eventIds: [OWN_EV] })).status).toBe(403);
    expect(db.writes()).toEqual([]);
  });
});

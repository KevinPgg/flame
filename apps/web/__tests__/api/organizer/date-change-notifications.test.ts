/**
 * Event date change notifications (2026-10-16): e-mails go to every buyer with a completed order
 * and push to every ticket holder. Both reads used to be one unpaged query → PostgREST's
 * 1000-row cap silently skipped everyone after the first 1000 orders / tickets.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./fake-supabase";

const state = vi.hoisted(() => ({ db: null as any, emails: [] as string[], failEmail: false }));

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: "c-owner" })), currentUser: vi.fn(async () => null) }));
vi.mock("@/app/lib/supabase/server", () => ({
  get supabaseAdmin() {
    return state.db;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/app/lib/push-notifications", () => ({ sendPushToEventTicketHolders: vi.fn(async () => undefined) }));
vi.mock("@/app/lib/email/date-change-notifications", () => ({
  sendDateChangeEmail: vi.fn(async (d: { userEmail: string }) => {
    state.emails.push(d.userEmail);
    return !state.failEmail;
  }),
}));

import { fetchCompletedOrderBuyers, fetchTicketHolderIds, inBatches } from "@/app/lib/utils/event-recipients";
import * as events from "@/app/api/events/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const EV = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const pad = (n: number) => String(n).padStart(5, "0");
const user = (n: number) => ({ id: `u${pad(n)}`, email: `buyer${n}@x.com`, first_name: n % 2 ? `Ana${n}` : null, last_name: null });

/** 2600 orders: 1300 buyers with two completed orders each… plus pending/other-event noise. */
function seed() {
  const orders: any[] = [];
  for (let i = 0; i < 2600; i++) orders.push({ id: `o${pad(i)}`, event_id: EV, status: "completed", users: user(i % 1300) });
  orders.push({ id: "o-pending", event_id: EV, status: "pending", users: user(9001) });
  orders.push({ id: "o-other", event_id: "other", status: "completed", users: user(9002) });
  const tickets: any[] = [];
  for (let i = 0; i < 1800; i++) tickets.push({ id: `t${pad(i)}`, event_id: EV, user_id: `u${pad(i % 1500)}` });
  tickets.push({ id: "t-comp-no-user", event_id: EV, user_id: null });
  const future = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
  const tables = {
    users: [{ id: "u-owner", clerk_id: "c-owner", email: "o@x.com" }],
    organization_members: [{ user_id: "u-owner", organization_id: ORG, role: "owner" }],
    organizations: [{ id: ORG, name: "Kora" }],
    events: [
      { id: EV, organization_id: ORG, name: "Salsa", slug: "salsa", venue: "Porto", timezone: "America/Guayaquil", starts_at: future(10), ends_at: future(10.2), organizations: { id: ORG } },
    ],
    orders,
    tickets,
  };
  state.db = fakeSupabase(tables);
  return tables;
}

beforeEach(() => {
  state.emails = [];
  state.failEmail = false;
});

describe("recipients are read past 1000 rows", () => {
  it("buyers: every page, completed orders of this event only, one entry per person", async () => {
    seed();
    const buyers = await fetchCompletedOrderBuyers(state.db, EV);
    expect(buyers).toHaveLength(1300);
    expect(buyers.map((b) => b.email)).not.toContain("buyer9001@x.com");
    expect(buyers.map((b) => b.email)).not.toContain("buyer9002@x.com");
    expect(buyers.find((b) => b.id === "u00001")!.name).toBe("Ana1");
    expect(buyers.find((b) => b.id === "u00002")!.name).toBe("buyer2@x.com");
  });

  it("ticket holders: every page, distinct, no null users", async () => {
    seed();
    const ids = await fetchTicketHolderIds(state.db, EV);
    expect(ids).toHaveLength(1500);
    expect(ids).not.toContain(null);
  });

  it("a DB error is thrown, not turned into 'nobody to notify'", async () => {
    seed();
    state.db = fakeSupabase({}, { failTables: ["orders"] });
    await expect(fetchCompletedOrderBuyers(state.db, EV)).rejects.toBeTruthy();
  });
});

describe("inBatches", () => {
  it("sends everything, at most `size` at a time, and counts failures (rejections and `false`)", async () => {
    let inFlight = 0;
    let peak = 0;
    const failed = await inBatches([...Array(25).keys()], 10, async (i) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      if (i === 3) throw new Error("x");
      return i !== 7;
    });
    expect(peak).toBeLessThanOrEqual(10);
    expect(failed).toBe(2);
  });
});

describe("PATCH /api/events with a new date", () => {
  const patch = (body: unknown) =>
    events.PATCH(new NextRequest("http://localhost/api/events", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const newStart = () => new Date(Date.now() + 12 * 86_400_000).toISOString();
  const newEnd = () => new Date(Date.now() + 12.2 * 86_400_000).toISOString();

  it("e-mails all 1300 buyers once each", async () => {
    seed();
    const res = await patch({ id: EV, starts_at: newStart(), ends_at: newEnd() });
    expect(res.status).toBe(200);
    expect(state.emails).toHaveLength(1300);
    expect(new Set(state.emails).size).toBe(1300);
  });

  it("failed e-mails don't turn a saved change into an error", async () => {
    seed();
    state.failEmail = true;
    expect((await patch({ id: EV, starts_at: newStart(), ends_at: newEnd() })).status).toBe(200);
  });

  it("no date change → no e-mails", async () => {
    seed();
    expect((await patch({ id: EV, venue: "Luna" })).status).toBe(200);
    expect(state.emails).toHaveLength(0);
  });
});

describe("date change e-mail", () => {
  it("states the event's time zone next to the times", async () => {
    const { generateDateChangeEmailHtml } = await vi.importActual<typeof import("@/app/lib/email/date-change-notifications")>(
      "@/app/lib/email/date-change-notifications"
    );
    const html = generateDateChangeEmailHtml({
      userEmail: "a@x.com",
      userName: "Ana",
      eventName: "Salsa",
      eventVenue: "Porto",
      oldStartDate: "2030-06-16T02:00:00.000Z",
      oldEndDate: "2030-06-16T07:00:00.000Z",
      newStartDate: "2030-06-17T02:00:00.000Z",
      newEndDate: "2030-06-17T07:00:00.000Z",
      eventSlug: "salsa",
      organizationName: "Kora",
      eventTimezone: "Europe/Madrid",
    });
    expect(html).toContain("Madrid (CET&#x2F;CEST)"); // "/" is HTML-escaped
    expect(html).toMatch(/June 17, 2030 at 4:00\s?AM GMT\+2/);
  });
});

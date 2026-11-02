/** Fase 4.2 · aviso a seguidores: who gets "followed_org_event", in which language, and what it says. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeSupabase } from "./fake-supabase";

const state = vi.hoisted(() => ({ db: null as any, sent: [] as any[] }));
vi.mock("@/app/lib/supabase/server", () => ({
  get supabaseAdmin() {
    return state.db;
  },
}));
vi.mock("@/app/lib/push-notifications", () => ({
  sendPushNotification: vi.fn(async (p: unknown) => {
    state.sent.push(p);
    return true;
  }),
}));
import { notifyFollowersOfNewEvent, followedEventMessage, formatEventDate } from "@/app/lib/follower-notifications";

const ORG = "11111111-1111-4111-8111-111111111111";
const EV = { id: "ev-1", organization_id: ORG, name: "Salsa Night", starts_at: "2026-11-15T03:00:00Z", timezone: "America/Guayaquil", city: "Guayaquil" };

beforeEach(() => {
  state.sent = [];
  state.db = fakeSupabase({
    organizations: [{ id: ORG, name: "Kora" }],
    organization_members: [{ user_id: "u-owner", organization_id: ORG, role: "owner" }],
    organization_follows: [
      { user_id: "u-en", organization_id: ORG },
      { user_id: "u-es", organization_id: ORG },
      { user_id: "u-off", organization_id: ORG },
      { user_id: "u-owner", organization_id: ORG }, // a member who also follows: skipped
      { user_id: "u-other", organization_id: "22222222-2222-4222-8222-222222222222" },
    ],
    users: [
      { id: "u-en", language: "en", notification_preferences: null },
      { id: "u-es", language: "es", notification_preferences: { event_reminder: false } },
      { id: "u-off", language: "en", notification_preferences: { followed_org_event: false } },
      { id: "u-owner", language: "es" },
      { id: "u-other", language: "en" },
    ],
  });
});

describe("notifyFollowersOfNewEvent", () => {
  it("reaches followers of that organization only, skipping members and those who turned it off", async () => {
    expect(await notifyFollowersOfNewEvent(EV, "Kora")).toBe(2);
    expect(state.sent.map((p) => p.userId).sort()).toEqual(["u-en", "u-es"]);
    for (const p of state.sent) {
      expect(p.type).toBe("followed_org_event");
      expect(p.data).toEqual({ eventId: "ev-1", orgId: ORG });
    }
  });

  it("writes in each person's language, with the date in the event's time zone", async () => {
    await notifyFollowersOfNewEvent(EV); // name looked up
    const en = state.sent.find((p) => p.userId === "u-en");
    const es = state.sent.find((p) => p.userId === "u-es");
    expect(en.title).toBe("New event from Kora");
    expect(es.title).toBe("Nuevo evento de Kora");
    expect(en.body).toMatch(/^Salsa Night · .*22:00.* · Guayaquil$/); // 03:00Z = 22:00 in Guayaquil
    expect(es.body).toMatch(/^Salsa Night · .*22:00.* · Guayaquil$/);
  });

  it("no followers → nothing sent; a database error never throws", async () => {
    state.db = fakeSupabase({ organization_follows: [], users: [] });
    expect(await notifyFollowersOfNewEvent(EV, "Kora")).toBe(0);
    state.db = fakeSupabase({}, { failTables: ["organization_follows"] });
    await expect(notifyFollowersOfNewEvent(EV, "Kora")).resolves.toBe(0);
    expect(state.sent).toHaveLength(0);
  });

  it("pages past 1000 followers", async () => {
    const follows = Array.from({ length: 1205 }, (_, i) => ({ user_id: `u${String(i).padStart(4, "0")}`, organization_id: ORG }));
    state.db = fakeSupabase({ organizations: [{ id: ORG, name: "Kora" }], organization_members: [], organization_follows: follows, users: follows.map((f) => ({ id: f.user_id, language: "en" })) });
    expect(await notifyFollowersOfNewEvent(EV, "Kora")).toBe(1205);
  });
});

describe("message helpers", () => {
  it("no city → short body; bad time zone falls back to UTC", () => {
    expect(followedEventMessage("en", "Kora", { ...EV, city: null }).body).toMatch(/^Salsa Night · /);
    expect(formatEventDate(EV.starts_at, "Not/AZone", "en")).toMatch(/03:00/);
    expect(formatEventDate("nope", "UTC", "en")).toBe("");
  });
});

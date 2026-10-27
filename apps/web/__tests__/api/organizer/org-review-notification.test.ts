/** 2026-10-27: the owner learns the answer to their organizer request (in-app + push, their language). */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeSupabase } from "./fake-supabase";

const state = vi.hoisted(() => ({ db: null as any, sent: [] as any[], fail: false }));
vi.mock("../../../app/lib/supabase/server", () => ({
  get supabaseAdmin() {
    return state.db;
  },
}));
vi.mock("../../../app/lib/push-notifications", () => ({
  sendPushNotification: vi.fn(async (p: unknown) => {
    if (state.fail) throw new Error("expo down");
    state.sent.push(p);
    return true;
  }),
}));

import { notifyOrganizationReview } from "@/app/lib/org-review-notification";

beforeEach(() => {
  state.sent = [];
  state.fail = false;
  state.db = fakeSupabase({
    users: [
      { id: "u-es", language: "es" },
      { id: "u-en", language: "en" },
      { id: "u-none", language: null },
    ],
  });
});

describe("notifyOrganizationReview", () => {
  it("approved, in the owner's language, with the org for the link", async () => {
    await notifyOrganizationReview({ ownerUserId: "u-es", organizationId: "org1", organizationName: "Kora", decision: "approved" });
    expect(state.sent).toEqual([
      { userId: "u-es", type: "organization_approved", title: "Ya estás aprobado", body: "Kora ya puede crear eventos en Flame.", data: { orgId: "org1" } },
    ]);
  });

  it("rejected with and without a reason; no language → English", async () => {
    await notifyOrganizationReview({ ownerUserId: "u-en", organizationId: "o", organizationName: "Hush", decision: "rejected", reason: "No docs" });
    await notifyOrganizationReview({ ownerUserId: "u-none", organizationId: "o", organizationName: "Hush", decision: "rejected", reason: null });
    expect(state.sent.map((s) => [s.type, s.title, s.body])).toEqual([
      ["organization_rejected", "Organizer not approved", "Hush wasn’t approved. Reason: No docs"],
      ["organization_rejected", "Organizer not approved", "Hush wasn’t approved."],
    ]);
  });

  it("no owner → nothing; a push failure never throws", async () => {
    await notifyOrganizationReview({ ownerUserId: null, organizationId: "o", organizationName: "X", decision: "approved" });
    expect(state.sent).toHaveLength(0);
    state.fail = true;
    await expect(
      notifyOrganizationReview({ ownerUserId: "u-en", organizationId: "o", organizationName: "X", decision: "approved" })
    ).resolves.toBeUndefined();
  });
});

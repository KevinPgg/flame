import { describe, it, expect } from "vitest";
import { organizerV2Redirect } from "../../app/lib/utils/organizer-v2-redirect";

const r = (url: string) => {
  const u = new URL(url, "http://x");
  return organizerV2Redirect(u.pathname, u.searchParams);
};

describe("organizerV2Redirect — v1 organizer links land on v2", () => {
  it("dashboard and organizer list", () => {
    expect(r("/organizer")).toBe("/v2/organizer");
    expect(r("/organizer/")).toBe("/v2/organizer");
    expect(r("/organizer?org=kora")).toBe("/v2/organizer?org=kora");
    expect(r("/organizer?org=a%20b&tab=events")).toBe("/v2/organizer?org=a+b");
  });

  it("v1 tabs with a v2 screen", () => {
    expect(r("/organizer?org=kora&tab=create-event")).toBe("/v2/organizer/create?org=kora");
    expect(r("/organizer?org=kora&tab=rsvps")).toBe("/v2/organizer/rsvps?org=kora");
  });

  it("team", () => {
    expect(r("/organizer/team?org=kora")).toBe("/v2/organizer/team?org=kora");
  });

  it("settings: organization → v2 organization settings, personal → v2 account, payouts → v2 payouts", () => {
    expect(r("/organizer/settings?org=kora&tab=payouts")).toBe("/v2/organizer/payouts?org=kora");
    expect(r("/organizer/settings?org=kora&tab=payouts&connect=success")).toBe("/v2/organizer/payouts?org=kora&connect=success");
    expect(r("/organizer/settings?org=kora")).toBe("/v2/organizer/settings?org=kora");
    expect(r("/organizer/settings?org=kora&tab=organization")).toBe("/v2/organizer/settings?org=kora");
    expect(r("/organizer/settings?org=kora&tab=personal")).toBe("/v2/account");
    expect(r("/organizer/settings?org=kora&tab=weird")).toBe("/v2/organizer/settings?org=kora");
  });

  it("path-style shortcuts with ?org= (create, rsvps, payouts); without org they stay public org pages", () => {
    expect(r("/organizer/create?org=kora")).toBe("/v2/organizer/create?org=kora");
    expect(r("/organizer/rsvps?org=kora")).toBe("/v2/organizer/rsvps?org=kora");
    expect(r("/organizer/payouts?org=kora")).toBe("/v2/organizer/payouts?org=kora");
    expect(r("/organizer/create")).toBeNull();
    expect(r("/organizer/payouts")).toBeNull();
  });

  it("event and RSVP pages keep their id and org", () => {
    expect(r("/organizer/event/ev1?org=kora")).toBe("/v2/organizer/event/ev1?org=kora");
    expect(r("/organizer/rsvps/ev1?org=kora")).toBe("/v2/organizer/rsvps/ev1?org=kora");
  });

  it("screens without v2 and the public organizer page stay on v1", () => {
    expect(r("/organizer/kora-experiences")).toBeNull();
    expect(r("/organizer-agreement")).toBeNull();
    expect(r("/v2/organizer?org=kora")).toBeNull();
    expect(r("/organizer/event/ev1/extra")).toBeNull();
  });
});

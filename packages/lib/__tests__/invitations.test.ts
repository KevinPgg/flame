/** Fase 4.5: team invitation rules. */
import { describe, it, expect } from "vitest";
import { invitationDaysLeft, invitationExpiry, invitationState, isInviteRole, isValidInviteEmail, normalizeInviteEmail } from "../src/organizer/invitations";

describe("team invitations", () => {
  const now = new Date("2026-11-02T12:00:00Z");
  it("e-mail: trimmed + lower-case; simple shape check", () => {
    expect(normalizeInviteEmail("  Ana@X.com ")).toBe("ana@x.com");
    expect(isValidInviteEmail("ana@x.com")).toBe(true);
    expect(isValidInviteEmail("ana@x")).toBe(false);
    expect(isValidInviteEmail("a b@x.com")).toBe(false);
  });
  it("roles: admin or organizer only", () => {
    expect(isInviteRole("admin")).toBe(true);
    expect(isInviteRole("organizer")).toBe(true);
    expect(isInviteRole("owner")).toBe(false);
  });
  it("7 days; pending past its date is expired; answered ones keep their status", () => {
    const exp = invitationExpiry(now);
    expect(exp).toBe("2026-11-09T12:00:00.000Z");
    expect(invitationState({ status: "pending", expires_at: exp }, now)).toBe("pending");
    expect(invitationState({ status: "pending", expires_at: exp }, new Date("2026-11-09T12:00:00Z"))).toBe("expired");
    expect(invitationState({ status: "accepted", expires_at: "2000-01-01T00:00:00Z" }, now)).toBe("accepted");
    expect(invitationDaysLeft(exp, now)).toBe(6);
  });
});

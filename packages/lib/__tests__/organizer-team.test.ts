import { describe, it, expect } from "vitest";
import {
  memberName,
  memberInitials,
  sortTeam,
  assignmentCounts,
  assignedEventIds,
  editableRole,
  assignableEvents,
  assignmentsToSave,
  memberHasActions,
  type TeamMember,
} from "../src";

const m = (id: string, role: TeamMember["role"], first: string | null, last: string | null, email: string | null = `${id}@x.com`): TeamMember => ({
  id,
  user_id: `u-${id}`,
  role,
  user_first_name: first,
  user_last_name: last,
  user_email: email,
});

describe("team helpers", () => {
  it("names and initials fall back to the email", () => {
    expect(memberName(m("a", "admin", " Ana ", "Loor"))).toBe("Ana Loor");
    expect(memberName(m("b", "admin", null, null))).toBe("b@x.com");
    expect(memberName(m("c", "admin", null, null, null))).toBe("—");
    expect(memberInitials(m("a", "admin", "ana", "loor"))).toBe("AL");
    expect(memberInitials(m("b", "admin", null, null, "zoe@x.com"))).toBe("Z");
  });

  it("owner, admins, organizers — alphabetical inside each role", () => {
    const sorted = sortTeam([m("1", "organizer", "Beto", null), m("2", "admin", "Zoe", null), m("3", "owner", "Yan", null), m("4", "organizer", "Ana", null), m("5", "admin", "Ál", null)], "es");
    expect(sorted.map((x) => x.id)).toEqual(["3", "5", "2", "4", "1"]);
  });

  it("assignment counts and ids per user", () => {
    const rows = [
      { event_id: "e1", user_id: "u1" },
      { event_id: "e2", user_id: "u1" },
      { event_id: "e1", user_id: "u2" },
      { event_id: "e3", user_id: null },
    ];
    expect(Object.fromEntries(assignmentCounts(rows))).toEqual({ u1: 2, u2: 1 });
    expect(assignedEventIds(rows, "u1")).toEqual(["e1", "e2"]);
  });

  it("editable role and actions", () => {
    expect(editableRole("admin")).toBe("admin");
    expect(editableRole("viewer")).toBe("organizer");
    expect(memberHasActions({ role: "owner" })).toBe(false);
    expect(memberHasActions({ role: "admin" })).toBe(true);
  });

  it("assignable events: own + co-hosted, no duplicates, not ended yet (upcoming and running), soonest first", () => {
    const now = new Date("2026-11-01T00:00:00Z");
    const list = assignableEvents(
      {
        events: [
          { id: "past1", name: "Old", starts_at: "2026-10-01T00:00:00Z" },
          { id: "far", name: "Far", starts_at: "2026-12-20T00:00:00Z" },
          { id: "soon", name: "Soon", starts_at: "2026-11-05T00:00:00Z" },
        ],
        cohost_events: [
          { event: { id: "co", name: "Co", starts_at: "2026-11-10T00:00:00Z" } },
          { event: { id: "soon", name: "Soon dup", starts_at: "2026-11-05T00:00:00Z" } },
          { event: { id: "past2", name: "Older co", starts_at: "2026-10-20T00:00:00Z" } },
        ],
      },
      now,
    );
    expect(list.map((e) => [e.id, e.cohost])).toEqual([
      ["soon", false],
      ["co", true],
      ["far", false],
    ]);
    expect(assignableEvents({}, now)).toEqual([]);
    // Running (started, not ended) → offered first; ended → not; undated → not.
    const live = assignableEvents(
      {
        events: [
          { id: "soon", name: "Soon", starts_at: "2026-11-05T00:00:00Z", ends_at: "2026-11-05T05:00:00Z" },
          { id: "live", name: "Live", starts_at: "2026-10-31T22:00:00Z", ends_at: "2026-11-01T03:00:00Z" },
          { id: "done", name: "Done", starts_at: "2026-10-31T18:00:00Z", ends_at: "2026-10-31T23:00:00Z" },
          { id: "nodate", name: "?", starts_at: null },
        ],
      },
      now,
    );
    expect(live.map((e) => e.id)).toEqual(["live", "soon"]);
  });

  it("saving keeps current assignments to events no longer offered (already over)", () => {
    const offered = [{ id: "soon" }, { id: "far" }];
    expect(assignmentsToSave(["far"], offered, ["soon", "past1", "past2"])).toEqual(["far", "past1", "past2"]);
    expect(assignmentsToSave([], offered, [])).toEqual([]);
    expect(assignmentsToSave(new Set(["soon", "far"]), offered, ["past1", "past1"])).toEqual(["soon", "far", "past1"]);
  });
});

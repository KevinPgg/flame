import { describe, it, expect } from "vitest";
import { canActOnEvent, canManageAssignedEvents, canCreateEvents } from "../src/utils/permissions";

describe("canActOnEvent (event-level access inside the event's organization)", () => {
  it.each([
    ["owner", false, true],
    ["owner", true, true],
    ["admin", false, true],
    ["organizer", true, true],
    ["organizer", false, false],
    ["viewer", true, false],
    ["viewer", false, false],
    [null, true, false],
  ] as const)("%s, assigned=%s → %s", (role, assigned, expected) => {
    expect(canActOnEvent(role, assigned)).toBe(expected);
  });

  it("is never broader than the existing role helpers", () => {
    for (const role of ["owner", "admin", "organizer", "viewer", null] as const) {
      if (canActOnEvent(role, true)) expect(canManageAssignedEvents(role)).toBe(true);
    }
    expect(canCreateEvents("organizer")).toBe(false);
  });
});

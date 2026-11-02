/** Fase 2.6: You on the web, and the welcome around sign-in. */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderV2, mockFetch } from "./helpers";
import { __resetSavedEvents } from "../../app/v2/attendee/useSavedEvents";

const D = 86_400_000;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const st = vi.hoisted(() => ({ admin: false }));
vi.mock("../../app/lib/hooks/useUserProfile", () => ({
  useUserProfile: () => ({ profile: { first_name: "Ana", last_name: "Ruiz", email: "ana@x.com", profile_image_url: null }, isLoading: false }),
}));
vi.mock("../../app/lib/hooks/useOrganizations", () => ({
  useUserOrganizations: () => ({
    isLoading: false,
    data: {
      hasOrganization: true,
      organizations: [
        { id: "o1", name: "Club Uno", slug: "club-uno", approved: true, logo_url: null, eventCount: 3, role: "owner", owner_user_id: "u" },
        { id: "o2", name: "New Org", slug: "new-org", approved: false, logo_url: null, eventCount: 0, role: "owner", owner_user_id: "u" },
      ],
    },
  }),
}));
vi.mock("../../app/lib/hooks/useUserTickets", () => ({
  useUserTickets: () => ({
    data: {
      tickets: [
        {
          id: "t1",
          type: "ticket",
          status: "checked_in",
          created_at: iso(-40 * D),
          ticket_tier: { id: "x", name: "GA", price_cents: 0, event: { id: "old", name: "Old night", slug: "old", description: "", image_url: "", starts_at: iso(-30 * D), ends_at: iso(-30 * D + 3600_000), venue: "Club", timezone: "America/Guayaquil" } },
        },
      ],
    },
  }),
}));
vi.mock("../../app/lib/hooks/useAdminOrganizations", () => ({
  useIsSupportAdmin: () => ({ isAdmin: st.admin, isLoading: false }),
  useAdminOrganizations: () => ({ data: { organizations: [{ id: "p" }] } }),
}));
vi.mock("../../app/components/modals/OnboardingModal", () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div role="dialog">onboarding</div> : null),
}));
import YouView from "../../app/v2/attendee/you/YouView";

vi.setConfig({ testTimeout: 20_000 });

describe("You (web)", () => {
  it("Saved (fase 4.1): upcoming first, ended after with its tag; empty text when none", async () => {
    __resetSavedEvents();
    const ev = (id: string, name: string, startMs: number) => ({
      id, slug: id, name, image_url: null, starts_at: iso(startMs), ends_at: iso(startMs + 3600_000), venue: null, city: null,
      requires_rsvp: false, currency: "USD", timezone: "America/Guayaquil", organizations: null, ticket_tiers: [],
    });
    mockFetch([{ match: (u) => u === "/api/me/saved-events", body: { events: [ev("gone", "Saved gone", -3 * D), ev("soon", "Saved soon", 3 * D)] } }]);
    renderV2(<YouView />);
    const list = await screen.findByTestId("saved-list");
    expect(Array.from(list.querySelectorAll("b")).map((b) => b.textContent)).toEqual(["Saved soon", "Saved gone"]);
    expect(list).toHaveTextContent("Ended");
    expect(screen.getByRole("button", { name: "Remove Saved gone from saved" })).toBeInTheDocument();
    vi.unstubAllGlobals();
    __resetSavedEvents();
  });

  it("profile, Settings and Edit profile, counters, organizers (Manage / Under review), past events", async () => {
    const user = userEvent.setup({ delay: null });
    renderV2(<YouView />);
    expect(screen.getByRole("heading", { level: 1, name: "Ana Ruiz" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/v2/account");
    expect(screen.getByRole("link", { name: "Edit profile" })).toHaveAttribute("href", "/v2/account");
    expect(screen.getByRole("link", { name: /Club Uno/ })).toHaveAttribute("href", "/organizer?org=club-uno");
    expect(screen.getByText("Under review")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Old night/ })).toHaveAttribute("href", "/account/ticket/t1");
    expect(screen.queryByText("Organizer approvals")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /New organizer/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Flame support sees the approvals entry; Spanish", () => {
    st.admin = true;
    renderV2(<YouView />, "es");
    expect(screen.getByRole("link", { name: /Aprobación de organizadores|Organizer approvals|Aprobar organizadores/ })).toHaveAttribute("href", "/v2/support/organizations");
    expect(screen.getByText("Mis organizadores")).toBeInTheDocument();
  });
});

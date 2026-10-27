/** "/?onboarding=true" keeps opening the organizer onboarding now that "/" is the v2 Home. */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const st = vi.hoisted(() => ({ q: "onboarding=true", signedIn: true }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(st.q) }));
vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ isLoaded: true, isSignedIn: st.signedIn }) }));
vi.mock("../../app/components/modals/OnboardingModal", () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div role="dialog">onboarding</div> : null),
}));
import { OnboardingFromUrl } from "../../app/v2/attendee/OnboardingFromUrl";

describe("OnboardingFromUrl", () => {
  it("opens with ?onboarding=true for a signed-in person; not otherwise", () => {
    const a = render(<OnboardingFromUrl />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    a.unmount();
    st.q = "";
    const b = render(<OnboardingFromUrl />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    b.unmount();
    st.q = "onboarding=true";
    st.signedIn = false;
    render(<OnboardingFromUrl />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

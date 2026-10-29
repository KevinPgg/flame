/** Floating "Purchase in progress" on the web (Kevin 2026-10-28). */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import { renderV2 } from "./helpers";
import { PurchaseInProgress } from "../../app/v2/attendee/PurchaseInProgress";

vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

const HOLD = { id: "h1", expires_at: new Date(Date.now() + 12 * 60_000).toISOString(), quantity: 2, tier: "Tier 1", event: { name: "White Party", slug: "white-party", image_url: null } };
const stub = (hold: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ hold }))));

describe("PurchaseInProgress (web)", () => {
  it("shows the event, quantity, time left and Continue to the payment page; Hide hides it", async () => {
    stub(HOLD);
    renderV2(<PurchaseInProgress pathname="/" aboveBar={false} />);
    expect(await screen.findByText("White Party")).toBeInTheDocument();
    expect(screen.getByText("Purchase in progress")).toBeInTheDocument();
    expect(screen.getByText(/^2 × Tier 1 · 1[12]:\d\d left$/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute("href", "/purchase?session=h1");
    await act(async () => screen.getByRole("button", { name: "Hide" }).click());
    expect(screen.queryByText("White Party")).not.toBeInTheDocument();
  });
  it("nothing on the payment page itself, nor without a reservation", async () => {
    stub(HOLD);
    const { container, unmount } = renderV2(<PurchaseInProgress pathname="/purchase" aboveBar={false} />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
    unmount();
    stub(null);
    const r = renderV2(<PurchaseInProgress pathname="/events/x" aboveBar />);
    await act(async () => {});
    expect(r.container).toBeEmptyDOMElement();
  });
});

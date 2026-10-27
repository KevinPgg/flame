import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderV2, mockFetch, type Route } from "./helpers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));
vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ isSignedIn: true, isLoaded: true, user: { id: "u1" } }) }));

import SupportQueueView from "../../app/v2/support/organizations/SupportQueueView";

vi.setConfig({ testTimeout: 20_000 });
afterEach(() => vi.unstubAllGlobals());

const o = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  slug: id,
  created_at: "2026-10-20T12:00:00Z",
  rejected_at: null,
  rejection_reason: null,
  owner_email: `${id}@x.com`,
  owner_name: null,
  ...extra,
});

function setup(opts: { admin?: boolean; pending?: unknown[]; rejected?: unknown[]; routes?: Route[] } = {}) {
  const f = mockFetch([
    ...(opts.routes ?? []),
    { match: (u) => u === "/api/admin/status", body: { isAdmin: opts.admin ?? true } },
    { match: (u) => u === "/api/admin/organizations?status=pending", body: { organizations: opts.pending ?? [o("kora", "Kora"), o("hush", "Hush")] } },
    { match: (u) => u === "/api/admin/organizations?status=rejected", body: { organizations: opts.rejected ?? [o("old", "Old Club", { rejection_reason: "Fake business" })] } },
    { match: (u, i) => u.startsWith("/api/admin/organizations/") && i?.method === "POST", body: { success: true } },
    { match: (u, i) => u.startsWith("/api/admin/organizations/") && i?.method === "DELETE", body: { success: true } },
    { match: (u) => u === "/api/organizations", body: { organizations: [] } },
  ]);
  renderV2(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SupportQueueView />
    </QueryClientProvider>
  );
  return { f, user: userEvent.setup({ delay: null }) };
}

describe("Support queue v2 (organizer approvals)", () => {
  it("not support → says so and loads no list", async () => {
    const { f } = setup({ admin: false });
    expect(await screen.findByText("This screen is only for Flame support.")).toBeInTheDocument();
    expect(f.calls.some((c) => c.url.startsWith("/api/admin/organizations"))).toBe(false);
  });

  it("pending list with counts; approve after confirming", async () => {
    const { f, user } = setup();
    expect(await screen.findByText("Kora")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Pending/ })).toHaveTextContent("2");
    await user.click(screen.getByRole("button", { name: "Approve Kora" }));
    expect(f.posts()).toHaveLength(0);
    await user.click(await screen.findByRole("button", { name: "Approve" }));
    await waitFor(() => expect(f.posts().map((p) => p.url)).toContain("/api/admin/organizations/kora/approve"));
  });

  it("reject sends the optional reason", async () => {
    const { f, user } = setup();
    await user.click(await screen.findByRole("button", { name: "Reject Hush" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Reason/), "  No docs  ");
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(f.posts().find((p) => p.url === "/api/admin/organizations/hush/reject")!.body).toEqual({ reason: "No docs" }));
  });

  it("rejected tab shows the reason; delete after confirming", async () => {
    const { f, user } = setup();
    await user.click(await screen.findByRole("tab", { name: /Rejected/ }));
    expect(await screen.findByText("Reason: Fake business")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject Old Club" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete Old Club" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(f.calls.some((c) => c.method === "DELETE" && c.url === "/api/admin/organizations/old")).toBe(true));
  });

  it("API error on approve is shown on the card", async () => {
    const { user } = setup({ routes: [{ match: (u) => u.endsWith("/kora/approve"), status: 403, body: { error: "Not allowed" } }] });
    await user.click(await screen.findByRole("button", { name: "Approve Kora" }));
    await user.click(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Not allowed");
  });

  it("search appears with more than 4 and matches name or e-mail without accents", async () => {
    const many = [o("a", "Árbol"), o("b", "Beta"), o("c", "Gamma"), o("d", "Delta"), o("e", "Epsilon", { owner_email: "zeta@x.com" })];
    const { user } = setup({ pending: many });
    const search = await screen.findByRole("searchbox", { name: "Search by name or e-mail" });
    await user.type(search, "arbol");
    expect(screen.getByText("Árbol")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
    await user.clear(search);
    await user.type(search, "zeta");
    expect(screen.getByText("Epsilon")).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, "nada");
    expect(screen.getByText("No matches.")).toBeInTheDocument();
  });

  it("empty pending", async () => {
    setup({ pending: [] });
    expect(await screen.findByText("No pending organizations.")).toBeInTheDocument();
  });
});

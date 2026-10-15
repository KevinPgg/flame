import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockFetch } from "./helpers";

const setSelectedOrgId = vi.fn();
vi.mock("../../app/contexts/MemberRoleContext", () => ({
  useMemberRoleContext: () => ({ setSelectedOrgId }),
}));
import { useOrganizerModel } from "../../app/v2/organizer/useOrganizerModel";

const org = { id: "org1", name: "Kora", slug: "kora", logo_url: null };
const future = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const ev = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Event ${id}`,
  starts_at: future(5),
  ends_at: future(6),
  currency: "USD",
  totalRevenue: 1000,
  pending_rsvps: 2,
  organization_id: "org1",
  ...over,
});
const data = {
  events: [ev("a"), ev("b", { starts_at: future(-10), ends_at: future(-9), totalRevenue: 500 })],
  cohost_events: [{ event: ev("c", { organization_id: "org2", totalRevenue: 9999 }), owner_org_name: "Hush" }],
  owner_cohost_assignments: [],
};

function setup(role: "owner" | "organizer" | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { spy, ...renderHook(() => useOrganizerModel(org, role), { wrapper }) };
}

describe("useOrganizerModel", () => {
  beforeEach(() => setSelectedOrgId.mockClear());
  afterEach(() => vi.unstubAllGlobals());

  it("owner: all events, revenue from owned events only, pending RSVPs, current vs past", async () => {
    const f = mockFetch([{ match: (u) => u.startsWith("/api/organizer/data"), body: data }]);
    const { result } = setup("owner");
    await waitFor(() => expect(result.current.model).not.toBeNull());
    const m = result.current.model!;
    expect(m.all.map((e) => e.id).sort()).toEqual(["a", "b", "c"]);
    expect(m.owned.map((e) => e.id).sort()).toEqual(["a", "b"]);
    expect(m.revenue).toEqual([{ currency: "USD", cents: 1500 }]);
    expect(m.pending).toBe(6);
    expect(m.current.map((e) => e.id).sort()).toEqual(["a", "c"]);
    expect(f.calls[0].url).toBe("/api/organizer/data?org=kora");
    expect(f.calls.some((c) => c.url.includes("event-assignments"))).toBe(false);
    expect(setSelectedOrgId).toHaveBeenCalledWith("org1");
  });

  it("organizer role: waits for its assignments and only shows those events", async () => {
    mockFetch([
      { match: (u) => u.startsWith("/api/organizer/data"), body: data },
      { match: (u) => u.includes("/event-assignments?mine=true"), body: { assignments: [{ event_id: "b" }] } },
    ]);
    const { result } = setup("organizer");
    expect(result.current.fullAccess).toBe(false);
    await waitFor(() => expect(result.current.model).not.toBeNull());
    expect(result.current.model!.all.map((e) => e.id)).toEqual(["b"]);
    expect(result.current.model!.revenue).toEqual([{ currency: "USD", cents: 500 }]);
  });

  it("organizer role whose assignments fail: no model (never shows unscoped data)", async () => {
    mockFetch([
      { match: (u) => u.startsWith("/api/organizer/data"), body: data },
      { match: (u) => u.includes("event-assignments"), status: 500, body: {} },
    ]);
    const { result } = setup("organizer");
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.model).toBeNull();
  });

  it("data request fails → failed", async () => {
    mockFetch([{ match: () => true, status: 500, body: {} }]);
    const { result } = setup("owner");
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.model).toBeNull();
  });

  it("invalidate refreshes every organizer-data view (v1 and v2 share the key)", async () => {
    mockFetch([{ match: () => true, body: data }]);
    const { result, spy } = setup("owner");
    await waitFor(() => expect(result.current.model).not.toBeNull());
    await act(() => result.current.invalidate());
    expect(spy).toHaveBeenCalledWith({ queryKey: ["organizer-data"], exact: false });
  });
});

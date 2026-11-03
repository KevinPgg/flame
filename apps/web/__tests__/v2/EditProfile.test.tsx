/** Edit profile (2026-11-02): own screen, apart from Settings — name, Instagram, colour, photo. */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderV2, mockFetch, type Route } from "./helpers";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }), usePathname: () => "/profile/edit" }));
const reload = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ isSignedIn: true, isLoaded: true, user: { reload } }) }));

import EditProfileView from "../../app/v2/attendee/you/edit/EditProfileView";

vi.setConfig({ testTimeout: 20_000 });
afterEach(() => {
  vi.unstubAllGlobals();
  nav.push.mockReset();
});

const PROFILE = { email: "ana@x.com", first_name: "Ana", last_name: "Ruiz", instagram: null, avatar_color: null, photo_url: null };

function setup(routes: Route[] = []) {
  const f = mockFetch([
    ...routes,
    { match: (u, i) => u === "/api/me/profile" && (i?.method ?? "GET") === "GET", body: PROFILE },
    { match: (u, i) => u === "/api/me/profile" && i?.method === "PATCH", body: { ...PROFILE, first_name: "Ana María", instagram: "ana.r", avatar_color: "#1B4D3E" } },
  ]);
  renderV2(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <EditProfileView />
    </QueryClientProvider>
  );
  return f;
}

describe("Edit profile", () => {
  it("saves name, Instagram (normalized) and colour, refreshes Clerk and goes back to You", async () => {
    const f = setup();
    const first = await screen.findByLabelText("First name");
    fireEvent.change(first, { target: { value: "Ana María" } });
    fireEvent.change(screen.getByLabelText("Instagram"), { target: { value: "@ana.r" } });
    fireEvent.click(screen.getByRole("radio", { name: "Colour 4" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/profile"));
    expect(f.posts().find((p) => p.url === "/api/me/profile")!.body).toEqual({ first_name: "Ana María", last_name: "Ruiz", instagram: "ana.r", avatar_color: "#1B4D3E" });
    expect(reload).toHaveBeenCalled();
  });

  it("empty first name or a bad Instagram → errors, nothing sent", async () => {
    const f = setup();
    fireEvent.change(await screen.findByLabelText("First name"), { target: { value: " " } });
    fireEvent.change(screen.getByLabelText("Instagram"), { target: { value: "no valid!" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Write your first name.")).toBeInTheDocument();
    expect(screen.getByText("That isn’t an Instagram username.")).toBeInTheDocument();
    expect(f.posts()).toHaveLength(0);
  });

  it("Clerk refused the name → says so and stays", async () => {
    setup([{ match: (u, i) => u === "/api/me/profile" && i?.method === "PATCH", status: 502, body: { code: "NAME_NOT_SAVED" } }]);
    fireEvent.change(await screen.findByLabelText("First name"), { target: { value: "Otra" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t change your name. Try again.");
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("no photo → initials and Add photo", async () => {
    setup();
    expect(await screen.findByText("AR")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add photo/ })).toBeInTheDocument();
  });
});

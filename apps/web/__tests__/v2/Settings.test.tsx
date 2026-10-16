import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderV2, mockFetch, type Route } from "./helpers";

const nav = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: nav.refresh, back: vi.fn() }),
  usePathname: () => "/v2/organizer/settings",
  useSearchParams: () => new URLSearchParams("org=kora"),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));
const clerk = vi.hoisted(() => ({ signOut: vi.fn(async () => {}) }));
vi.mock("@clerk/nextjs", () => ({ useClerk: () => clerk }));
vi.mock("../../app/contexts/MemberRoleContext", () => ({ useMemberRoleContext: () => ({ setSelectedOrgId: vi.fn() }) }));
import SettingsView from "../../app/v2/organizer/settings/SettingsView";

vi.setConfig({ testTimeout: 20_000 });
beforeEach(() => {
  nav.replace.mockReset();
  nav.refresh.mockReset();
  nav.push.mockReset();
  clerk.signOut.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

const org = { id: "org1", name: "Kora", slug: "kora", logo_url: null };
const LOGO = "https://x.supabase.co/storage/v1/object/public/organization-images/organizations/kora/logo-1760000000000.png";
const details = { name: "Kora Experiences", instagram_handle: "kora.gye", city: "Guayaquil", description: "Salsa nights", logo_url: LOGO };
const me = { name: "Ana Pérez", imageUrl: null, email: "ana@x.com" };

function setup(opts: { role?: string; tab?: "personal" | "organization"; routes?: Route[]; language?: "en" | "es"; logo?: string | null } = {}) {
  const f = mockFetch([
    ...(opts.routes ?? []),
    { match: (u) => u.startsWith("/api/organizer/data"), body: { events: [], cohost_events: [], owner_cohost_assignments: [] } },
    { match: (u) => u.startsWith("/api/stripe/"), body: { connected: true, chargesEnabled: true, payoutsEnabled: true } },
    { match: (u, i) => u === "/api/organizations/org1" && i?.method === "PATCH", body: { success: true } },
    { match: (u, i) => u === "/api/me/language" && i?.method === "PUT", body: { language: "es" } },
  ]);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup({ delay: null });
  renderV2(
    <QueryClientProvider client={qc}>
      <SettingsView
        organization={org}
        organizations={[org]}
        role={(opts.role ?? "owner") as never}
        me={me}
        details={{ ...details, logo_url: opts.logo === undefined ? LOGO : opts.logo }}
        initialTab={opts.tab ?? "organization"}
      />
    </QueryClientProvider>,
    opts.language ?? "en"
  );
  return { f, user };
}

describe("Settings v2 — organization", () => {
  it("shows the profile; name is read-only; saving sends only the editable fields, normalized", async () => {
    const { f, user } = setup();
    expect(screen.getByLabelText("Company name")).toHaveValue("Kora Experiences");
    expect(screen.getByLabelText("Company name")).toHaveAttribute("readonly");
    expect(screen.getByText("All changes saved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();

    const ig = screen.getByLabelText("Instagram");
    await user.clear(ig);
    await user.type(ig, "https://instagram.com/kora_new/");
    await user.clear(screen.getByLabelText("City"));
    await user.type(screen.getByLabelText("City"), "  Quito ");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(f.posts().find((p) => p.method === "PATCH")).toBeTruthy());
    expect(f.posts().find((p) => p.method === "PATCH")).toMatchObject({
      url: "/api/organizations/org1",
      body: { instagram_handle: "kora_new", city: "Quito", description: "Salsa nights" },
    });
    expect(await screen.findByText("All changes saved")).toBeInTheDocument();
    expect(nav.refresh).toHaveBeenCalled();
  });

  it("invalid Instagram blocks saving with a clear message; description counter", async () => {
    const { f, user } = setup();
    const ig = screen.getByLabelText("Instagram");
    await user.clear(ig);
    await user.type(ig, "kora gye!");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(/Use only letters, numbers, dots and underscores/)).toBeInTheDocument();
    expect(f.posts().filter((p) => p.method === "PATCH")).toHaveLength(0);
    expect(screen.getByText("12/500")).toBeInTheDocument();
  });

  it("save error is shown and the changes stay", async () => {
    const { user } = setup({ routes: [{ match: (u, i) => u === "/api/organizations/org1" && i?.method === "PATCH", status: 500, body: { error: "x" } }] });
    await user.type(screen.getByLabelText("City"), "!");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t save the changes");
    expect(screen.getByLabelText("City")).toHaveValue("Guayaquil!");
  });

  it("logo: uploads a valid image, rejects other files locally, removes after confirming", async () => {
    const { f, user } = setup({
      logo: null,
      routes: [
        { match: (u, i) => u === "/api/upload-org-image" && i?.method === "POST", body: { url: LOGO } },
        { match: (u, i) => u.startsWith("/api/upload-org-image?path=") && i?.method === "DELETE", body: { success: true } },
      ],
    });
    const fileInput = screen.getByTestId("logo-input") as HTMLInputElement;
    // The picker filters by `accept`; a drag-and-drop or "All files" pick can still hand us an SVG.
    fireEvent.change(fileInput, { target: { files: [new File(["x"], "logo.svg", { type: "image/svg+xml" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Use a JPG, PNG, WebP or GIF image.");
    expect(f.posts()).toHaveLength(0);

    fireEvent.change(fileInput, { target: { files: [new File(["x"], "logo.png", { type: "image/png" })] } });
    await waitFor(() => expect(f.posts().find((p) => p.url === "/api/upload-org-image")).toBeTruthy());
    const form = f.posts().find((p) => p.url === "/api/upload-org-image")!.body as FormData;
    expect(form.get("organizationSlug")).toBe("kora");
    expect(form.get("type")).toBe("logo");

    await user.click(await screen.findByRole("button", { name: "Remove" }));
    expect(screen.getByText("Remove the organization logo?")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Remove" }).at(-1)!);
    await waitFor(() =>
      expect(f.posts().at(-1)).toMatchObject({
        url: `/api/upload-org-image?path=${encodeURIComponent("organizations/kora/logo-1760000000000.png")}&type=logo`,
        method: "DELETE",
      })
    );
  });

  it("organizers and viewers see the profile read-only, without logo or save controls", () => {
    setup({ role: "organizer", language: "es" });
    expect(screen.getByText("Solo dueños y admins pueden editar la organización.")).toBeInTheDocument();
    expect(screen.getByLabelText("Ciudad")).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Subir nuevo/ })).not.toBeInTheDocument();
  });
});

describe("Settings v2 — personal", () => {
  it("account from Clerk (read-only), tabs update the URL, sign out", async () => {
    const { user } = setup({ tab: "personal" });
    expect(screen.getByLabelText("Full name")).toHaveValue("Ana Pérez");
    expect(screen.getByLabelText("Email")).toHaveValue("ana@x.com");
    await user.click(screen.getByRole("tab", { name: "Organization" }));
    expect(nav.replace).toHaveBeenCalledWith("/v2/organizer/settings?org=kora&tab=organization", { scroll: false });
    await user.click(screen.getByRole("tab", { name: "Personal" }));
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(clerk.signOut).toHaveBeenCalled());
    expect(nav.push).toHaveBeenCalledWith("/");
  });

  it("language switches at once and is saved", async () => {
    const { f, user } = setup({ tab: "personal" });
    await user.selectOptions(screen.getByLabelText("Language"), "es");
    expect(await screen.findByLabelText("Idioma")).toHaveValue("es");
    expect(f.posts().find((p) => p.url === "/api/me/language")!.body).toEqual({ language: "es" });
    expect(screen.getByRole("tab", { name: "Organización" })).toBeInTheDocument();
  });

  it("language save failure → back to English with an error", async () => {
    const { user } = setup({ tab: "personal", routes: [{ match: (u) => u === "/api/me/language", status: 500, body: {} }] });
    await user.selectOptions(screen.getByLabelText("Language"), "es");
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t save your language");
    expect(screen.getByLabelText("Language")).toHaveValue("en");
  });
});

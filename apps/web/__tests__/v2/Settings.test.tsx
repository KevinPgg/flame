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
// Canvas isn't available in jsdom: the browser-side resize/re-encode is replaced by a fake.
const prep = vi.hoisted(() => ({ next: null as null | { ok: boolean; reason?: string; width?: number; height?: number } }));
vi.mock("../../app/v2/lib/prepare-logo", () => ({
  prepareLogo: vi.fn(async (file: File) =>
    prep.next ?? { ok: true, file: new File(["webp"], "logo.webp", { type: "image/webp" }), width: 740, height: 740 }
  ),
}));
import SettingsView from "../../app/v2/organizer/settings/SettingsView";
import AccountView from "../../app/v2/account/AccountView";

vi.setConfig({ testTimeout: 20_000 });
beforeEach(() => {
  nav.replace.mockReset();
  nav.refresh.mockReset();
  nav.push.mockReset();
  clerk.signOut.mockClear();
  prep.next = null;
});
afterEach(() => vi.unstubAllGlobals());

const org = { id: "org1", name: "Kora", slug: "kora", logo_url: null };
const LOGO = "https://x.supabase.co/storage/v1/object/public/organization-images/organizations/kora/logo-1760000000000.png";
const details = { name: "Kora Experiences", instagram_handle: "kora.gye", city: "Guayaquil", description: "Salsa nights", logo_url: LOGO };
const me = { name: "Ana Pérez", imageUrl: null, email: "ana@x.com" };

function setup(opts: { role?: string; account?: boolean; routes?: Route[]; language?: "en" | "es"; logo?: string | null } = {}) {
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
      {opts.account ? (
        <AccountView me={me} />
      ) : (
        <SettingsView
          organization={org}
          organizations={[org]}
          role={(opts.role ?? "owner") as never}
          me={me}
          details={{ ...details, logo_url: opts.logo === undefined ? LOGO : opts.logo }}
        />
      )}
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
    expect((form.get("file") as File).type).toBe("image/webp"); // the re-encoded file, not the original

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

  it("logo: says why it fails — too small (with its size), unreadable, or the server's reason", async () => {
    const { f } = setup({
      logo: null,
      routes: [{ match: (u, i) => u === "/api/upload-org-image" && i?.method === "POST", status: 400, body: { error: "File content does not match declared type." } }],
    });
    const fileInput = screen.getByTestId("logo-input") as HTMLInputElement;
    prep.next = { ok: false, reason: "tooSmall", width: 300, height: 300 };
    fireEvent.change(fileInput, { target: { files: [new File(["x"], "a.png", { type: "image/png" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("This image is 300×300. Use one of at least 400×400.");
    prep.next = { ok: false, reason: "decode" };
    fireEvent.change(fileInput, { target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("We couldn’t read this image"));
    expect(f.posts()).toHaveLength(0);
    prep.next = null;
    fireEvent.change(fileInput, { target: { files: [new File(["x"], "a.png", { type: "image/png" })] } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The logo wasn’t saved: File content does not match declared type."));
  });

  it("organizers and viewers see the profile read-only, without logo or save controls", () => {
    setup({ role: "organizer", language: "es" });
    expect(screen.getByText("Solo dueños y admins pueden editar la organización.")).toBeInTheDocument();
    expect(screen.getByLabelText("Ciudad")).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Subir nuevo/ })).not.toBeInTheDocument();
  });
});

describe("My account v2 (separate from organization settings)", () => {
  it("organization settings has no personal section and no tabs", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Organization settings" })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Language")).not.toBeInTheDocument();
  });

  it("account from Clerk (read-only), link back to my organizers, sign out", async () => {
    const { user } = setup({ account: true });
    expect(screen.getByRole("heading", { name: "My account" })).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveValue("Ana Pérez");
    expect(screen.getByLabelText("Email")).toHaveValue("ana@x.com");
    expect(screen.getByRole("link", { name: "My organizers" })).toHaveAttribute("href", "/v2/organizer");
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(clerk.signOut).toHaveBeenCalled());
    expect(nav.push).toHaveBeenCalledWith("/");
  });

  it("language switches at once and is saved", async () => {
    const { f, user } = setup({ account: true });
    await user.selectOptions(screen.getByLabelText("Language"), "es");
    expect(await screen.findByLabelText("Idioma")).toHaveValue("es");
    expect(f.posts().find((p) => p.url === "/api/me/language")!.body).toEqual({ language: "es" });
    expect(screen.getByRole("heading", { name: "Mi cuenta" })).toBeInTheDocument();
  });

  it("language save failure → back to English with an error", async () => {
    const { user } = setup({ account: true, routes: [{ match: (u) => u === "/api/me/language", status: 500, body: {} }] });
    await user.selectOptions(screen.getByLabelText("Language"), "es");
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t save your language");
    expect(screen.getByLabelText("Language")).toHaveValue("en");
  });
});

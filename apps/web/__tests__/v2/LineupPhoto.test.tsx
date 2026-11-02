/** Fase 4.3: artist photo in the line-up form — thumbnail + pencil, options from the links. */
import React, { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { newArtistDraft, type ArtistDraft } from "@project-flame/lib";
import { renderV2, mockFetch } from "./helpers";
import { LineupFields } from "../../app/v2/organizer/event-form/LineupFields";

vi.setConfig({ testTimeout: 20_000 });
afterEach(() => vi.unstubAllGlobals());

const ORG = "11111111-1111-4111-8111-111111111111";
const PHOTO = `https://abc.supabase.co/storage/v1/object/public/event-images/artists/${ORG}/22222222-2222-4222-8222-222222222222.jpg`;

function Harness({ initial }: { initial: ArtistDraft[] }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <LineupFields value={v} onChange={setV} errorText={() => null} organizationId={ORG} />
      <output data-testid="photos">{v.map((a) => a.photo || "-").join(",")}</output>
    </>
  );
}

describe("artist photo", () => {
  it("Spotify photo: pencil → option → POST with the link → thumbnail shows it", async () => {
    const f = mockFetch([{ match: (u) => u === "/api/organizer/lineup-photo", body: { photo_url: PHOTO } }]);
    const user = userEvent.setup({ delay: null });
    renderV2(<Harness initial={[newArtistDraft({ name: "Chuy", spotify: "https://open.spotify.com/artist/1" })]} />);
    await user.click(screen.getByRole("button", { name: "Change photo of Chuy" }));
    expect(screen.getByRole("menuitem", { name: "Use the SoundCloud photo" })).toBeDisabled(); // no SoundCloud link
    expect(screen.getByRole("menuitem", { name: "Instagram photo (not available)" })).toBeDisabled();
    await user.click(screen.getByRole("menuitem", { name: "Use the Spotify photo" }));
    await waitFor(() => expect(screen.getByTestId("photos")).toHaveTextContent(PHOTO));
    expect(f.posts()[0]!.body).toEqual({ organizationId: ORG, source: "spotify", url: "https://open.spotify.com/artist/1" });
  });

  it("API says no photo → message, nothing set; remove clears a photo", async () => {
    mockFetch([{ match: (u) => u === "/api/organizer/lineup-photo", status: 422, body: { error: "That profile has no photo we can use." } }]);
    const user = userEvent.setup({ delay: null });
    renderV2(<Harness initial={[newArtistDraft({ name: "Ney", soundcloud: "ney", photo: PHOTO })]} />);
    await user.click(screen.getByRole("button", { name: "Change photo of Ney" }));
    await user.click(screen.getByRole("menuitem", { name: "Use the SoundCloud photo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That profile has no photo we can use.");
    expect(screen.getByTestId("photos")).toHaveTextContent(PHOTO);
    await user.click(screen.getByRole("button", { name: "Change photo of Ney" }));
    await user.click(screen.getByRole("menuitem", { name: "Remove photo" }));
    expect(screen.getByTestId("photos")).toHaveTextContent("-");
  });
});

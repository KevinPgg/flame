/** City from the catalog + venue with Google Places suggestions (2026-11-02). */
import React, { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderV2, mockFetch } from "./helpers";
import { CityField } from "../../app/v2/organizer/event-form/CityField";
import { VenueField, type VenueValue } from "../../app/v2/organizer/event-form/VenueField";

vi.setConfig({ testTimeout: 20_000 });
afterEach(() => vi.unstubAllGlobals());

function City({ initial = "", onChange = () => {} }: { initial?: string; onChange?: (c: string) => void }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <label htmlFor="c">City</label>
      <CityField id="c" value={v} onChange={(c) => (setV(c), onChange(c))} />
    </>
  );
}
function Venue({ city = "Guayaquil", spy = (_: VenueValue) => {} }: { city?: string; spy?: (v: VenueValue) => void }) {
  const [v, setV] = useState<VenueValue>({ venue: "", venueAddress: "", venuePlaceId: "" });
  return (
    <>
      <label htmlFor="v">Venue</label>
      <VenueField id="v" value={v} city={city} onChange={(n) => (setV(n), spy(n))} />
    </>
  );
}

describe("CityField", () => {
  it("cities grouped by country; Another city… switches to text", () => {
    const changes: string[] = [];
    renderV2(<City onChange={(c) => changes.push(c)} />);
    const select = screen.getByLabelText("City") as HTMLSelectElement;
    expect(select.querySelectorAll("optgroup")[0]).toHaveAttribute("label", "🇪🇨 Ecuador");
    fireEvent.change(select, { target: { value: "Lisboa" } });
    expect(changes).toEqual(["Lisboa"]);
    fireEvent.change(select, { target: { value: "__other__" } });
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Manta" } });
    expect(changes.at(-1)).toBe("Manta");
  });

  it("an old free-text city outside the list opens as text", () => {
    renderV2(<City initial="Manta" />);
    expect(screen.getByLabelText("City")).toHaveValue("Manta");
    expect(screen.getByRole("button", { name: "Choose from the list" })).toBeInTheDocument();
  });
});

describe("VenueField", () => {
  it("suggests places in the city's country; picking keeps the name and fetches the address", async () => {
    const f = mockFetch([
      { match: (u) => u.startsWith("/api/places/venues?"), body: { suggestions: [{ place_id: "ChIJabcdefghij", name: "Kora Club", address: "Av. 9 de Octubre" }] } },
      { match: (u) => u.startsWith("/api/places/venues/ChIJabcdefghij"), body: { place_id: "ChIJabcdefghij", address: "Av. 9 de Octubre 100, Guayaquil, Ecuador" } },
    ]);
    const seen: VenueValue[] = [];
    renderV2(<Venue spy={(v) => seen.push(v)} />);
    fireEvent.change(screen.getByLabelText("Venue"), { target: { value: "kora" } });
    fireEvent.click(await screen.findByRole("button", { name: /Kora Club/ }));
    await waitFor(() => expect(seen.at(-1)).toEqual({ venue: "Kora Club", venueAddress: "Av. 9 de Octubre 100, Guayaquil, Ecuador", venuePlaceId: "ChIJabcdefghij" }));
    const search = new URL(`http://x${f.calls[0].url}`).searchParams;
    expect(search.get("country")).toBe("EC");
    expect(f.calls[1].url).toContain(`session=${search.get("session")}`); // same session closes it
    expect(screen.getByRole("link", { name: "Open in Maps" }).getAttribute("href")).toContain("query_place_id=ChIJabcdefghij");
  });

  it("no key (503) → plain text field, no more calls", async () => {
    const f = mockFetch([{ match: (u) => u.startsWith("/api/places/venues"), status: 503, body: { code: "PLACES_NOT_CONFIGURED" } }]);
    renderV2(<Venue />);
    fireEvent.change(screen.getByLabelText("Venue"), { target: { value: "kora" } });
    await waitFor(() => expect(f.calls).toHaveLength(1));
    fireEvent.change(screen.getByLabelText("Venue"), { target: { value: "kora club" } });
    await new Promise((r) => setTimeout(r, 450));
    expect(f.calls).toHaveLength(1);
    expect(screen.getByLabelText("Venue")).toHaveValue("kora club");
  });
});

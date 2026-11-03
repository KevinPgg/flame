import { describe, it, expect } from "vitest";
import { canonicalCity, cityDefaults, findCatalogCity, groupCitiesByCountry, sameCity, venueMapsUrl, newPlacesSessionToken, buildCreateEventPayload, buildUpdateEventPayload, emptyEventForm, editFormFromEvent } from "../src";

describe("city catalog", () => {
  it("matches spellings and aliases, keeps unknown cities as typed", () => {
    expect(findCatalogCity(" guayaquil ")?.country.code).toBe("EC");
    expect(canonicalCity("NYC")).toBe("New York");
    expect(canonicalCity("Lisbon")).toBe("Lisboa");
    expect(canonicalCity("cancun")).toBe("Cancún");
    expect(canonicalCity("  Manta ")).toBe("Manta");
    expect(sameCity("ciudad de panamá", "Panama City")).toBe(true);
  });

  it("defaults for a new event", () => {
    expect(cityDefaults("Madrid")).toEqual({ timezone: "Europe/Madrid", currency: "EUR" });
    expect(cityDefaults("Mérida")).toEqual({ timezone: "America/Merida", currency: "MXN" });
    expect(cityDefaults("Manta")).toBeNull();
  });

  it("groups cities with events by country (catalog order), merges variants, unknown last", () => {
    const g = groupCitiesByCountry([
      { city: "Quito", count: 2 },
      { city: "guayaquil", count: 3 },
      { city: "Guayaquil", count: 1 },
      { city: "Manta", count: 1 },
      { city: "Lisbon", count: 4 },
    ]);
    expect(g.map((x) => x.country?.code ?? "other")).toEqual(["EC", "PT", "other"]);
    expect(g[0].cities).toEqual([{ city: "Guayaquil", count: 4 }, { city: "Quito", count: 2 }]);
    expect(g[0].count).toBe(6);
    expect(g[1].cities).toEqual([{ city: "Lisboa", count: 4 }]);
  });
});

describe("venue", () => {
  it("Maps link built by us", () => {
    const u = new URL(venueMapsUrl({ venue: "Kora Club", venue_address: "Av. 9 de Octubre 100, Guayaquil", venue_place_id: "ChIJ123" })!);
    expect(u.origin + u.pathname).toBe("https://www.google.com/maps/search/");
    expect(u.searchParams.get("query")).toBe("Kora Club, Av. 9 de Octubre 100, Guayaquil");
    expect(u.searchParams.get("query_place_id")).toBe("ChIJ123");
    expect(new URL(venueMapsUrl({ venue: "Kora", city: "Quito" })!).searchParams.get("query")).toBe("Kora, Quito");
    expect(venueMapsUrl({})).toBeNull();
  });

  it("session tokens look like UUID v4 and differ", () => {
    const a = newPlacesSessionToken();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newPlacesSessionToken()).not.toBe(a);
  });

  it("create payload: canonical city, place only when picked", () => {
    const form = { ...emptyEventForm(), name: "X", slug: "x", venue: "Kora", city: "gye", startsAt: "2030-01-01T22:00", endsAt: "2030-01-02T03:00" };
    const p1 = buildCreateEventPayload(form, "org");
    expect(p1.event.city).toBe("Guayaquil");
    expect(p1.event.venue_place_id).toBeUndefined();
    const p2 = buildCreateEventPayload({ ...form, venuePlaceId: "ChIJ1", venueAddress: "Av. 1" }, "org");
    expect(p2.event).toMatchObject({ venue_place_id: "ChIJ1", venue_address: "Av. 1" });
  });

  it("edit payload: place changes and clears; untouched city isn't rewritten", () => {
    const ev = { id: "e", starts_at: "2030-01-02T03:00:00Z", ends_at: "2030-01-02T08:00:00Z", venue: "Kora", venue_address: "Av. 1", venue_place_id: "ChIJ1", city: "guayaquil", description: "", timezone: "America/Guayaquil" };
    const base = editFormFromEvent(ev);
    expect(buildUpdateEventPayload(base, ev).changed).toBe(false);
    const cleared = buildUpdateEventPayload({ ...base, venue: "Otro", venuePlaceId: "", venueAddress: "" }, ev).payload;
    expect(cleared).toMatchObject({ venue: "Otro", venue_place_id: null, venue_address: null });
  });
});

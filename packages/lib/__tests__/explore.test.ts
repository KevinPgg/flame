/** Fase 2.5: Explore search and featured row. */
import { describe, it, expect } from "vitest";
import { searchExplore, featuredFirst, normalizeSearch, walletDayTime, organizerCover } from "../src";

const ev = (name: string, extra: Record<string, unknown> = {}) => ({ name, venue: "Club Uno", city: "Quito", organizations: { name: "Sonar" }, ...extra });

describe("searchExplore", () => {
  const events = [ev("Noche de Cúmbia"), ev("Techno Fridays", { venue: "La Bodega", city: "Guayaquil", organizations: { name: "Club Rojo" } })];
  const orgs = [{ name: "Club Rojo", city: "Guayaquil" }, { name: "Sonar", city: "Quito" }];

  it("matches events by name, venue, city or organizer; organizers by name or city; accents and case don't matter", () => {
    expect(searchExplore(events, orgs, "cumbia").events.map((e) => e.name)).toEqual(["Noche de Cúmbia"]);
    expect(searchExplore(events, orgs, "BODEGA").events).toHaveLength(1);
    expect(searchExplore(events, orgs, "club rojo")).toEqual({ events: [events[1]], organizers: [orgs[0]] });
    expect(searchExplore(events, orgs, "quito sonar").events.map((e) => e.name)).toEqual(["Noche de Cúmbia"]);
  });

  it("empty query → nothing; no match → nothing", () => {
    expect(searchExplore(events, orgs, "  ")).toEqual({ events: [], organizers: [] });
    expect(searchExplore(events, orgs, "zzz")).toEqual({ events: [], organizers: [] });
    expect(normalizeSearch(" Ñandú ")).toBe("nandu");
  });
});

describe("featuredFirst / walletDayTime", () => {
  it("featured events first, then the rest, capped", () => {
    const list = [{ id: 1 }, { id: 2, is_featured: true }, { id: 3 }, { id: 4, is_featured: true }];
    expect(featuredFirst(list, 3).map((e) => e.id)).toEqual([2, 4, 1]);
  });
  it("day and time in the event's zone", () => {
    expect(walletDayTime("2026-10-31T03:00:00Z", "America/Guayaquil", "en-US").day).toBe("Fri, Oct 30");
  });
});

describe("organizerCover (organizer rows)", () => {
  const now = Date.parse("2026-10-28T20:00:00Z");
  const ev = (slug: string, starts: string, img: string | null, ends?: string) => ({ starts_at: starts, ends_at: ends ?? null, image_url: img, organizations: { slug } });
  const org = { slug: "kora", logo_url: "logo.png", cover_image_url: "cover.png" };
  it("the flyer of the organizer's next event (skips ended ones and other organizers)", () => {
    const events = [
      ev("other", "2026-10-29T03:00:00Z", "other.png"),
      ev("kora", "2026-11-20T03:00:00Z", "later.png"),
      ev("kora", "2026-10-27T03:00:00Z", "ended.png", "2026-10-27T08:00:00Z"),
      ev("kora", "2026-11-01T03:00:00Z", "next.png"),
      ev("kora", "2026-10-30T03:00:00Z", null),
    ];
    expect(organizerCover(org, events, now)).toEqual({ url: "next.png", kind: "flyer" });
  });
  it("matches by organization id too; without a flyer → profile photo → cover → nothing", () => {
    expect(organizerCover({ ...org, id: "o1" }, [{ starts_at: "2026-11-01T03:00:00Z", image_url: "byid.png", organization_id: "o1" }], now)).toEqual({ url: "byid.png", kind: "flyer" });
    expect(organizerCover(org, [], now)).toEqual({ url: "logo.png", kind: "logo" });
    expect(organizerCover({ slug: "x", cover_image_url: "cover.png" }, [], now)).toEqual({ url: "cover.png", kind: "cover" });
    expect(organizerCover({ slug: "x" }, [], now)).toBeNull();
  });
});

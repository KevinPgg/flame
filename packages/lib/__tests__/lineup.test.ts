/** Fase 4.3 Line-up: link normalizers, validation, payload and display parsing. */
import { describe, it, expect } from "vitest";
import {
  normalizeInstagram,
  normalizeSpotify,
  normalizeSoundcloud,
  validateLineup,
  lineupFromDrafts,
  parseLineup,
  sanitizeLineup,
  artistLinks,
  artistInitials,
  newArtistDraft,
  LINEUP_MAX,
} from "../src/organizer/lineup";
import { buildUpdateEventPayload, editFormFromEvent, emptyEventForm, validateEventForm } from "../src/organizer/event-form";

describe("normalizers", () => {
  it("instagram: @, profile URLs, query strings; rejects spaces", () => {
    expect(normalizeInstagram("@perdomo.dj")).toBe("perdomo.dj");
    expect(normalizeInstagram("https://www.instagram.com/perdomo.dj/?igsh=abc")).toBe("perdomo.dj");
    expect(normalizeInstagram("instagram.com/lpm_ec")).toBe("lpm_ec");
    expect(normalizeInstagram("")).toBeNull();
    expect(normalizeInstagram("dj perdomo")).toBe("invalid");
  });
  it("spotify: open.spotify.com or spotify.link only, without the query", () => {
    expect(normalizeSpotify("https://open.spotify.com/artist/4q3ewBCX7sLwd24euuV69X?si=x")).toBe("https://open.spotify.com/artist/4q3ewBCX7sLwd24euuV69X");
    expect(normalizeSpotify("open.spotify.com/artist/abc/")).toBe("https://open.spotify.com/artist/abc");
    expect(normalizeSpotify("https://spotify.link/xyz")).toBe("https://spotify.link/xyz");
    expect(normalizeSpotify("https://evil.com/artist/abc")).toBe("invalid");
    expect(normalizeSpotify("https://open.spotify.com/")).toBe("invalid");
  });
  it("soundcloud: links or a bare username", () => {
    expect(normalizeSoundcloud("perdomo")).toBe("https://soundcloud.com/perdomo");
    expect(normalizeSoundcloud("https://m.soundcloud.com/Perdomo/sets/x/")).toBe("https://soundcloud.com/Perdomo/sets/x");
    expect(normalizeSoundcloud("https://on.soundcloud.com/AbC")).toBe("https://on.soundcloud.com/AbC");
    expect(normalizeSoundcloud("https://soundcloud.evil.com/x")).toBe("invalid");
  });
});

describe("validate / payload", () => {
  it("empty rows are ignored; a row with a link needs a name; bad links flagged", () => {
    const a = newArtistDraft({ name: "", instagram: "@chuy" });
    const b = newArtistDraft({ name: "Dibaq", spotify: "https://youtube.com/x" });
    const c = newArtistDraft();
    expect(validateLineup([a, b, c])).toEqual({ [`lineup.${a.key}.name`]: "artistNameRequired", [`lineup.${b.key}.spotify`]: "spotifyInvalid" });
  });
  it("too many artists", () => {
    const many = Array.from({ length: LINEUP_MAX + 1 }, (_, i) => newArtistDraft({ name: `A${i}` }));
    expect(validateLineup(many).lineup).toBe("lineupTooLong");
  });
  it("lineupFromDrafts normalizes and drops empty values", () => {
    expect(lineupFromDrafts([newArtistDraft({ name: " Perdomo ", instagram: "@perdomo.dj", soundcloud: "perdomo" }), newArtistDraft()])).toEqual([
      { name: "Perdomo", instagram: "perdomo.dj", soundcloud: "https://soundcloud.com/perdomo" },
    ]);
  });
  it("sanitizeLineup (server): null → [], invalid → error, valid → normalized", () => {
    expect(sanitizeLineup(undefined)).toEqual({ lineup: [] });
    expect(sanitizeLineup("x")).toEqual({ error: "lineup must be an array" });
    expect(sanitizeLineup([{ name: "", instagram: "a" }])).toEqual({ error: "lineup.0.name: artistNameRequired" });
    expect(sanitizeLineup([{ name: "Chuy", spotify: "open.spotify.com/artist/1" }])).toEqual({ lineup: [{ name: "Chuy", spotify: "https://open.spotify.com/artist/1" }] });
  });
  it("create form: line-up errors show up in validateEventForm", () => {
    const form = emptyEventForm();
    const bad = newArtistDraft({ name: "X", instagram: "no spaces" });
    form.lineup = [bad];
    expect(validateEventForm(form)[`lineup.${bad.key}.instagram`]).toBe("instagramInvalid");
  });
  it("edit form: line-up only sent when it changed", () => {
    const event = { id: "e1", starts_at: "2030-01-01T02:00:00Z", ends_at: "2030-01-01T07:00:00Z", venue: "Club", city: "Quito", description: null, lineup: [{ name: "Chuy" }] };
    const form = editFormFromEvent(event);
    expect(buildUpdateEventPayload(form, event).payload.lineup).toBeUndefined();
    form.lineup = [...form.lineup!, newArtistDraft({ name: "LPM" })];
    expect(buildUpdateEventPayload(form, event).payload.lineup).toEqual([{ name: "Chuy" }, { name: "LPM" }]);
  });
});

describe("display", () => {
  it("parseLineup skips junk and bad links", () => {
    expect(parseLineup([{ name: "Chuy", spotify: "https://evil.com" }, null, { name: " " }, "x"])).toEqual([{ name: "Chuy" }]);
    expect(parseLineup(null)).toEqual([]);
  });
  it("links and initials", () => {
    expect(artistLinks({ name: "A", instagram: "a.b", soundcloud: "https://soundcloud.com/a" })).toEqual([
      { kind: "instagram", url: "https://instagram.com/a.b" },
      { kind: "soundcloud", url: "https://soundcloud.com/a" },
    ]);
    expect(artistInitials("DJ Mila Q")).toBe("MQ");
    expect(artistInitials("Perdomo")).toBe("PE");
  });
});

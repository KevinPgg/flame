/** Venue autocomplete through Google Places (New), 2026-11-02: key stays on the server, sessions, errors. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ userId: "c-1" as string | null }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: state.userId })) }));
import { GET as suggest } from "@/app/api/places/venues/route";
import { GET as details } from "@/app/api/places/venues/[placeId]/route";

const SESSION = "9ac7ea51-b69e-4ba1-a7c1-4963132cd1e4";
const calls: Array<{ url: string; init: RequestInit }> = [];
beforeEach(() => {
  state.userId = "c-1";
  calls.length = 0;
  process.env.GOOGLE_PLACES_API_KEY = "test-key";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.includes(":autocomplete"))
        return new Response(JSON.stringify({ suggestions: [{ placePrediction: { placeId: "ChIJabcdefghij", text: { text: "Kora Club, Guayaquil" }, structuredFormat: { mainText: { text: "Kora Club" }, secondaryText: { text: "Av. 9 de Octubre, Guayaquil" } } } }] }));
      return new Response(JSON.stringify({ id: "ChIJabcdefghij", formattedAddress: "Av. 9 de Octubre 100, Guayaquil, Ecuador" }));
    })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_PLACES_API_KEY;
});

const req = (path: string) => new NextRequest(`http://localhost${path}`);

describe("/api/places/venues", () => {
  it("suggestions: key in a header (not the URL), session and country sent", async () => {
    const res = await suggest(req(`/api/places/venues?input=kora&session=${SESSION}&country=EC&lang=es`));
    expect(await res.json()).toEqual({ suggestions: [{ place_id: "ChIJabcdefghij", name: "Kora Club", address: "Av. 9 de Octubre, Guayaquil" }] });
    expect(calls[0].url).not.toContain("test-key");
    expect((calls[0].init.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe("test-key");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ input: "kora", sessionToken: SESSION, languageCode: "es", includedRegionCodes: ["ec"] });
  });

  it("details close the session with the Essentials field mask", async () => {
    const res = await details(req(`/api/places/venues/ChIJabcdefghij?session=${SESSION}`), { params: Promise.resolve({ placeId: "ChIJabcdefghij" }) });
    expect(await res.json()).toEqual({ place_id: "ChIJabcdefghij", address: "Av. 9 de Octubre 100, Guayaquil, Ecuador" });
    expect(calls[0].url).toContain(`sessionToken=${SESSION}`);
    expect((calls[0].init.headers as Record<string, string>)["X-Goog-FieldMask"]).toBe("id,formattedAddress");
  });

  it("signed out → 401; short text → no call; no key → 503 PLACES_NOT_CONFIGURED", async () => {
    state.userId = null;
    expect((await suggest(req(`/api/places/venues?input=kora&session=${SESSION}`))).status).toBe(401);
    state.userId = "c-1";
    expect(await (await suggest(req(`/api/places/venues?input=ko&session=${SESSION}`))).json()).toEqual({ suggestions: [] });
    expect(calls).toHaveLength(0);
    delete process.env.GOOGLE_PLACES_API_KEY;
    const res = await suggest(req(`/api/places/venues?input=kora&session=${SESSION}`));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("PLACES_NOT_CONFIGURED");
  });

  it("bad session token → 400", async () => {
    expect((await suggest(req("/api/places/venues?input=kora&session=nope"))).status).toBe(400);
  });
});

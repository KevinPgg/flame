import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { PlacesError, autocompleteVenues, isSessionToken, placesRateLimited } from "@/app/lib/google-places";

/**
 * GET /api/places/venues?input=&session=&country=EC&lang=es → { suggestions: [{ place_id, name, address }] }
 * Venue suggestions for Create/Edit event (2026-11-02). Signed in only. 503 NOT_CONFIGURED when
 * there's no key: the forms then keep the venue as plain text.
 */
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams;
  const text = (q.get("input") ?? "").trim().slice(0, 120);
  const session = q.get("session");
  if (text.length < 3) return NextResponse.json({ suggestions: [] });
  if (!isSessionToken(session)) return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  if (placesRateLimited(userId)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const country = /^[A-Za-z]{2}$/.test(q.get("country") ?? "") ? q.get("country") : null;
  const language = q.get("lang") === "es" ? "es" : "en";
  try {
    return NextResponse.json({ suggestions: await autocompleteVenues({ text, session, language, country }) });
  } catch (e) {
    const err = e instanceof PlacesError ? e : new PlacesError(502, "UPSTREAM");
    return NextResponse.json({ error: err.code, code: err.code === "NOT_CONFIGURED" ? "PLACES_NOT_CONFIGURED" : err.code }, { status: err.status });
  }
}

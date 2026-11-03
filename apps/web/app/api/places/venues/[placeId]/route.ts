import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { PlacesError, isPlaceId, isSessionToken, placesRateLimited, venueDetails } from "@/app/lib/google-places";

/** GET /api/places/venues/{placeId}?session=&lang= → { place_id, address } — closes the autocomplete session. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ placeId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { placeId } = await params;
  const session = req.nextUrl.searchParams.get("session");
  if (!isPlaceId(placeId) || !isSessionToken(session)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (placesRateLimited(userId)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const language = req.nextUrl.searchParams.get("lang") === "es" ? "es" : "en";
  try {
    return NextResponse.json(await venueDetails({ placeId, session, language }));
  } catch (e) {
    const err = e instanceof PlacesError ? e : new PlacesError(502, "UPSTREAM");
    return NextResponse.json({ error: err.code, code: err.code === "NOT_CONFIGURED" ? "PLACES_NOT_CONFIGURED" : err.code }, { status: err.status });
  }
}

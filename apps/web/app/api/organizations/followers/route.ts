import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { followerCounts, isUuid, MAX_FOLLOWER_IDS } from "@/app/lib/follows";

/**
 * Public follower counts (fase 4.2) for the organizer profile in the app and the Explore cards.
 * GET ?ids=<uuid>,<uuid> (up to 50) → { counts: { <id>: number } }. Counts only, no people.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0 || ids.length > MAX_FOLLOWER_IDS || !ids.every(isUuid)) {
    return NextResponse.json({ error: `ids: 1 to ${MAX_FOLLOWER_IDS} organization ids` }, { status: 400 });
  }
  try {
    return NextResponse.json({ counts: await followerCounts(supabaseAdmin, ids) });
  } catch (error) {
    console.error("[GET /api/organizations/followers]", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

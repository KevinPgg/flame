import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { scannableEventIds, scanUserFromClerk } from "@/app/lib/utils/scan-access";
import { selectAllPagesByIds } from "@/app/lib/utils/supabase-pagination";

/**
 * GET /api/qr-scanner/events — events the signed-in person can scan (members of the organizer or
 * a co-host org, people designated for an event, platform admins), published, not ended more than
 * 12 h ago. Feeds the v2 scanner's event picker.
 */
const GRACE_MS = 12 * 3_600_000;
const FIELDS = "id, name, starts_at, ends_at, venue, city, timezone, image_url, status, organization_id, organizations ( name )";

type Row = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  venue: string | null;
  city: string | null;
  timezone: string | null;
  image_url: string | null;
  status: string;
  organization_id: string;
  organizations: { name: string } | Array<{ name: string }> | null;
};

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  try {
    const user = await scanUserFromClerk(supabaseAdmin, userId);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const cutoff = new Date(Date.now() - GRACE_MS).toISOString();
    const ids = await scannableEventIds(supabaseAdmin, user);

    let rows: Row[];
    if (ids === null) {
      const { data, error } = await supabaseAdmin
        .from("events")
        .select(FIELDS)
        .eq("status", "published")
        .gte("ends_at", cutoff)
        .order("starts_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      rows = (data ?? []) as unknown as Row[];
    } else {
      rows = await selectAllPagesByIds<Row>(ids, (chunk, from, to) =>
        supabaseAdmin!.from("events").select(FIELDS).in("id", chunk).order("id").range(from, to)
      );
    }

    const events = rows
      .filter((e) => e.status === "published" && e.ends_at >= cutoff)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .map((e) => {
        const org = Array.isArray(e.organizations) ? e.organizations[0] : e.organizations;
        return {
          id: e.id,
          name: e.name,
          starts_at: e.starts_at,
          ends_at: e.ends_at,
          venue: e.venue,
          city: e.city,
          timezone: e.timezone,
          image_url: e.image_url,
          organization_name: org?.name ?? null,
        };
      });
    return NextResponse.json({ events });
  } catch (error) {
    console.error("[qr-scanner/events]", error);
    return NextResponse.json({ error: "Failed to load events" }, { status: 500 });
  }
}

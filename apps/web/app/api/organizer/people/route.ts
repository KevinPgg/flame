import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";

/**
 * GET /api/organizer/people?organizationId=<id>&q=<text> — people search for organizer tools
 * (team, send tickets, scanners), restricted by design (Kevin, 2026-10-23):
 * - partial matches (name or e-mail) only among people already related to the organization
 *   (members, buyers, RSVP requesters, scanners, ticket recipients) — DB function
 *   `search_org_people`;
 * - anyone else only by their exact e-mail.
 * Owner / admin / organizer of that organization. Response: { people: [{ id, email,
 * first_name, last_name, related }] } — `related` false = found by exact e-mail only.
 */
const ROLES = ["owner", "admin", "organizer"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Person = { id: string; email: string; first_name: string | null; last_name: string | null };

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!supabaseAdmin) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

    const orgId = req.nextUrl.searchParams.get("organizationId") ?? "";
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
    if (!UUID.test(orgId)) return NextResponse.json({ error: "organizationId is required" }, { status: 400 });

    const { data: me } = await supabaseAdmin.from("users").select("id").eq("clerk_id", userId).maybeSingle();
    if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const { data: membership } = await supabaseAdmin
      .from("organization_members")
      .select("role")
      .eq("organization_id", orgId)
      .eq("user_id", me.id)
      .maybeSingle();
    if (!membership || !ROLES.includes(membership.role)) {
      return NextResponse.json({ error: "Unauthorized - organizer access required" }, { status: 403 });
    }

    if (q.length < 2) return NextResponse.json({ people: [] });

    const { data: related, error } = await supabaseAdmin.rpc("search_org_people", { p_org: orgId, p_query: q, p_limit: 8 });
    if (error) {
      console.error("[GET /api/organizer/people] search_org_people failed", { orgId, error });
      return NextResponse.json({ error: "Failed to search people" }, { status: 500 });
    }
    const people: Array<Person & { related: boolean }> = ((related ?? []) as Person[]).map((p) => ({ ...p, related: true }));

    // Outside the circle: only the exact e-mail (stored lowercase).
    const email = q.toLowerCase();
    if (EMAIL.test(email) && !people.some((p) => p.email.toLowerCase() === email)) {
      const { data: exact } = await supabaseAdmin
        .from("users")
        .select("id, email, first_name, last_name")
        .eq("email", email)
        .maybeSingle();
      if (exact) people.unshift({ ...(exact as Person), related: false });
    }
    return NextResponse.json({ people });
  } catch (error) {
    console.error("[GET /api/organizer/people] unexpected error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

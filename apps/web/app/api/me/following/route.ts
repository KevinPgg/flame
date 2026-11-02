import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { followerCounts, isUuid } from "@/app/lib/follows";

/**
 * Organizations the signed-in person follows — Flame 2.0 fase 4.2 (2026-11-02). Web and app.
 *
 * GET → { organizations: [{ id, name, slug, logo_url, city, followers_count }] } — approved
 *       organizations only, last followed first.
 * PUT { organization_id, following: boolean } → { organization_id, following, followers_count }
 *       — idempotent; following needs an approved organization, unfollowing always works.
 */
export const dynamic = "force-dynamic";

async function currentUserId(clerkId: string) {
  const { data, error } = await supabaseAdmin!.from("users").select("id").eq("clerk_id", clerkId).maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}

type Org = { id: string; name: string; slug: string; logo_url: string | null; city: string | null; approved?: boolean };
type Row = { created_at: string; organizations: Org | Org[] | null };

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  try {
    const me = await currentUserId(userId);
    if (!me) return NextResponse.json({ organizations: [] });
    const { data, error } = await supabaseAdmin
      .from("organization_follows")
      .select("created_at, organizations ( id, name, slug, logo_url, city, approved )")
      .eq("user_id", me)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const orgs = ((data ?? []) as Row[])
      .map((r) => (Array.isArray(r.organizations) ? r.organizations[0] : r.organizations))
      .filter((o): o is Org => !!o && o.approved === true);
    const counts = await followerCounts(supabaseAdmin, orgs.map((o) => o.id));
    return NextResponse.json({
      organizations: orgs.map(({ approved: _a, ...o }) => ({ ...o, followers_count: counts[o.id] ?? 0 })),
    });
  } catch (error) {
    console.error("[GET /api/me/following]", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  let body: { organization_id?: unknown; following?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }
  const orgId = body.organization_id;
  if (!isUuid(orgId) || typeof body.following !== "boolean") {
    return NextResponse.json({ error: "organization_id and following are required" }, { status: 400 });
  }

  try {
    const me = await currentUserId(userId);
    if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 });

    if (body.following) {
      const { data: org, error: orgError } = await supabaseAdmin.from("organizations").select("id, approved").eq("id", orgId).maybeSingle();
      if (orgError) throw orgError;
      if (!org || org.approved !== true) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
      const { error } = await supabaseAdmin
        .from("organization_follows")
        .upsert({ user_id: me, organization_id: orgId }, { onConflict: "user_id,organization_id", ignoreDuplicates: true });
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin.from("organization_follows").delete().eq("user_id", me).eq("organization_id", orgId);
      if (error) throw error;
    }
    const counts = await followerCounts(supabaseAdmin, [orgId]);
    return NextResponse.json({ organization_id: orgId, following: body.following, followers_count: counts[orgId] ?? 0 });
  } catch (error) {
    console.error("[PUT /api/me/following]", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

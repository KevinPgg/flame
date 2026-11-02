import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { currentUser } from "@/app/lib/team-invitations";

/**
 * Team invitations for the signed-in person (fase 4.5): open ones sent to their e-mail that
 * haven't expired. GET → { invitations: [{ id, role, expires_at, organization: { id, name, slug, logo_url } }] }
 */
export const dynamic = "force-dynamic";

type Row = { id: string; role: string; expires_at: string; organizations: { id: string; name: string; slug: string; logo_url: string | null } | Array<{ id: string; name: string; slug: string; logo_url: string | null }> | null };

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const me = await currentUser(supabaseAdmin, userId);
  if (!me?.email) return NextResponse.json({ invitations: [] });
  const { data, error } = await supabaseAdmin
    .from("organization_invitations")
    .select("id, role, expires_at, organizations ( id, name, slug, logo_url )")
    .eq("email", me.email.trim().toLowerCase())
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[GET /api/me/invitations]", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
  const now = Date.now();
  return NextResponse.json({
    invitations: ((data ?? []) as Row[])
      .filter((r) => new Date(r.expires_at).getTime() > now)
      .map((r) => ({ id: r.id, role: r.role, expires_at: r.expires_at, organization: Array.isArray(r.organizations) ? r.organizations[0] ?? null : r.organizations }))
      .filter((r) => r.organization),
  });
}

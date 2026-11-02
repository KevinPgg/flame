import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { acceptInvitation, currentUser, declineInvitation, sameEmail, type Invitation } from "@/app/lib/team-invitations";

/**
 * Answer an invitation sent to my e-mail (fase 4.5). POST { action: "accept" | "decline" }
 * → { status, organization: { id, slug, name } }.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ invitationId: string }> }) {
  const { invitationId } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  let action: unknown;
  try {
    action = ((await req.json()) as { action?: unknown }).action;
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }
  if (action !== "accept" && action !== "decline") return NextResponse.json({ error: "action must be accept or decline" }, { status: 400 });
  try {
    const me = await currentUser(supabaseAdmin, userId);
    const { data } = await supabaseAdmin.from("organization_invitations").select("*").eq("id", invitationId).maybeSingle();
    const inv = data as Invitation | null;
    if (!me || !inv || !sameEmail(inv.email, me.email)) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    const r = action === "accept" ? await acceptInvitation(supabaseAdmin, inv, me.id) : await declineInvitation(supabaseAdmin, inv);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    const { data: org } = await supabaseAdmin.from("organizations").select("id, slug, name").eq("id", inv.organization_id).maybeSingle();
    return NextResponse.json({ status: action === "accept" ? "accepted" : "declined", organization: org });
  } catch (error) {
    console.error("[POST /api/me/invitations/:id]", error);
    return NextResponse.json({ error: "Failed to answer" }, { status: 500 });
  }
}

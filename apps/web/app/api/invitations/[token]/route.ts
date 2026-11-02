import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { invitationState } from "@project-flame/lib";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { acceptInvitation, currentUser, declineInvitation, sameEmail, type Invitation } from "@/app/lib/team-invitations";

/**
 * The e-mail link /invite/<token> (fase 4.5).
 * GET (public) → { organization: { name, slug, logo_url }, role, email, state }
 * POST { action } (signed in, with the invited e-mail) → { status, organization }
 */
export const dynamic = "force-dynamic";

async function byToken(token: string) {
  if (!token || token.length > 100) return null;
  const { data } = await supabaseAdmin!.from("organization_invitations").select("*").eq("token", token).maybeSingle();
  return (data as Invitation | null) ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!supabaseAdmin) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const inv = await byToken((await params).token);
  if (!inv) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  const { data: org } = await supabaseAdmin.from("organizations").select("id, name, slug, logo_url").eq("id", inv.organization_id).maybeSingle();
  return NextResponse.json({ organization: org, role: inv.role, email: inv.email, state: invitationState(inv), expires_at: inv.expires_at });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
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
    const inv = await byToken((await params).token);
    if (!inv) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    const me = await currentUser(supabaseAdmin, userId);
    if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 });
    // The link is only a way in: the account must be the invited e-mail.
    if (!sameEmail(inv.email, me.email)) return NextResponse.json({ error: "This invitation is for another e-mail", code: "WRONG_ACCOUNT" }, { status: 403 });
    const r = action === "accept" ? await acceptInvitation(supabaseAdmin, inv, me.id) : await declineInvitation(supabaseAdmin, inv);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    const { data: org } = await supabaseAdmin.from("organizations").select("id, slug, name").eq("id", inv.organization_id).maybeSingle();
    return NextResponse.json({ status: action === "accept" ? "accepted" : "declined", organization: org });
  } catch (error) {
    console.error("[POST /api/invitations/:token]", error);
    return NextResponse.json({ error: "Failed to answer" }, { status: 500 });
  }
}

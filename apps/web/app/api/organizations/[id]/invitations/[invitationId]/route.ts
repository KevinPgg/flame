import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { invitationExpiry } from "@project-flame/lib";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { notifyInvitation, requireOrgAdmin, type Invitation } from "@/app/lib/team-invitations";

/**
 * One invitation of the organization (fase 4.5). Owners / admins.
 * POST → re-send (7 new days, same link) · DELETE → cancel.
 */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; invitationId: string }> };

async function load(orgId: string, invitationId: string, clerk: string) {
  if (!supabaseAdmin) return { res: NextResponse.json({ error: "Database not configured" }, { status: 500 }) };
  const gate = await requireOrgAdmin(supabaseAdmin, orgId, clerk);
  if ("error" in gate) return { res: NextResponse.json({ error: gate.error }, { status: gate.status }) };
  const { data } = await supabaseAdmin.from("organization_invitations").select("*").eq("id", invitationId).eq("organization_id", orgId).maybeSingle();
  if (!data || (data as Invitation).status !== "pending") return { res: NextResponse.json({ error: "Invitation not found" }, { status: 404 }) };
  return { inv: data as Invitation, me: gate.me };
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id: orgId, invitationId } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await load(orgId, invitationId, userId);
  if ("res" in r) return r.res;
  try {
    const expires_at = invitationExpiry();
    const { error } = await supabaseAdmin!.from("organization_invitations").update({ expires_at, invited_by: r.me.id }).eq("id", r.inv.id);
    if (error) throw error;
    const { data: org } = await supabaseAdmin!.from("organizations").select("name").eq("id", orgId).maybeSingle();
    const inviterName = [r.me.first_name, r.me.last_name].filter(Boolean).join(" ") || r.me.email || "";
    const sent = await notifyInvitation(supabaseAdmin!, { ...r.inv, expires_at }, { orgName: (org as { name?: string } | null)?.name ?? "Flame", inviterName });
    return NextResponse.json({ id: r.inv.id, expires_at, emailSent: sent.email });
  } catch (error) {
    console.error("[POST invitation resend]", error);
    return NextResponse.json({ error: "Failed to resend" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id: orgId, invitationId } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await load(orgId, invitationId, userId);
  if ("res" in r) return r.res;
  const { error } = await supabaseAdmin!
    .from("organization_invitations")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("id", r.inv.id)
    .eq("status", "pending");
  if (error) {
    console.error("[DELETE invitation]", error);
    return NextResponse.json({ error: "Failed to cancel" }, { status: 500 });
  }
  return NextResponse.json({ id: r.inv.id, status: "cancelled" });
}

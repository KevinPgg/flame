import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { invitationState, isInviteRole, isValidInviteEmail, normalizeInviteEmail } from "@project-flame/lib";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { notifyInvitation, requireOrgAdmin, upsertInvitation, type Invitation } from "@/app/lib/team-invitations";

/**
 * Team invitations of an organization (fase 4.5). Owners / admins.
 * GET → { invitations: [{ id, email, role, state: "pending" | "expired", created_at, expires_at }] }
 * POST { email, role: "admin" | "organizer" } → { invitation, resent, emailSent }
 *   409 if that e-mail is already a member. Inviting again the same e-mail re-sends it.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const gate = await requireOrgAdmin(supabaseAdmin, orgId, userId);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { data, error } = await supabaseAdmin
    .from("organization_invitations")
    .select("id, email, role, status, created_at, expires_at")
    .eq("organization_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[GET invitations]", error);
    return NextResponse.json({ error: "Failed to load invitations" }, { status: 500 });
  }
  return NextResponse.json({
    // Pick the public fields explicitly: the invite token must never reach this list, even if
    // the select above changes or the client returns extra columns.
    invitations: ((data ?? []) as Invitation[]).map(({ id, email, role, created_at, expires_at }) => ({
      id,
      email,
      role,
      created_at,
      expires_at,
      state: invitationState({ status: "pending", expires_at }),
    })),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const db = supabaseAdmin;
  const gate = await requireOrgAdmin(db, orgId, userId);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: { email?: unknown; role?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? normalizeInviteEmail(body.email) : "";
  if (!isValidInviteEmail(email)) return NextResponse.json({ error: "Enter a valid e-mail", code: "EMAIL_INVALID" }, { status: 400 });
  if (!isInviteRole(body.role)) return NextResponse.json({ error: "role must be admin or organizer" }, { status: 400 });

  try {
    // Already in the team?
    const { data: user } = await db.from("users").select("id").eq("email", email).maybeSingle();
    if (user) {
      const { data: member } = await db.from("organization_members").select("id").eq("organization_id", orgId).eq("user_id", (user as { id: string }).id).maybeSingle();
      if (member) return NextResponse.json({ error: "Already a member", code: "ALREADY_MEMBER" }, { status: 409 });
    }
    const { invitation, resent } = await upsertInvitation(db, { orgId, email, role: body.role, invitedBy: gate.me.id });
    const { data: org } = await db.from("organizations").select("name").eq("id", orgId).maybeSingle();
    const inviterName = [gate.me.first_name, gate.me.last_name].filter(Boolean).join(" ") || gate.me.email || "";
    const sent = await notifyInvitation(db, invitation, { orgName: (org as { name?: string } | null)?.name ?? "Flame", inviterName });
    const { token: _t, ...safe } = invitation;
    return NextResponse.json({ invitation: { ...safe, state: "pending" }, resent, emailSent: sent.email });
  } catch (error) {
    console.error("[POST invitations]", error);
    return NextResponse.json({ error: "Failed to invite" }, { status: 500 });
  }
}

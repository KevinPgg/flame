import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabase/server";
import { sendOrgApprovalEmail } from "../../../../../lib/email/org-notifications";
import { requireSupportAdmin } from "../../../_lib";
import { notifyOrganizationReview } from "../../../../../lib/org-review-notification";

/**
 * POST /api/admin/organizations/[id]/approve
 *
 * Support-only (W7-H1). Sets `approved = true` (+ audit cols) and clears any
 * prior rejection. Idempotent — approving an already-approved org is a no-op.
 * Emails the owner on a fresh approval and sends an in-app notification + push
 * (fire-and-forget; failure never blocks).
 */
type OwnerJoin =
  | { email: string | null; first_name: string | null; last_name: string | null }
  | Array<{ email: string | null; first_name: string | null; last_name: string | null }>
  | null;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: orgId } = await params;
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const gate = await requireSupportAdmin(userId);
    if ("error" in gate) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const { data: org, error: fetchError } = await supabaseAdmin
      .from("organizations")
      .select(
        `id, name, slug, approved, owner_user_id,
         owner:owner_user_id ( email, first_name, last_name )`,
      )
      .eq("id", orgId)
      .maybeSingle();

    if (fetchError) {
      console.error("[POST approve] org lookup error", { orgId, error: fetchError });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // Idempotent fast-path: already approved → no-op (no duplicate email).
    if (org.approved) {
      return NextResponse.json({ success: true, alreadyApproved: true });
    }

    // Atomic transition: only update rows still unapproved. If a concurrent
    // request approved it first, this matches 0 rows and we skip the email +
    // member-add below so each fires exactly once.
    const { data: updatedRows, error: updateError } = await supabaseAdmin
      .from("organizations")
      .update({
        approved: true,
        approved_at: new Date().toISOString(),
        approved_by: gate.callerUserId,
        rejected_at: null,
        rejected_by: null,
        rejection_reason: null,
      })
      .eq("id", orgId)
      .eq("approved", false)
      .select("id");

    if (updateError) {
      console.error("[POST approve] update failed", { orgId, error: updateError });
      return NextResponse.json({ error: "Failed to approve organization" }, { status: 500 });
    }

    if (!updatedRows || updatedRows.length === 0) {
      // Lost the race — approved by a concurrent request. No duplicate email.
      return NextResponse.json({ success: true, alreadyApproved: true });
    }

    // Add the approving support admin as an `admin` team member so they can
    // manage the org going forward. Idempotent: `ignoreDuplicates` leaves an
    // existing membership (e.g. if they already belong) untouched — never
    // demotes an owner. Non-fatal: the approval already succeeded.
    const { error: memberError } = await supabaseAdmin
      .from("organization_members")
      .upsert(
        { organization_id: orgId, user_id: gate.callerUserId, role: "admin" },
        { onConflict: "organization_id,user_id", ignoreDuplicates: true },
      );
    if (memberError) {
      console.error("[POST approve] add support member failed", { orgId, error: memberError });
    }

    // Notify the owner (fire-and-forget — email failure must not fail approval).
    const ownerRaw = org.owner as OwnerJoin;
    const owner = Array.isArray(ownerRaw) ? ownerRaw[0] : ownerRaw;
    const ownerEmail = owner?.email ?? null;
    if (ownerEmail) {
      const ownerName =
        [owner?.first_name, owner?.last_name].filter(Boolean).join(" ").trim() || "there";
      void sendOrgApprovalEmail({
        ownerEmail,
        ownerName,
        organizationName: org.name,
        organizationSlug: org.slug,
      }).catch(err => {
        console.error("[POST approve] approval email failed", { orgId, error: err });
      });
    }

    await notifyOrganizationReview({
      ownerUserId: (org as { owner_user_id?: string | null }).owner_user_id,
      organizationId: org.id,
      organizationName: org.name,
      decision: "approved",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST approve] unexpected", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

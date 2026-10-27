import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "../../../../../lib/supabase/server";
import { requireSupportAdmin } from "../../../_lib";
import { notifyOrganizationReview } from "../../../../../lib/org-review-notification";

/**
 * POST /api/admin/organizations/[id]/reject
 *
 * Support-only (W7-H1). Marks a pending org as rejected (audit cols + optional
 * reason); keeps `approved = false`. Idempotent — re-rejecting just refreshes
 * the timestamp/reason. No email (decision: approve-only); the owner gets an
 * in-app notification + push with the reason (2026-10-27).
 */
const bodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export async function POST(
  req: NextRequest,
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

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      // Empty/malformed body is fine — reason is optional.
      body = {};
    }
    const { reason } = bodySchema.parse(body ?? {});

    const { data: org, error: fetchError } = await supabaseAdmin
      .from("organizations")
      .select("id, name, approved, owner_user_id")
      .eq("id", orgId)
      .maybeSingle();

    if (fetchError) {
      console.error("[POST reject] org lookup error", { orgId, error: fetchError });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    if (org.approved) {
      return NextResponse.json(
        { error: "Cannot reject an approved organization" },
        { status: 409 },
      );
    }

    // Atomic: only reject if still unapproved, so a concurrent approve can't be
    // silently overwritten back to approved=false (0 rows → 409).
    const { data: updatedRows, error: updateError } = await supabaseAdmin
      .from("organizations")
      .update({
        approved: false,
        rejected_at: new Date().toISOString(),
        rejected_by: gate.callerUserId,
        rejection_reason: reason && reason.length > 0 ? reason : null,
      })
      .eq("id", orgId)
      .eq("approved", false)
      .select("id");

    if (updateError) {
      console.error("[POST reject] update failed", { orgId, error: updateError });
      return NextResponse.json({ error: "Failed to reject organization" }, { status: 500 });
    }

    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json(
        { error: "Cannot reject an approved organization" },
        { status: 409 },
      );
    }

    await notifyOrganizationReview({
      ownerUserId: (org as { owner_user_id?: string | null }).owner_user_id,
      organizationId: org.id,
      organizationName: (org as { name?: string }).name ?? "",
      decision: "rejected",
      reason: reason && reason.length > 0 ? reason : null,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    console.error("[POST reject] unexpected", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

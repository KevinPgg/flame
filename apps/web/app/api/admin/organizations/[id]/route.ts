import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase/server";
import { requireSupportAdmin } from "../../_lib";

/**
 * DELETE /api/admin/organizations/[id]
 *
 * Support-only (W7-H1). Hard-deletes an UNAPPROVED org (pending or rejected).
 * Guarded: refuses approved orgs, and refuses any org that already has events
 * or orders (defensive — unapproved orgs can't create events, so both should be
 * zero). FK `ON DELETE CASCADE` removes the `organization_members` row(s).
 */
export async function DELETE(
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
      .select("id, approved")
      .eq("id", orgId)
      .maybeSingle();

    if (fetchError) {
      console.error("[DELETE org] lookup error", { orgId, error: fetchError });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    if (org.approved) {
      return NextResponse.json(
        { error: "Cannot delete an approved organization" },
        { status: 409 },
      );
    }

    // Defensive: never cascade-delete real money/event records.
    const [{ count: eventCount, error: evErr }, { count: orderCount, error: ordErr }] =
      await Promise.all([
        supabaseAdmin
          .from("events")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId),
        supabaseAdmin
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId),
      ]);

    if (evErr || ordErr) {
      console.error("[DELETE org] dependency count error", { orgId, evErr, ordErr });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
    if ((eventCount ?? 0) > 0 || (orderCount ?? 0) > 0) {
      return NextResponse.json(
        { error: "Organization has events or orders and cannot be deleted" },
        { status: 409 },
      );
    }

    // Atomic guard: only delete if still unapproved, so an org approved between
    // the check above and here (TOCTOU) is not removed (0 rows → 409).
    const { data: deletedRows, error: deleteError } = await supabaseAdmin
      .from("organizations")
      .delete()
      .eq("id", orgId)
      .eq("approved", false)
      .select("id");

    if (deleteError) {
      console.error("[DELETE org] delete failed", { orgId, error: deleteError });
      return NextResponse.json({ error: "Failed to delete organization" }, { status: 500 });
    }

    if (!deletedRows || deletedRows.length === 0) {
      return NextResponse.json(
        { error: "Cannot delete an approved organization" },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE org] unexpected", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

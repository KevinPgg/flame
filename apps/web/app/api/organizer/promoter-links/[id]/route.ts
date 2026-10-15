import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "../../../../lib/supabase/server";
import { resolveDbUserFromClerkId } from "../../../../lib/auth";
import { requireEventAccess } from "@/app/lib/utils/event-access";

/**
 * DELETE - Delete a promoter link
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database connection error" },
        { status: 500 }
      );
    }

    const { id } = await params;

    // Get current user from database
    const currentUser = await resolveDbUserFromClerkId(userId);

    // Fetch the promoter link to verify ownership
    const { data: promoterLink } = await supabaseAdmin
      .from("promoter_links")
      .select("*, events!inner(organization_id)")
      .eq("id", id)
      .single();

    if (!promoterLink) {
      return NextResponse.json(
        { error: "Promoter link not found" },
        { status: 404 }
      );
    }

    // Check if user has access to this organization
    const { data: membership } = await supabaseAdmin
      .from("organization_members")
      .select("role")
      .eq("organization_id", promoterLink.events.organization_id)
      .eq("user_id", currentUser.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "You don't have access to delete this promoter link" },
        { status: 403 }
      );
    }

    // Role + assignment: organizers only act on events assigned to them (owner/admin: all).
    const denied = await requireEventAccess(supabaseAdmin, currentUser.id, promoterLink.event_id, promoterLink.events.organization_id);
    if (denied) return denied;

    // Check if any orders reference this promoter code for this event
    const { data: relatedOrders, error: ordersError } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("promoter_code", promoterLink.promoter_code)
      .eq("event_id", promoterLink.event_id)
      .limit(1);

    if (ordersError) {
      console.error("Error checking for related orders:", ordersError);
      return NextResponse.json(
        { error: "Failed to validate promoter link deletion" },
        { status: 500 }
      );
    }

    if (relatedOrders && relatedOrders.length > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot delete promoter link: there are existing orders associated with this promoter code. Please remove or reassign these orders first.",
        },
        { status: 409 }
      );
    }

    // Delete the promoter link
    const { error: deleteError } = await supabaseAdmin
      .from("promoter_links")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("Error deleting promoter link:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete promoter link" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/organizer/promoter-links/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


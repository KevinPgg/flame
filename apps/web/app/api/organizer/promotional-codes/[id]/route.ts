import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { requireEventAccess } from "@/app/lib/utils/event-access";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 }
      );
    }

    const { id } = await params;

    // Get user from database
    const { data: user } = await supabaseAdmin!
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get the promotional code and verify ownership
    const { data: promotionalCode, error: codeError } = await supabaseAdmin!
      .from("promotional_codes")
      .select(
        `
        id,
        event_id,
        code,
        usage_count,
        events!inner (
          id,
          organization_id,
          organizations!inner (
            id,
            organization_members!inner (
              user_id
            )
          )
        )
      `
      )
      .eq("id", id)
      .single();

    if (codeError || !promotionalCode) {
      return NextResponse.json(
        { error: "Promotional code not found" },
        { status: 404 }
      );
    }

    // Check if user is a member of the organization
    const event = promotionalCode.events as any;
    const isMember = event.organizations.organization_members.some(
      (member: any) => member.user_id === user.id
    );

    if (!isMember) {
      return NextResponse.json(
        { error: "You do not have permission to delete this promotional code" },
        { status: 403 }
      );
    }

    // Role + assignment: organizers only act on events assigned to them (owner/admin: all).
    const denied = await requireEventAccess(supabaseAdmin!, user.id, promotionalCode.event_id, event.organization_id);
    if (denied) return denied;

    // NEW: Check if the code has been used at least once
    // We check both the usage_count field AND existing orders/transactions
    // This prevents "ghost discounts" where a code is used but then deleted (like Tomas's case)
    if (promotionalCode.usage_count > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot delete a promotional code that has been used. You can set the usage limit to its current usage count to stop future uses.",
        },
        { status: 409 }
      );
    }

    // Double check against orders table to be absolutely sure (in case usage_count is out of sync)
    const { count: orderCount, error: countError } = await supabaseAdmin!
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("promotional_code_id", id);

    if (countError) {
      console.error(
        "❌ Failed to verify promotional code usage against orders:",
        countError
      );
      return NextResponse.json(
        { error: "Failed to verify promotional code usage" },
        { status: 500 }
      );
    }

    if (orderCount && orderCount > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot delete a promotional code that is linked to existing orders.",
        },
        { status: 409 }
      );
    }

    // Delete the promotional code
    const { error: deleteError } = await supabaseAdmin!
      .from("promotional_codes")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("Error deleting promotional code:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete promotional code" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Promotional code deleted successfully",
    });
  } catch (error) {
    console.error("❌ Promotional code deletion error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

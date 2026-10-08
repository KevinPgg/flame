import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "../../../lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId || !supabaseAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { holdSessionId } = body;

    if (!holdSessionId) {
      return NextResponse.json(
        { error: "Hold session ID is required" },
        { status: 400 }
      );
    }

    // Get the user's Supabase ID
    const { data: supabaseUser, error: userError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (userError || !supabaseUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify the hold belongs to this user before deleting
    // Include event slug for on-demand revalidation
    const { data: hold, error: holdError } = await supabaseAdmin
      .from("holds")
      .select(`
        id,
        user_id,
        order_id,
        event_id,
        events!inner (
          slug
        )
      `)
      .eq("id", holdSessionId)
      .single();

    if (holdError || !hold) {
      // Hold doesn't exist - that's fine, consider it cancelled
      return NextResponse.json({
        success: true,
        message: "Hold not found or already cancelled",
      });
    }

    // Verify ownership
    if (hold.user_id !== supabaseUser.id) {
      return NextResponse.json(
        { error: "You don't have permission to cancel this hold" },
        { status: 403 }
      );
    }

    // Don't allow cancelling holds that are already converted to orders
    if (hold.order_id) {
      return NextResponse.json(
        { error: "Cannot cancel a hold that has been converted to an order" },
        { status: 409 }
      );
    }

    // Delete the hold - this releases the tickets back to inventory
    const { error: deleteError } = await supabaseAdmin
      .from("holds")
      .delete()
      .eq("id", holdSessionId)
      .eq("user_id", supabaseUser.id); // Double-check ownership

    if (deleteError) {
      console.error("Error deleting hold:", deleteError);
      return NextResponse.json(
        { error: "Failed to cancel hold" },
        { status: 500 }
      );
    }

    console.log(`✅ Hold ${holdSessionId} cancelled by user ${userId}`);

    // ⚡ ON-DEMAND REVALIDATION: Clear event page cache when hold is cancelled
    // This ensures availability updates immediately for other users
    try {
      // Supabase returns joined relations as arrays, even for one-to-one relationships
      const eventSlug = Array.isArray(hold.events) 
        ? hold.events[0]?.slug 
        : (hold.events as { slug: string } | null)?.slug;
      
      if (eventSlug) {
        revalidatePath(`/events/${eventSlug}`);
        console.log(`[HOLD_CANCEL] Revalidated event page: /events/${eventSlug}`);
      }
    } catch (revalidationError) {
      console.error("[HOLD_CANCEL] Warning: Cache revalidation failed:", revalidationError);
      // Don't fail the cancellation if cache revalidation fails
    }

    return NextResponse.json({
      success: true,
      message: "Hold cancelled successfully",
    });
  } catch (error) {
    console.error("Error in POST /api/holds/cancel:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

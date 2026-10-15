import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "../../../lib/supabase/server";
import { resolveDbUserFromClerkId } from "../../../lib/auth";
import { extractBasePriceHistorical } from "@project-flame/lib";
import { requireEventAccess } from "@/app/lib/utils/event-access";

/**
 * GET - List all promoter links for an event with sales statistics
 */
export async function GET(req: NextRequest) {
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

    // Store reference to avoid TypeScript narrowing issues in closures
    const db = supabaseAdmin;

    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("event_id");

    if (!eventId) {
      return NextResponse.json(
        { error: "event_id is required" },
        { status: 400 }
      );
    }

    // Get current user from database
    const currentUser = await resolveDbUserFromClerkId(userId);

    // Verify user is organizer of the event
    const { data: event } = await db
      .from("events")
      .select("organization_id, organizations!inner(id)")
      .eq("id", eventId)
      .single();

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Check if user has access to this organization
    const { data: membership } = await db
      .from("organization_members")
      .select("role")
      .eq("organization_id", event.organization_id)
      .eq("user_id", currentUser.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "You don't have access to this event" },
        { status: 403 }
      );
    }

    // Role + assignment: organizers only act on events assigned to them (owner/admin: all).
    const denied = await requireEventAccess(db, currentUser.id, eventId, event.organization_id);
    if (denied) return denied;

    // Fetch promoter links for this event
    const { data: promoterLinks, error: linksError } = await db
      .from("promoter_links")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });

    if (linksError) {
      console.error("Error fetching promoter links:", linksError);
      return NextResponse.json(
        { error: "Failed to fetch promoter links" },
        { status: 500 }
      );
    }

    // Fetch sales statistics for each promoter code
    const promoterLinksWithStats = await Promise.all(
      (promoterLinks || []).map(async link => {
        const { data: orders } = await db
          .from("orders")
          .select(
            "quantity, total_amount_cents, discount_amount_cents, fee_percentage, created_at, base_price_cents"
          )
          .eq("event_id", eventId)
          .eq("promoter_code", link.promoter_code)
          .in("status", ["completed", "paid"]);

        const totalTickets = (orders || []).reduce(
          (sum, order) => sum + order.quantity,
          0
        );
        const totalRevenue = (orders || []).reduce((sum, order) => {
          // Calculate the base price the organizer receives
          // PRIORITY: Use stored base_price_cents if available (Stripe Guaranteed Net model)
          // This field already contains the final discounted base price
          const totalCents = order.total_amount_cents || 0;
          const discountCents = order.discount_amount_cents || 0;
          
          let actualBasePrice: number;
          
          if (order.base_price_cents !== null && order.base_price_cents !== undefined) {
            // Stripe Guaranteed Net model: base_price_cents is the final discounted base price
            actualBasePrice = order.base_price_cents;
          } else {
            // Legacy Datafast model: extract base price from total
            // total_amount_cents = (base + service_fee + iva) - discount
            // So: subtotal_before_discount = total_amount_cents + discount_amount_cents
            // Use historical extraction to get correct markup rate based on order date
            const subtotalBeforeDiscount = totalCents + discountCents;
            const priceBreakdown = extractBasePriceHistorical(
              subtotalBeforeDiscount,
              order.created_at,
              order.fee_percentage
            );
            
            actualBasePrice = priceBreakdown.basePriceCents;
            // Calculate the actual base price the organizer receives (after discount)
            // If discount was applied, subtract it proportionally from the base price
            if (discountCents > 0 && subtotalBeforeDiscount > 0) {
              const discountProportion = discountCents / subtotalBeforeDiscount;
              actualBasePrice = Math.round(
                priceBreakdown.basePriceCents * (1 - discountProportion)
              );
            }
          }

          return sum + actualBasePrice;
        }, 0);

        return {
          ...link,
          total_tickets_sold: totalTickets,
          total_revenue_cents: totalRevenue,
        };
      })
    );

    return NextResponse.json({ promoter_links: promoterLinksWithStats });
  } catch (error) {
    console.error("Error in GET /api/organizer/promoter-links:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST - Create a new promoter link
 */
export async function POST(req: NextRequest) {
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

    // Store reference to avoid TypeScript narrowing issues
    const db = supabaseAdmin;

    const { event_id, promoter_code, promoter_name } = await req.json();

    // Validate inputs
    if (!event_id || !promoter_code) {
      return NextResponse.json(
        { error: "event_id and promoter_code are required" },
        { status: 400 }
      );
    }

    // Validate promoter code format (alphanumeric, uppercase)
    const normalizedCode = promoter_code.toUpperCase().trim();
    if (!/^[A-Z0-9]+$/.test(normalizedCode)) {
      return NextResponse.json(
        { error: "Promoter code must be alphanumeric" },
        { status: 400 }
      );
    }

    if (normalizedCode.length < 3 || normalizedCode.length > 50) {
      return NextResponse.json(
        { error: "Promoter code must be between 3 and 50 characters" },
        { status: 400 }
      );
    }

    // Get current user from database
    const currentUser = await resolveDbUserFromClerkId(userId);

    // Verify user is organizer of the event
    const { data: event } = await db
      .from("events")
      .select("organization_id, slug, organizations!inner(id)")
      .eq("id", event_id)
      .single();

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Check if user has access to this organization
    const { data: membership } = await db
      .from("organization_members")
      .select("role")
      .eq("organization_id", event.organization_id)
      .eq("user_id", currentUser.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "You don't have access to this event" },
        { status: 403 }
      );
    }

    // Role + assignment: organizers only act on events assigned to them (owner/admin: all).
    const denied = await requireEventAccess(db, currentUser.id, event_id, event.organization_id);
    if (denied) return denied;

    // Create promoter link
    const { data: promoterLink, error: createError } = await db
      .from("promoter_links")
      .insert({
        event_id,
        promoter_code: normalizedCode,
        promoter_name: promoter_name?.trim() || null,
        created_by: currentUser.id,
      })
      .select()
      .single();

    if (createError) {
      // Check for unique constraint violation
      if (createError.code === "23505") {
        return NextResponse.json(
          {
            error:
              "A promoter link with this code already exists for this event",
          },
          { status: 409 }
        );
      }

      console.error("Error creating promoter link:", createError);
      return NextResponse.json(
        { error: "Failed to create promoter link" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      promoter_link: {
        ...promoterLink,
        total_tickets_sold: 0,
        total_revenue_cents: 0,
      },
    });
  } catch (error) {
    console.error("Error in POST /api/organizer/promoter-links:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const { code, event_id, subtotal_cents } = body;

    // Validate required fields
    if (
      !code ||
      !event_id ||
      subtotal_cents === undefined ||
      subtotal_cents === null
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate subtotal_cents as integer cents with bounds
    // Maximum: 100,000,000 cents = $1,000,000
    const MAX_CENTS = 100_000_000;

    const subtotalNumRaw =
      typeof subtotal_cents === "string"
        ? Number(subtotal_cents)
        : subtotal_cents;
    const subtotalNum = Number.isFinite(subtotalNumRaw)
      ? Math.trunc(subtotalNumRaw)
      : NaN;

    if (
      !Number.isInteger(subtotalNum) ||
      subtotalNum < 0 ||
      subtotalNum > MAX_CENTS
    ) {
      return NextResponse.json(
        {
          error: `subtotal_cents must be an integer between 0 and ${MAX_CENTS.toLocaleString()} cents ($${(
            MAX_CENTS / 100
          ).toLocaleString()})`,
        },
        { status: 400 }
      );
    }

    const sanitizedCode = code.trim().toUpperCase();

    // Find the promotional code
    const { data: promotionalCode, error: codeError } = await supabaseAdmin!
      .from("promotional_codes")
      .select(
        `
        id,
        code,
        discount_percentage,
        usage_limit,
        usage_count,
        event_id,
        events!inner (
          id,
          status
        )
      `
      )
      .eq("event_id", event_id)
      .eq("code", sanitizedCode)
      .single();

    if (codeError || !promotionalCode) {
      return NextResponse.json(
        { error: "Invalid discount code" },
        { status: 404 }
      );
    }

    // Check if event is published
    const event = promotionalCode.events as any;
    if (event.status !== "published") {
      return NextResponse.json(
        { error: "This discount code is not available" },
        { status: 400 }
      );
    }

    // Check if usage limit has been reached
    if (promotionalCode.usage_count >= promotionalCode.usage_limit) {
      return NextResponse.json(
        { error: "This discount code has reached its usage limit" },
        { status: 400 }
      );
    }

    // Calculate discount amount using the validated subtotal
    // IMPORTANT: Must use Math.round() to match the ROUND() logic in complete_hold_purchase function
    // This ensures discount validation passes when completing the purchase
    const discountAmount = Math.round(
      (subtotalNum * promotionalCode.discount_percentage) / 100
    );

    // Ensure discount doesn't exceed subtotal
    const finalDiscountAmount = Math.min(discountAmount, subtotalNum);

    // Calculate final total
    const finalTotal = Math.max(0, subtotalNum - finalDiscountAmount);

    return NextResponse.json({
      valid: true,
      promotional_code: {
        id: promotionalCode.id,
        code: promotionalCode.code,
        discount_percentage: promotionalCode.discount_percentage,
        usage_remaining:
          promotionalCode.usage_limit - promotionalCode.usage_count,
      },
      discount_amount_cents: finalDiscountAmount,
      final_total_cents: finalTotal,
    });
  } catch (error) {
    console.error("❌ Promotional code validation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

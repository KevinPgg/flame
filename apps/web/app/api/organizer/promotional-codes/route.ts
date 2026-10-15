import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { requireEventAccess } from "@/app/lib/utils/event-access";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user from database
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await req.json();
    const { event_id, code, discount_percentage, usage_limit } = body;

    // Validate required fields
    if (!event_id || !code || !discount_percentage || !usage_limit) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate code format (alphanumeric only, no spaces)
    const codeRegex = /^[A-Z0-9]+$/;
    const sanitizedCode = code.trim().toUpperCase();

    if (!codeRegex.test(sanitizedCode)) {
      return NextResponse.json(
        {
          error:
            "Promotional code must contain only letters and numbers (no spaces or special characters)",
        },
        { status: 400 }
      );
    }

    if (sanitizedCode.length < 3 || sanitizedCode.length > 20) {
      return NextResponse.json(
        { error: "Promotional code must be between 3 and 20 characters" },
        { status: 400 }
      );
    }

    // Validate discount percentage (5-100 in increments of 5)
    const percentageNum = parseInt(discount_percentage);
    if (
      isNaN(percentageNum) ||
      percentageNum < 5 ||
      percentageNum > 100 ||
      percentageNum % 5 !== 0
    ) {
      return NextResponse.json(
        {
          error:
            "Discount percentage must be between 5 and 100 in increments of 5",
        },
        { status: 400 }
      );
    }

    // Validate usage limit
    const usageLimitNum = parseInt(usage_limit);
    if (isNaN(usageLimitNum) || usageLimitNum < 1) {
      return NextResponse.json(
        { error: "Usage limit must be at least 1" },
        { status: 400 }
      );
    }

    // Verify organizer has access to this event
    const { data: event, error: eventError } = await supabaseAdmin
      .from("events")
      .select(
        `
        id,
        organization_id,
        organizations!inner (
          id,
          organization_members!inner (
            user_id
          )
        )
      `
      )
      .eq("id", event_id)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Check if user is a member of the organization
    const isMember = (event.organizations as any).organization_members.some(
      (member: any) => member.user_id === user.id
    );

    if (!isMember) {
      return NextResponse.json(
        {
          error:
            "You do not have permission to create promotional codes for this event",
        },
        { status: 403 }
      );
    }

    // Role + assignment: organizers only act on events assigned to them (owner/admin: all).
    const denied = await requireEventAccess(supabaseAdmin, user.id, event.id, event.organization_id);
    if (denied) return denied;

    // Create promotional code (DB unique constraint will enforce uniqueness)
    const { data: promotionalCode, error: createError } = await supabaseAdmin
      .from("promotional_codes")
      .insert({
        event_id,
        code: sanitizedCode,
        discount_percentage: percentageNum,
        usage_limit: usageLimitNum,
        usage_count: 0,
        created_by: user.id,
      })
      .select()
      .single();

    if (createError) {
      console.error("Error creating promotional code:", createError);

      // Check if it's a unique constraint violation (PostgreSQL error code 23505)
      if (createError.code === "23505") {
        return NextResponse.json(
          { error: "This promotional code already exists for this event" },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "Failed to create promotional code" },
        { status: 500 }
      );
    }

    if (!promotionalCode) {
      return NextResponse.json(
        { error: "Failed to create promotional code" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Promotional code created successfully",
      promotional_code: promotionalCode,
    });
  } catch (error) {
    console.error("❌ Promotional code creation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("event_id");

    if (!eventId) {
      return NextResponse.json(
        { error: "Event ID is required" },
        { status: 400 }
      );
    }

    // Get user from database
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify organizer has access to this event
    const { data: event, error: eventError } = await supabaseAdmin
      .from("events")
      .select(
        `
        id,
        organization_id,
        organizations!inner (
          id,
          organization_members!inner (
            user_id
          )
        )
      `
      )
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Check if user is a member of the organization
    const isMember = (event.organizations as any).organization_members.some(
      (member: any) => member.user_id === user.id
    );

    if (!isMember) {
      return NextResponse.json(
        {
          error:
            "You do not have permission to view promotional codes for this event",
        },
        { status: 403 }
      );
    }

    // Role + assignment: organizers only act on events assigned to them (owner/admin: all).
    const denied = await requireEventAccess(supabaseAdmin, user.id, event.id, event.organization_id);
    if (denied) return denied;

    // Get promotional codes for this event
    const { data: promotionalCodes, error: codesError } = await supabaseAdmin
      .from("promotional_codes")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });

    if (codesError) {
      console.error("Error fetching promotional codes:", codesError);
      return NextResponse.json(
        { error: "Failed to fetch promotional codes" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      promotional_codes: promotionalCodes || [],
    });
  } catch (error) {
    console.error("❌ Promotional codes fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

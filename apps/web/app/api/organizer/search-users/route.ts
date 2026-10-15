import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";

export async function GET(req: NextRequest) {
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

    // Get search parameters
    const searchParams = req.nextUrl.searchParams;
    const email = searchParams.get("email");

    // Validate input
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const trimmedEmail = email.trim().toLowerCase();

    if (!emailRegex.test(trimmedEmail)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Get user from database (verify they exist)
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (userError) {
      console.error("Error fetching user:", userError);
      return NextResponse.json(
        { error: "Failed to fetch user data" },
        { status: 500 }
      );
    }

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify user is an organizer (has organization membership)
    // Use limit(1) instead of maybeSingle() to handle users with multiple organizations
    const { data: memberships, error: membershipError } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      // Only roles that can send tickets look users up by email (viewer can't).
      .in("role", ["owner", "admin", "organizer"])
      .limit(1);

    if (membershipError) {
      console.error("Error fetching memberships:", membershipError);
      return NextResponse.json(
        { error: "Failed to verify organizer permissions" },
        { status: 500 }
      );
    }

    if (!memberships || memberships.length === 0) {
      return NextResponse.json(
        { error: "Unauthorized - organizer access required" },
        { status: 403 }
      );
    }

    // Search user by exact email match (case-insensitive through normalization)
    // Emails are stored lowercase in the database, so use .eq() for exact matching
    // This avoids .ilike() wildcard issues with _ or % characters in email addresses
    const { data: foundUser, error: searchError } = await supabaseAdmin
      .from("users")
      .select("id, email, first_name, last_name")
      .eq("email", trimmedEmail)
      .maybeSingle();

    if (searchError) {
      console.error("Error searching users:", searchError);
      return NextResponse.json(
        { error: "Failed to search users" },
        { status: 500 }
      );
    }

    // Return single user or empty array
    return NextResponse.json({ users: foundUser ? [foundUser] : [] });
  } catch (error) {
    console.error("❌ User search error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase/server";

export async function POST() {
  let userId: string | null = null;
  try {
    const authResult = await auth();
    userId = authResult.userId;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clerkUser = await currentUser();

    if (!clerkUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database connection not available" },
        { status: 503 },
      );
    }

    const primaryEmail = clerkUser.primaryEmailAddress?.emailAddress;
    if (!primaryEmail) {
      return NextResponse.json(
        { error: "User must have a primary email address" },
        { status: 400 },
      );
    }

    const DEFAULT_PROFILE_IMAGE_URL =
      "https://jaoqfvugxmtomdufhswa.supabase.co/storage/v1/object/public/profile-images/default.jpg";

    // Check if user already exists to avoid overwriting a custom profile image
    const { data: existingUser, error: lookupError } = await supabaseAdmin
      .from("users")
      .select("profile_image_url")
      .eq("clerk_id", clerkUser.id)
      .maybeSingle();

    if (lookupError) {
      console.error("Error looking up user during sync:", {
        action: "sync-current-user-lookup",
        clerkId: userId,
        errorName: lookupError.name,
        errorCode: (lookupError as { code?: string }).code,
      });
      return NextResponse.json(
        { error: "Failed to look up existing user" },
        { status: 500 },
      );
    }

    const userData = {
      clerk_id: clerkUser.id,
      email: primaryEmail,
      first_name: clerkUser.firstName || null,
      last_name: clerkUser.lastName || null,
      // Set default image only when creating a new user or if no image is set yet
      ...(!existingUser?.profile_image_url && {
        profile_image_url: DEFAULT_PROFILE_IMAGE_URL,
      }),
    };

    const { data, error } = await supabaseAdmin
      .from("users")
      .upsert(userData, { onConflict: "clerk_id" })
      .select("id, clerk_id, email, first_name, last_name")
      .single();

    if (error) {
      console.error("Error upserting user during sync:", {
        action: "sync-current-user",
        clerkId: userId,
        errorName: error.name,
        errorCode: (error as { code?: string }).code,
      });
      return NextResponse.json(
        { error: "Failed to sync user" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      user: data,
    });
  } catch (error) {
    console.error("Error syncing current user:", {
      action: "sync-current-user",
      clerkId: userId,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorCode: (error as { code?: string })?.code,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

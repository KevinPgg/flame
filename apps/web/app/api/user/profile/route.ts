import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  supabaseAdmin,
  isSupabaseConfigured,
} from "../../../lib/supabase/server";

export async function GET() {
  try {
    // Check authentication
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Check if Supabase is configured
    if (!isSupabaseConfigured() || !supabaseAdmin) {
      return NextResponse.json(
        { error: "Database not available" },
        { status: 503 }
      );
    }

    // Fetch user profile from Supabase
    const { data: user, error: fetchError } = await supabaseAdmin
      .from("users")
      .select(
        "id, email, clerk_id, first_name, last_name, profile_image_url"
      )
      .eq("clerk_id", userId)
      .single();

    if (fetchError) {
      console.error("Error fetching user profile:", fetchError);

      if (fetchError.code === "PGRST116") {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      return NextResponse.json(
        { error: "Error fetching user profile" },
        { status: 500 }
      );
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("Error in user profile endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

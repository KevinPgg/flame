import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "../../../lib/supabase/server";
import { resolveDbUserFromClerkId } from "../../../lib/auth";
import { z } from "zod";

const deregisterSchema = z.object({
  expoPushToken: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
    }
    const parsed = deregisterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { expoPushToken } = parsed.data;

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      );
    }

    const dbUser = await resolveDbUserFromClerkId(clerkUserId);

    const { error } = await supabaseAdmin
      .from("push_tokens")
      .delete()
      .eq("user_id", dbUser.id)
      .eq("expo_push_token", expoPushToken);

    if (error) {
      console.error("[push-tokens/deregister] Delete failed:", error);
      return NextResponse.json(
        { error: "Failed to deregister push token" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[push-tokens/deregister] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

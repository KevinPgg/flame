import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "../../../lib/supabase/server";
import { resolveDbUserFromClerkId } from "../../../lib/auth";
import { z } from "zod";
import Expo from "expo-server-sdk";

const registerSchema = z.object({
  expoPushToken: z
    .string()
    .min(1)
    .refine((token) => Expo.isExpoPushToken(token), {
      message: "Invalid Expo push token",
    }),
  deviceId: z.string().optional(),
  platform: z.enum(["ios", "android"]).default("ios"),
});

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { expoPushToken, deviceId, platform } = parsed.data;

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      );
    }

    const dbUser = await resolveDbUserFromClerkId(clerkUserId);

    const { error } = await supabaseAdmin
      .from("push_tokens")
      .upsert(
        {
          user_id: dbUser.id,
          expo_push_token: expoPushToken,
          device_id: deviceId ?? null,
          platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "expo_push_token" },
      );

    if (error) {
      console.error("[push-tokens/register] Upsert failed:", error);
      return NextResponse.json(
        { error: "Failed to register push token" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[push-tokens/register] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

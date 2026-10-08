import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "../../../lib/supabase/server";

const MAX_DESCRIPTION_LENGTH = 500;

const patchSchema = z.object({
  instagram_handle: z
    .string()
    .max(30)
    .nullable()
    .transform(v => (v && v.replace(/^@+/, "").trim()) || null),
  city: z.string().max(100).nullable().transform(v => (v?.trim() ? v.trim() : null)),
  description: z
    .string()
    .max(MAX_DESCRIPTION_LENGTH)
    .nullable()
    .transform(v => (v?.trim() ? v.trim() : null)),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: orgId } = await params;
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      );
    }

    const { data: supabaseUser, error: userError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();
    if (userError) {
      console.error("[PATCH /api/organizations/[id]] user lookup error", {
        orgId,
        error: userError,
      });
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
    if (!supabaseUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Caller must be owner or admin of the target org.
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("organization_members")
      .select("role")
      .eq("user_id", supabaseUser.id)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (membershipError) {
      console.error(
        "[PATCH /api/organizations/[id]] membership lookup error",
        { orgId, userId: supabaseUser.id, error: membershipError },
      );
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Malformed JSON body" },
        { status: 400 },
      );
    }
    const data = patchSchema.parse(body);

    const { error } = await supabaseAdmin
      .from("organizations")
      .update({
        instagram_handle: data.instagram_handle,
        city: data.city,
        description: data.description,
      })
      .eq("id", orgId);

    if (error) {
      console.error("[PATCH /api/organizations/[id]] update failed", {
        orgId,
        error,
      });
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    console.error("[PATCH /api/organizations/[id]] unexpected error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

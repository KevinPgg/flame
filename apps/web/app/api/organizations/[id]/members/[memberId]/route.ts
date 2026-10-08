import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "../../../../../lib/supabase/server";

// Roles assignable via this endpoint. Viewer was dropped to match mobile
// parity (AssignableRole = "admin" | "organizer"); owners are guarded
// separately because owners cannot be reassigned from this surface.
const ROLES = ["admin", "organizer"] as const;

const patchSchema = z.object({
  role: z.enum(ROLES),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  try {
    const { id: orgId, memberId } = await params;
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { data: callerUser } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", clerkUserId)
      .single();
    if (!callerUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { data: callerMembership } = await supabaseAdmin
      .from("organization_members")
      .select("role")
      .eq("user_id", callerUser.id)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (
      !callerMembership ||
      (callerMembership.role !== "owner" && callerMembership.role !== "admin")
    ) {
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
    const { role: newRole } = patchSchema.parse(body);

    // Cannot change an owner's role from this endpoint.
    const { data: target } = await supabaseAdmin
      .from("organization_members")
      .select("role, user_id")
      .eq("id", memberId)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (!target) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    if (target.role === "owner") {
      return NextResponse.json(
        { error: "Owners' roles cannot be changed here" },
        { status: 400 },
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from("organization_members")
      .update({ role: newRole })
      .eq("id", memberId)
      .eq("organization_id", orgId)
      .neq("role", "owner");

    if (updateError) {
      console.error("[PATCH member] update error", updateError);
      return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
    }

    // Clean up event_assignments when changing away from organizer.
    if (newRole !== "organizer" && target.user_id) {
      const { error: cleanupError } = await supabaseAdmin
        .from("event_assignments")
        .delete()
        .eq("user_id", target.user_id)
        .eq("organization_id", orgId);
      if (cleanupError) {
        console.error("[PATCH member] event_assignments cleanup", cleanupError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    console.error("[PATCH member] unexpected", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

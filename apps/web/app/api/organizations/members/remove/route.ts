/**
 * Admin-only endpoint to remove a member from an organization.
 *
 * Authorization: the caller must be an owner or admin of the specified org.
 * The target member cannot be an owner (owners must transfer ownership first).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { z } from "zod";

const bodySchema = z.object({
  orgId: z.string().uuid("Invalid organization ID"),
  memberId: z.string().uuid("Invalid member ID"),
});

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

    const rawBody = await req.text();
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(parsedBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }
    const { orgId, memberId } = parsed.data;

    // Resolve the Supabase user for the caller.
    const { data: callerUser, error: callerError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (callerError) {
      console.error("[remove-member] caller lookup error:", callerError);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
    if (!callerUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify the caller is an owner or admin of this org.
    const { data: callerMembership, error: callerMembershipError } =
      await supabaseAdmin
        .from("organization_members")
        .select("role")
        .eq("organization_id", orgId)
        .eq("user_id", callerUser.id)
        .single();

    if (callerMembershipError) {
      console.error("[remove-member] caller membership lookup error:", callerMembershipError);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
    if (!callerMembership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (
      callerMembership.role !== "owner" &&
      callerMembership.role !== "admin"
    ) {
      return NextResponse.json(
        { error: "Only owners and admins can remove members" },
        { status: 403 }
      );
    }

    // Fetch the target member to guard against removing an owner.
    const { data: targetMember, error: targetError } = await supabaseAdmin
      .from("organization_members")
      .select("role, user_id")
      .eq("id", memberId)
      .eq("organization_id", orgId)
      .single();

    if (targetError) {
      console.error("[remove-member] target member lookup error:", targetError);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
    if (!targetMember) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (targetMember.role === "owner") {
      return NextResponse.json(
        { error: "Owners cannot be removed. Transfer ownership first." },
        { status: 400 }
      );
    }

    // Use .neq("role", "owner") as an atomic guard against TOCTOU:
    // if the role changed to owner between the check above and this delete,
    // the predicate ensures the row is not deleted.
    const { data: deleted, error: deleteError } = await supabaseAdmin
      .from("organization_members")
      .delete()
      .eq("id", memberId)
      .eq("organization_id", orgId)
      .neq("role", "owner")
      .select("id");

    if (deleteError) {
      console.error("[remove-member] delete error:", deleteError);
      return NextResponse.json(
        { error: "Failed to remove member" },
        { status: 500 }
      );
    }

    if (!deleted || deleted.length === 0) {
      return NextResponse.json(
        { error: "Member not found or cannot be removed" },
        { status: 409 }
      );
    }

    // Clean up event_assignments for the removed member in this org.
    // The FK on user_id only cascades on user deletion, not org membership removal,
    // so we must explicitly remove orphaned assignment rows.
    if (targetMember.user_id) {
      const { error: cleanupError } = await supabaseAdmin
        .from("event_assignments")
        .delete()
        .eq("user_id", targetMember.user_id)
        .eq("organization_id", orgId);

      if (cleanupError) {
        // Log but don't fail the request — the membership was already removed.
        console.error("[remove-member] event_assignments cleanup error:", cleanupError);
      }

      // If the user has no remaining org memberships, reset users.role to 'user'
      // so they revert to the attendee view. Without this, a stale users.role of
      // 'organizer' keeps them in the org dashboard with no orgs.
      const { data: remaining, error: remainingError } = await supabaseAdmin
        .from("organization_members")
        .select("id")
        .eq("user_id", targetMember.user_id)
        .limit(1);

      if (remainingError) {
        console.error("[remove-member] remaining membership check error:", remainingError);
      } else if (!remaining || remaining.length === 0) {
        const { error: roleResetError } = await supabaseAdmin
          .from("users")
          .update({ role: "user" })
          .eq("id", targetMember.user_id)
          // Only reset organizer-role users — never overwrite platform admins
          // whose users.role = 'admin' is a separate, platform-level privilege.
          .eq("role", "organizer");

        if (roleResetError) {
          console.error("[remove-member] users.role reset error:", roleResetError);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[remove-member] unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

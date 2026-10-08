import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "../../../../lib/supabase/server";

// Assignable roles via this endpoint. Owner cannot be assigned (created at
// org-creation time, transferable separately); viewer was removed from the
// picker to match mobile parity (AssignableRole = "admin" | "organizer").
const ROLES = ["admin", "organizer"] as const;

async function requireAdmin(orgId: string, clerkUserId: string) {
  if (!supabaseAdmin) return { error: "Database not configured", status: 500 } as const;

  const { data: callerUser } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("clerk_id", clerkUserId)
    .single();
  if (!callerUser) return { error: "User not found", status: 404 } as const;

  const { data: membership } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("user_id", callerUser.id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return { error: "Forbidden", status: 403 } as const;
  }
  return { callerUserId: callerUser.id } as const;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: orgId } = await params;
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const gate = await requireAdmin(orgId, userId);
    if ("error" in gate) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    // Direct join — we already verified the caller is owner/admin via requireAdmin().
    // Cannot call the get_org_members_with_profiles RPC from here because it gates
    // on auth.jwt() ->> 'sub' and supabaseAdmin uses the service role (no JWT).
    const { data, error } = await supabaseAdmin
      .from("organization_members")
      .select(
        `id, user_id, organization_id, role, created_at, updated_at,
         users:user_id ( email, first_name, last_name )`,
      )
      .eq("organization_id", orgId);

    if (error) {
      console.error("[GET members] query error", error);
      return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
    }

    type Row = {
      id: string;
      user_id: string;
      organization_id: string;
      role: string;
      created_at: string;
      updated_at: string;
      users:
        | { email: string | null; first_name: string | null; last_name: string | null }
        | Array<{ email: string | null; first_name: string | null; last_name: string | null }>
        | null;
    };

    const members = (data as unknown as Row[]).map(row => {
      const u = Array.isArray(row.users) ? row.users[0] : row.users;
      return {
        id: row.id,
        user_id: row.user_id,
        organization_id: row.organization_id,
        role: row.role,
        created_at: row.created_at,
        updated_at: row.updated_at,
        user_email: u?.email ?? null,
        user_first_name: u?.first_name ?? null,
        user_last_name: u?.last_name ?? null,
      };
    });

    return NextResponse.json({ members });
  } catch (err) {
    console.error("[GET members] unexpected", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const postSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(ROLES),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: orgId } = await params;
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const gate = await requireAdmin(orgId, clerkUserId);
    if ("error" in gate) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
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
    const { userId: targetUserId, role } = postSchema.parse(body);

    const { data: existing } = await supabaseAdmin
      .from("organization_members")
      .select("id")
      .eq("organization_id", orgId)
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "User is already a member of this organization" },
        { status: 409 },
      );
    }

    const { error: insertError } = await supabaseAdmin
      .from("organization_members")
      .insert({ organization_id: orgId, user_id: targetUserId, role });

    if (insertError) {
      console.error("[POST members] insert error", insertError);
      return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    console.error("[POST members] unexpected", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

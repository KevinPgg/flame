import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "../../../lib/supabase/server";
import { requireSupportAdmin } from "../_lib";

/**
 * GET /api/admin/organizations?status=pending|rejected
 *
 * Support-only (W7-H1). Lists ALL orgs in the requested state (not
 * membership-scoped) with the owner's identity, oldest first (triage queue).
 * Service-role only — must NOT be reachable via normal member RLS.
 *
 *   pending  → approved = false AND rejected_at IS NULL
 *   rejected → rejected_at IS NOT NULL
 */
const statusSchema = z.enum(["pending", "rejected"]).default("pending");

type OwnerJoin =
  | { email: string | null; first_name: string | null; last_name: string | null }
  | Array<{ email: string | null; first_name: string | null; last_name: string | null }>
  | null;

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  rejected_at: string | null;
  rejection_reason: string | null;
  owner: OwnerJoin;
};

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const gate = await requireSupportAdmin(userId);
    if ("error" in gate) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const status = statusSchema.parse(
      req.nextUrl.searchParams.get("status") ?? undefined,
    );

    let query = supabaseAdmin
      .from("organizations")
      .select(
        `id, name, slug, created_at, rejected_at, rejection_reason,
         owner:owner_user_id ( email, first_name, last_name )`,
      )
      .order("created_at", { ascending: true });

    query =
      status === "rejected"
        ? query.not("rejected_at", "is", null)
        : query.eq("approved", false).is("rejected_at", null);

    const { data, error } = await query;
    if (error) {
      console.error("[GET /api/admin/organizations] query error", { status, error });
      return NextResponse.json({ error: "Failed to fetch organizations" }, { status: 500 });
    }

    const organizations = (data as unknown as OrgRow[]).map(row => {
      const o = Array.isArray(row.owner) ? row.owner[0] : row.owner;
      const ownerName = [o?.first_name, o?.last_name].filter(Boolean).join(" ").trim();
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        created_at: row.created_at,
        rejected_at: row.rejected_at,
        rejection_reason: row.rejection_reason,
        owner_email: o?.email ?? null,
        owner_name: ownerName || null,
      };
    });

    return NextResponse.json({ organizations });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? "Invalid status" },
        { status: 400 },
      );
    }
    console.error("[GET /api/admin/organizations] unexpected", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

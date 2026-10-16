import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { accessCodesEnabled } from "@/app/lib/utils/scan-access";

/**
 * Validate a per-event scanner access code.
 *
 * The access code IS the credential. Once we confirm the supplied code matches
 * a published event's `qr_scanner_code`, we return `{ valid, eventId, eventName }`
 * regardless of whether the caller is anonymous or signed in. This mirrors the
 * model that `/api/qr-scanner/verify` and `/api/qr-scanner/checkin` already use:
 * those endpoints accept the access code in lieu of a Bearer token, with no
 * additional org-membership gating on the access-code path.
 *
 * Why no auth/role check here:
 *   • The code exists for phones without a Flame account (decision 2026-10-16: kept as
 *     a permanent option next to per-person access; the web itself no longer scans).
 *   • The mobile in-settings scanner (v1.0.13) sends requests with no Bearer
 *     token, so `auth()` resolves null on those calls regardless.
 *   • Adding an additional auth/role/org-membership gate here while leaving
 *     `verify`/`checkin` open would be security theatre: anyone holding the
 *     code can already call those endpoints directly.
 *
 * History: an earlier version of this endpoint (pre-Apr 2026) required an
 * authenticated organizer/admin AND org membership. Apr 29, 2026 added the
 * "anonymous + code" path for the mobile public scanner but left the
 * authenticated branch in place, which created an asymmetry where signed-in
 * non-organizer users (or organizers of other orgs) hit 403 here even though
 * `verify`/`checkin` would let them through. See APRIL_2026_FIXES.md #147.
 */
export async function POST(req: NextRequest) {
  try {
    let body: { code?: unknown; orgId?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Malformed JSON payload" },
        { status: 400 }
      );
    }

    if (!accessCodesEnabled()) {
      return NextResponse.json(
        { error: "Access codes are no longer accepted. Sign in to scan." },
        { status: 403 }
      );
    }
    const { code, orgId } = body;

    if (typeof code !== "string" || !code) {
      return NextResponse.json({ error: "Code is required and must be a string" }, { status: 400 });
    }

    if (
      orgId !== undefined &&
      (typeof orgId !== "string" || orgId.trim() === "")
    ) {
      return NextResponse.json(
        { error: "Invalid orgId: must be a non-empty string when provided" },
        { status: 400 }
      );
    }

    const trimmedOrgId = typeof orgId === "string" ? orgId.trim() : undefined;

    const codeRegex = /^[A-Z0-9]{4,8}$/;
    if (!codeRegex.test(code)) {
      return NextResponse.json(
        { error: "Invalid code format" },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database connection not available" },
        { status: 500 }
      );
    }

    let query = supabaseAdmin
      .from("events")
      .select("id, name, organization_id, status")
      .eq("qr_scanner_code", code)
      .eq("status", "published");
    if (trimmedOrgId) {
      query = query.eq("organization_id", trimmedOrgId);
    }
    const { data: event, error } = await query.maybeSingle();

    if (error) {
      console.error("Database error validating code:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    if (!event) {
      return NextResponse.json({ error: "Invalid code" }, { status: 404 });
    }

    return NextResponse.json({
      valid: true,
      eventId: event.id,
      eventName: event.name,
    });
  } catch (error) {
    console.error("Code validation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

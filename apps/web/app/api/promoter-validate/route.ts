import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../lib/supabase/server";

/**
 * GET - Validate a promoter code for an event
 * Query params: event_id, code
 */
export async function GET(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database connection error" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("event_id");
    const code = searchParams.get("code");

    if (!eventId || !code) {
      return NextResponse.json(
        { error: "Missing event_id or code" },
        { status: 400 }
      );
    }

    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 3) {
      return NextResponse.json({ valid: false });
    }

    const { data: row, error: dbError } = await supabaseAdmin
      .from("promoter_links")
      .select("id")
      .eq("event_id", eventId)
      .eq("promoter_code", trimmed)
      .maybeSingle();

    if (dbError) {
      console.error("[promoter-validate] DB error:", dbError);
      return NextResponse.json(
        { error: "Validation failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ valid: !!row, code: trimmed });
  } catch (err) {
    console.error("[promoter-validate] Exception:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

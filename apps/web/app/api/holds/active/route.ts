import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "../../../lib/supabase/server";
import { resolveDbUserFromClerkId } from "../../../lib/auth";

/**
 * GET /api/holds/active — the buyer's purchase in progress (Kevin 2026-10-28): their latest
 * reservation that is still running (no order yet, not expired), so web and app can show a
 * floating "Purchase in progress · 12:34 · Continue" wherever they are, even after leaving the
 * page or the app. Reservations whose payment already started (B3) are left out: the money may
 * be on its way and "continue" could lead to paying twice; they finish (or are released) alone.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId || !supabaseAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    let user: { id: string };
    try {
      user = await resolveDbUserFromClerkId(userId);
    } catch {
      return NextResponse.json({ hold: null });
    }
    const { data, error } = await supabaseAdmin
      .from("holds")
      .select("id, expires_at, quantity, payment_in_progress, stage_name, events ( name, slug, image_url ), ticket_tiers ( name )")
      .eq("user_id", user.id)
      .is("order_id", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) {
      console.error("[HOLDS_ACTIVE] lookup failed", error);
      return NextResponse.json({ error: "Failed to load" }, { status: 500 });
    }
    const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
    const now = Date.now();
    const h = (data ?? []).find((x: any) => x.payment_in_progress !== true && Date.parse(x.expires_at) > now) as any;
    if (!h) return NextResponse.json({ hold: null });
    const ev = one<{ name: string; slug: string; image_url: string | null }>(h.events);
    const tier = one<{ name: string }>(h.ticket_tiers);
    return NextResponse.json({
      hold: {
        id: h.id,
        expires_at: h.expires_at,
        quantity: h.quantity,
        tier: [tier?.name, h.stage_name].filter(Boolean).join(" · "),
        event: ev ? { name: ev.name, slug: ev.slug, image_url: ev.image_url } : null,
      },
    });
  } catch (err) {
    console.error("[HOLDS_ACTIVE] exception", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

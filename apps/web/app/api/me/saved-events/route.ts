import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";

/**
 * The signed-in person's saved events (heart) — Flame 2.0 fase 4.1 (2026-11-02).
 * Private to the person; web and app both go through here (table `saved_events`, writes only
 * with the service role).
 *
 * GET → { events }  — saved events that are still published, with the fields the cards need
 *                     (same as the Home feed), newest save first. The client splits upcoming/past.
 * PUT { event_id, saved: boolean } → { event_id, saved }  — idempotent; saving needs a published
 *                     event, removing always works.
 */
export const dynamic = "force-dynamic";

const EVENT_FIELDS = `id, name, slug, image_url, starts_at, ends_at, venue, city, requires_rsvp, currency, timezone, status,
  organizations ( name, slug, logo_url ),
  ticket_tiers ( id, price_cents, quantity_total, quantity_sold, per_user_limit, sales_start, sales_end, is_hidden,
    ticket_stages ( id, price_cents, quantity, sold_quantity, order_index ) )`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function currentUserId(clerkId: string) {
  const { data, error } = await supabaseAdmin!.from("users").select("id").eq("clerk_id", clerkId).maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}

type Row = { created_at: string; events: Record<string, any> | Record<string, any>[] | null };

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  try {
    const me = await currentUserId(userId);
    if (!me) return NextResponse.json({ events: [] });
    const { data, error } = await supabaseAdmin
      .from("saved_events")
      .select(`created_at, events ( ${EVENT_FIELDS} )`)
      .eq("user_id", me)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const events = ((data ?? []) as Row[])
      .map((r) => (Array.isArray(r.events) ? r.events[0] : r.events))
      .filter((e): e is Record<string, any> => !!e && e.status === "published")
      .map(({ status: _status, ...e }) => {
        const org = Array.isArray(e.organizations) ? (e.organizations[0] ?? null) : (e.organizations ?? null);
        const tiers = ((e.ticket_tiers ?? []) as Array<{ is_hidden?: boolean | null }>).filter((t) => t.is_hidden !== true);
        return { ...e, organizations: org, ticket_tiers: tiers };
      });
    return NextResponse.json({ events });
  } catch (error) {
    console.error("[GET /api/me/saved-events]", error);
    return NextResponse.json({ error: "Failed to load saved events" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  let body: { event_id?: unknown; saved?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }
  const eventId = typeof body.event_id === "string" ? body.event_id : "";
  if (!UUID.test(eventId) || typeof body.saved !== "boolean") {
    return NextResponse.json({ error: "event_id and saved are required" }, { status: 400 });
  }

  try {
    const me = await currentUserId(userId);
    if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 });

    if (!body.saved) {
      const { error } = await supabaseAdmin.from("saved_events").delete().eq("user_id", me).eq("event_id", eventId);
      if (error) throw error;
      return NextResponse.json({ event_id: eventId, saved: false });
    }

    const { data: event, error: evError } = await supabaseAdmin.from("events").select("id, status").eq("id", eventId).maybeSingle();
    if (evError) throw evError;
    if (!event || event.status !== "published") return NextResponse.json({ error: "Event not found" }, { status: 404 });

    const { error } = await supabaseAdmin
      .from("saved_events")
      .upsert({ user_id: me, event_id: eventId }, { onConflict: "user_id,event_id", ignoreDuplicates: true });
    if (error) throw error;
    return NextResponse.json({ event_id: eventId, saved: true });
  } catch (error) {
    console.error("[PUT /api/me/saved-events]", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

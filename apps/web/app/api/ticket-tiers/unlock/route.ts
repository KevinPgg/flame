import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { z } from "zod";
import { normalizeTicketTierSecretCode } from "@project-flame/lib";

// W4-C3 (Jun 2026): Access codes unlock hidden tiers on the event detail page,
// replacing the prior pre-checkout "this tier requires a code" modal flow.
// Server-side lookup against ticket_tiers.secret_code; raw codes are never
// returned to clients (get_event_with_tiers strips secret_code and returns
// has_secret_code as a boolean — see migration 20260416042751).

const unlockSchema = z.object({
  event_id: z.string().uuid(),
  code: z.string().trim().min(1, "Access code is required"),
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId || !supabaseAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = unlockSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { event_id, code } = parsed.data;
    const normalizedInput = normalizeTicketTierSecretCode(code);

    // Pull all hidden tiers for this event with their stages. We compare codes
    // in app code (not SQL) so the normalization matches what /validate-code
    // used to do — case-insensitive + trimmed via normalizeTicketTierSecretCode.
    // `ticket_stages.*` to match the shape the mobile Zod TicketTierSchema
    // expects (id, ticket_tier_id, name, price_cents, currency, quantity,
    // sold_quantity, order_index, created_at, updated_at, description). The
    // mobile schema is .passthrough() so extra fields are fine; missing ones
    // break parsing — earlier draft selected `starts_at, ends_at` which don't
    // exist on ticket_stages and caused a 500 (those are tier-level fields).
    const { data: hiddenTiers, error: tiersError } = await supabaseAdmin
      .from("ticket_tiers")
      .select(
        `id, event_id, name, description, price_cents, quantity_total, quantity_sold, per_user_limit, sales_start, sales_end, secret_code, is_hidden, is_manually_sold_out, order_index, registration_form_fields, created_at, updated_at,
         ticket_stages (*)`,
      )
      .eq("event_id", event_id)
      .eq("is_hidden", true)
      .order("order_index", { ascending: true });

    if (tiersError) {
      console.error("[UNLOCK_TIER] DB error fetching hidden tiers:", tiersError);
      return NextResponse.json(
        { error: "Failed to look up tier" },
        { status: 500 },
      );
    }

    const match = (hiddenTiers ?? []).find(
      (t) =>
        t.secret_code &&
        normalizeTicketTierSecretCode(t.secret_code) === normalizedInput,
    );

    if (!match) {
      return NextResponse.json(
        { error: "Invalid access code", code: "INVALID_ACCESS_CODE" },
        { status: 404 },
      );
    }

    // Compute quantity_reserved (tier + per-stage) to match the shape the
    // attendee client expects from get_event_with_tiers. Holds + pending/approved RSVPs.
    const [holdRows, rsvpRows] = await Promise.all([
      supabaseAdmin
        .from("holds")
        .select("quantity, stage_id, expires_at, order_id")
        .eq("tier_id", match.id)
        .gt("expires_at", new Date().toISOString())
        .is("order_id", null),
      supabaseAdmin
        .from("rsvps")
        .select("requested_quantity, stage_id, status")
        .eq("ticket_tier_id", match.id)
        .in("status", ["pending", "approved"]),
    ]);

    const tierReserved =
      (holdRows.data ?? []).reduce((sum, h) => sum + (h.quantity ?? 0), 0) +
      (rsvpRows.data ?? []).reduce(
        (sum, r) => sum + (r.requested_quantity ?? 0),
        0,
      );

    const stagesWithReserved = (match.ticket_stages ?? []).map((stage) => {
      const stageHolds = (holdRows.data ?? [])
        .filter((h) => h.stage_id === stage.id)
        .reduce((sum, h) => sum + (h.quantity ?? 0), 0);
      const stageRsvps = (rsvpRows.data ?? [])
        .filter((r) => r.stage_id === stage.id)
        .reduce((sum, r) => sum + (r.requested_quantity ?? 0), 0);
      return { ...stage, quantity_reserved: stageHolds + stageRsvps };
    });

    // Strip raw secret_code from the response (matches get_event_with_tiers).
    const { secret_code: _stripped, ticket_stages: _stages, ...rest } = match;
    void _stripped;
    void _stages;

    return NextResponse.json({
      tier: {
        ...rest,
        has_secret_code: true,
        quantity_reserved: tierReserved,
        ticket_stages: stagesWithReserved.sort(
          (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
        ),
      },
    });
  } catch (error) {
    console.error("[UNLOCK_TIER] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

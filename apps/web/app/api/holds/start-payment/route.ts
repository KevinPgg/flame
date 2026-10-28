import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { supabaseAdmin } from "../../../lib/supabase/server";
import { resolveDbUserFromClerkId } from "../../../lib/auth";

/**
 * POST /api/holds/start-payment — B3 (fase 3.1).
 *
 * Called by web (`StripePaymentForm`) and app (`useCheckout`) right before confirming the Stripe
 * payment. Marks the hold "payment in progress" and extends it 10 minutes with the existing
 * `mark_hold_payment_started` (until now only Datafast used it). `cleanup_expired_holds` then
 * gives the hold 15 minutes of grace from the payment start, so the row still exists when the
 * Stripe webhook arrives and the buyer gets their tickets instead of a refund. Abandoned
 * payments are unmarked after 20 minutes by `cleanup_abandoned_payments` (unchanged).
 *
 * Abuse guard: calling it again within 10 minutes is a no-op (it doesn't extend again), and a
 * hold older than 60 minutes is never extended — inventory can't be held forever by looping.
 *
 * The PaymentIntent id goes into `datafast_checkout_id` (the function's only id column) as
 * "stripe:<pi>", so it can never match a Datafast checkout id (verify-payment looks those up).
 */
const bodySchema = z.object({
  hold_id: z.string().uuid(),
  payment_intent_id: z.string().regex(/^pi_[A-Za-z0-9]+$/),
});

const REMARK_AFTER_MS = 10 * 60_000;
const MAX_HOLD_AGE_MS = 60 * 60_000;

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId || !supabaseAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const { hold_id, payment_intent_id } = parsed.data;

    let user: { id: string };
    try {
      user = await resolveDbUserFromClerkId(userId);
    } catch {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { data: hold, error: holdError } = await supabaseAdmin
      .from("holds")
      .select("id, expires_at, order_id, created_at, payment_in_progress, payment_started_at")
      .eq("id", hold_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (holdError) {
      console.error("[HOLD_START_PAYMENT] lookup failed", holdError);
      return NextResponse.json({ error: "Failed to check the reservation" }, { status: 500 });
    }
    if (!hold) {
      return NextResponse.json({ error: "Reservation not found", code: "HOLD_NOT_FOUND" }, { status: 404 });
    }
    if (hold.order_id) {
      return NextResponse.json({ error: "This reservation was already used", code: "HOLD_USED" }, { status: 409 });
    }

    const now = Date.now();
    if (Date.parse(hold.expires_at) <= now) {
      return NextResponse.json({ error: "Your reservation expired", code: "HOLD_EXPIRED" }, { status: 410 });
    }

    // Already marked a moment ago (retry after a declined card, double tap): keep it as is.
    if (hold.payment_in_progress && hold.payment_started_at && now - Date.parse(hold.payment_started_at) < REMARK_AFTER_MS) {
      return NextResponse.json({ ok: true, expires_at: hold.expires_at, extended: false });
    }

    // Never stretch a reservation past an hour in total; pay with what's left.
    if (hold.created_at && now - Date.parse(hold.created_at) > MAX_HOLD_AGE_MS) {
      return NextResponse.json({ ok: true, expires_at: hold.expires_at, extended: false });
    }

    const { data: result, error: rpcError } = await supabaseAdmin.rpc("mark_hold_payment_started", {
      p_hold_id: hold_id,
      p_checkout_id: `stripe:${payment_intent_id}`,
      p_extend_minutes: 10,
    });

    if (rpcError) {
      console.error("[HOLD_START_PAYMENT] rpc failed", rpcError);
      return NextResponse.json({ error: "Failed to start the payment" }, { status: 500 });
    }
    const r = (result ?? {}) as { success?: boolean; error?: string; new_expiration?: string };
    if (!r.success) {
      const msg = r.error ?? "Failed to start the payment";
      if (/expired/i.test(msg)) return NextResponse.json({ error: "Your reservation expired", code: "HOLD_EXPIRED" }, { status: 410 });
      if (/used/i.test(msg)) return NextResponse.json({ error: "This reservation was already used", code: "HOLD_USED" }, { status: 409 });
      if (/not found/i.test(msg)) return NextResponse.json({ error: "Reservation not found", code: "HOLD_NOT_FOUND" }, { status: 404 });
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    return NextResponse.json({ ok: true, expires_at: r.new_expiration ?? null, extended: true });
  } catch (err) {
    console.error("[HOLD_START_PAYMENT] exception", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

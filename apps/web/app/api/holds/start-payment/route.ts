import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { supabaseAdmin } from "../../../lib/supabase/server";
import { resolveDbUserFromClerkId } from "../../../lib/auth";
import { stripe } from "../../../lib/stripe/stripe";

/**
 * POST /api/holds/start-payment — B3 (fase 3.1).
 *
 * Called by web (`StripePaymentForm`) and app (`useCheckout`) right before confirming the Stripe
 * payment. Marks the hold "payment in progress" and makes sure 10 minutes are left (never past
 * the 30-minute clock already shown; Kevin 2026-10-29) with the existing
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
  /** The buyer closed the payment without paying (sheet closed, card declined): clear the mark. */
  abort: z.boolean().optional(),
});

/** PaymentIntent states in which no money is moving: the "payment in progress" mark can go. */
const NOT_MOVING = new Set(["requires_payment_method", "requires_confirmation", "requires_action", "canceled"]);

const REMARK_AFTER_MS = 10 * 60_000;
const MAX_HOLD_AGE_MS = 60 * 60_000;
/** Time guaranteed to finish paying once "Pay" is pressed. */
const PAY_WINDOW_MS = 10 * 60_000;

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
    const { hold_id, payment_intent_id, abort } = parsed.data;

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

    if (abort) {
      // Only when Stripe confirms nothing is being charged for this PaymentIntent.
      let status: string | null = null;
      try {
        const pi = await stripe.paymentIntents.retrieve(payment_intent_id);
        if (pi.metadata?.holdId && pi.metadata.holdId !== hold_id) {
          return NextResponse.json({ error: "Payment does not match the reservation" }, { status: 400 });
        }
        status = pi.status;
      } catch (e) {
        console.error("[HOLD_START_PAYMENT] abort: retrieve failed", e);
        return NextResponse.json({ ok: false, cleared: false });
      }
      if (!status || !NOT_MOVING.has(status)) return NextResponse.json({ ok: true, cleared: false, status });
      const { error: clearError } = await supabaseAdmin
        .from("holds")
        .update({ payment_in_progress: false, payment_started_at: null })
        .eq("id", hold_id)
        .eq("user_id", user.id)
        .is("order_id", null);
      if (clearError) console.error("[HOLD_START_PAYMENT] abort: clear failed", clearError);
      return NextResponse.json({ ok: !clearError, cleared: !clearError });
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

    // Kevin 2026-10-29: the clock must never show more than the 30 minutes promised. The RPC adds
    // the minutes to the CURRENT end, so ask only for what's missing to have 10 minutes left
    // (0 when there are already 10 or more: it still marks the payment as started).
    const leftMs = Date.parse(hold.expires_at) - now;
    const extendMinutes = Math.max(0, Math.round((PAY_WINDOW_MS - leftMs) / 60_000));
    const { data: result, error: rpcError } = await supabaseAdmin.rpc("mark_hold_payment_started", {
      p_hold_id: hold_id,
      p_checkout_id: `stripe:${payment_intent_id}`,
      p_extend_minutes: extendMinutes,
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

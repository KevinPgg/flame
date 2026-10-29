import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase/server";
import { stripe } from "../../../lib/stripe/stripe";
import { createOrderAndTicketsFromRsvp, type RsvpWithRelations } from "../../../lib/stripe/rsvp-order";

/**
 * RSVP reconciliation (fase 3.4, Kevin 2026-10-28 — after the "3 lost tickets" case).
 *
 * Approving a paid RSVP captures the card; the tickets are then created by the Stripe webhook
 * (payment_intent.succeeded). If that webhook never arrives (endpoint down beyond Stripe's 3 days
 * of retries, wrong secret, local without `stripe listen`), the RSVP stays "approved" with the
 * money taken and no tickets — and nothing noticed it.
 *
 * Every hour this looks for RSVPs still "approved" more than 15 minutes after approval (so it
 * never races a normal webhook), with a PaymentIntent and no order for it; asks Stripe whether
 * that PaymentIntent really succeeded; and if so runs the SAME code as the webhook
 * (createOrderAndTicketsFromRsvp: order + tickets + status, idempotent per PaymentIntent).
 * Auth: `Authorization: Bearer $CRON_SECRET` (Vercel cron sends it).
 */
export const dynamic = "force-dynamic";

const GRACE_MS = 15 * 60_000;
const LOOKBACK_MS = 30 * 24 * 3600_000;
const BATCH = 50;

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Database connection error" }, { status: 500 });

  const now = Date.now();
  const { data: rsvps, error } = await supabaseAdmin
    .from("rsvps")
    .select("*, ticket_tiers!inner(*), events!inner(*), users!rsvps_user_id_fkey(*)")
    .eq("status", "approved")
    .not("stripe_payment_intent_id", "is", null)
    .lt("approved_at", new Date(now - GRACE_MS).toISOString())
    .gt("approved_at", new Date(now - LOOKBACK_MS).toISOString())
    .order("approved_at", { ascending: true })
    .limit(BATCH);
  if (error) {
    console.error("[RECONCILE_RSVP] lookup failed", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }

  const result = { checked: 0, created: 0, notCaptured: 0, alreadyOrdered: 0, failed: 0 };
  for (const rsvp of (rsvps ?? []) as RsvpWithRelations[]) {
    result.checked++;
    const piId = (rsvp as { stripe_payment_intent_id?: string | null }).stripe_payment_intent_id;
    if (!piId || !piId.startsWith("pi_")) continue;
    try {
      const { data: order } = await supabaseAdmin.from("orders").select("id").eq("stripe_payment_intent_id", piId).maybeSingle();
      if (order) {
        result.alreadyOrdered++;
        continue;
      }
      const pi = await stripe.paymentIntents.retrieve(piId);
      if (pi.status !== "succeeded") {
        result.notCaptured++;
        continue;
      }
      await createOrderAndTicketsFromRsvp(rsvp, pi);
      result.created++;
      console.warn("[RECONCILE_RSVP] tickets created without the webhook", { rsvpId: rsvp.id, paymentIntentId: piId });
    } catch (err) {
      result.failed++;
      console.error("[RECONCILE_RSVP] failed", { rsvpId: rsvp.id, paymentIntentId: piId, err });
    }
  }
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}

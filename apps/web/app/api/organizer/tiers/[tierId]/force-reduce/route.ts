import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "../../../../../lib/supabase/server";
import { stripe } from "../../../../../lib/stripe/stripe";
import { sendRsvpRejectionEmail } from "../../../../../lib/email/rsvp-notifications";
import { sendPushNotification } from "../../../../../lib/push-notifications";
import { requireEventAccess } from "@/app/lib/utils/event-access";

/**
 * POST /api/organizer/tiers/[tierId]/force-reduce
 *
 * W4-C1 (May 2026) — organizer "force reduce capacity" override.
 *
 * The standard PATCH /api/ticket-tiers route blocks `quantity_total` reductions
 * below `quantity_sold + quantity_reserved` (active holds + pending/approved
 * RSVPs) so legitimate purchases in flight aren't broken. That guard is correct
 * for normal usage but leaves organizers stuck when they need to reduce capacity
 * past stuck holds (abandoned checkouts) or pending RSVPs they haven't reviewed
 * yet.
 *
 * This endpoint does the cleanup atomically (best-effort sequencing):
 *   1. Delete all active holds for the tier (DB delete; releases inventory).
 *   2. Mark all PENDING RSVPs as `rejected`, set rejected_at /
 *      rejected_by metadata, and best-effort cancel each linked Stripe
 *      PaymentIntent so the card hold is released.
 *   3. Reduce `ticket_tiers.quantity_total` to the new value, clamped to
 *      `quantity_sold` (sold tickets are never affected — that's the whole
 *      point of the lower bound).
 *
 * Email + push notifications are sent best-effort per RSVP so attendees know
 * their RSVP was cancelled. Failures are logged but do not roll back the
 * capacity reduction.
 *
 * Auth: caller must be a member of the tier's event organization. Cohost-org
 * members are NOT authorized — capacity decisions belong to the host org.
 */

const bodySchema = z.object({
  new_quantity_total: z.number().int().min(0),
});

interface TierWithEvent {
  id: string;
  quantity_total: number;
  quantity_sold: number;
  name: string;
  events: {
    id: string;
    name: string;
    slug: string;
    starts_at: string;
    venue: string | null;
    timezone: string | null;
    organization_id: string;
  };
}

interface AffectedRsvp {
  id: string;
  user_id: string;
  requested_quantity: number;
  stripe_payment_intent_id: string | null;
  user_email: string | null;
  user_first_name: string | null;
  user_last_name: string | null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tierId: string }> },
) {
  try {
    const { userId } = await auth();
    const { tierId } = await params;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      );
    }

    const body = await req.json();
    const { new_quantity_total } = bodySchema.parse(body);

    // Resolve the calling user → org membership for auth.
    const { data: supabaseUser, error: userError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (userError || !supabaseUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch tier + event for auth + downstream notifications.
    const { data: tierRaw, error: tierError } = await supabaseAdmin
      .from("ticket_tiers")
      .select(
        `
        id,
        quantity_total,
        quantity_sold,
        name,
        events!inner (
          id,
          name,
          slug,
          starts_at,
          venue,
          timezone,
          organization_id
        )
      `,
      )
      .eq("id", tierId)
      .single<TierWithEvent>();

    if (tierError || !tierRaw) {
      return NextResponse.json(
        { error: "Ticket tier not found" },
        { status: 404 },
      );
    }
    const tier = tierRaw;

    // Host-org membership check. Cohost orgs cannot force-reduce capacity.
    const { data: membership } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", supabaseUser.id)
      .eq("organization_id", tier.events.organization_id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Not authorized to manage this tier" },
        { status: 403 },
      );
    }

    // Role + assignment: organizers only act on events assigned to them (owner/admin: all).
    const denied = await requireEventAccess(supabaseAdmin, supabaseUser.id, tier.events.id, tier.events.organization_id);
    if (denied) return denied;

    if (new_quantity_total < tier.quantity_sold) {
      return NextResponse.json(
        {
          error: `Cannot reduce capacity below ${tier.quantity_sold} (already sold). Sold tickets are never cancelled by this endpoint.`,
        },
        { status: 400 },
      );
    }

    // Fase 3.5 (2026-10-29): what is already COMMITTED is never cancelled here —
    //   · approved RSVPs: the card was already charged (only the webhook is missing); rejecting
    //     them left the person charged, rejected and without a refund;
    //   · holds whose payment already started (B3, /api/holds/start-payment): deleting them
    //     turned an in-flight payment into "charge + automatic refund, no tickets".
    // Both count as taken, like sold tickets: capacity can't go below them.
    const { data: approvedRows, error: approvedError } = await supabaseAdmin
      .from("rsvps")
      .select("id, requested_quantity")
      .eq("ticket_tier_id", tierId)
      .eq("status", "approved");
    if (approvedError) {
      console.error("[force-reduce] failed to fetch approved RSVPs:", approvedError);
      return NextResponse.json({ error: "Failed to enumerate approved RSVPs" }, { status: 500 });
    }
    const approvedQty = (approvedRows ?? []).reduce((n: number, r: { requested_quantity: number | null }) => n + (r.requested_quantity ?? 1), 0);

    // Step 1 — collect active holds for the tier (so we can report counts).
    const { data: holdRows, error: holdsError } = await supabaseAdmin
      .from("holds")
      .select("id, quantity, payment_in_progress, payment_started_at")
      .eq("tier_id", tierId)
      .gt("expires_at", new Date().toISOString())
      .is("order_id", null);

    if (holdsError) {
      console.error("[force-reduce] failed to fetch holds:", holdsError);
      return NextResponse.json(
        { error: "Failed to enumerate active holds" },
        { status: 500 },
      );
    }

    const payingCutoff = Date.now() - 20 * 60_000; // same window as cleanup_abandoned_payments
    const isPaying = (h: { payment_in_progress?: boolean | null; payment_started_at?: string | null }) =>
      h.payment_in_progress === true && !!h.payment_started_at && Date.parse(h.payment_started_at) > payingCutoff;
    const payingQty = (holdRows ?? []).filter(isPaying).reduce((n: number, h: { quantity: number }) => n + (h.quantity ?? 0), 0);
    const committed = tier.quantity_sold + approvedQty + payingQty;
    if (new_quantity_total < committed) {
      return NextResponse.json(
        {
          error: `Cannot reduce capacity below ${committed}: ${tier.quantity_sold} sold, ${approvedQty} in approved (already charged) RSVPs and ${payingQty} being paid right now.`,
          code: "BELOW_COMMITTED",
          details: { sold: tier.quantity_sold, approved_rsvps: approvedQty, paying_holds: payingQty, minimum: committed },
        },
        { status: 400 },
      );
    }

    const holdIds = (holdRows ?? []).filter((h) => !isPaying(h)).map((h) => h.id);
    let cancelledHolds = 0;
    if (holdIds.length > 0) {
      // Re-apply the same predicates from the SELECT above so a hold that gets
      // claimed (order_id set) or expires between the SELECT and DELETE is not
      // accidentally wiped. Cheap hardening — same call, extra filters.
      const { error: deleteHoldsError, count } = await supabaseAdmin
        .from("holds")
        .delete({ count: "exact" })
        .in("id", holdIds)
        .eq("tier_id", tierId)
        .gt("expires_at", new Date().toISOString())
        .is("order_id", null);

      if (deleteHoldsError) {
        console.error("[force-reduce] failed to delete holds:", deleteHoldsError);
        return NextResponse.json(
          { error: "Failed to cancel active holds" },
          { status: 500 },
        );
      }
      cancelledHolds = count ?? holdIds.length;
    }

    // Step 2 — collect PENDING RSVPs (approved ones are committed, see above) so we can reject them in bulk
    // and notify the affected users.
    const { data: rsvpRows, error: rsvpFetchError } = await supabaseAdmin
      .from("rsvps")
      .select(
        `
        id,
        user_id,
        requested_quantity,
        stripe_payment_intent_id,
        users!rsvps_user_id_fkey (
          email,
          first_name,
          last_name
        )
      `,
      )
      .eq("ticket_tier_id", tierId)
      .eq("status", "pending");

    if (rsvpFetchError) {
      console.error(
        "[force-reduce] failed to fetch pending RSVPs:",
        rsvpFetchError,
      );
      return NextResponse.json(
        { error: "Failed to enumerate pending RSVPs" },
        { status: 500 },
      );
    }

    type RsvpUserJoin = { email: string; first_name: string | null; last_name: string | null };
    const affectedRsvps: AffectedRsvp[] = (rsvpRows ?? []).map((row: {
      id: string;
      user_id: string;
      requested_quantity: number;
      stripe_payment_intent_id: string | null;
      users: RsvpUserJoin | RsvpUserJoin[] | null;
    }) => {
      const usersJoin = Array.isArray(row.users) ? row.users[0] ?? null : row.users;
      return {
        id: row.id,
        user_id: row.user_id,
        requested_quantity: row.requested_quantity,
        stripe_payment_intent_id: row.stripe_payment_intent_id ?? null,
        user_email: usersJoin?.email ?? null,
        user_first_name: usersJoin?.first_name ?? null,
        user_last_name: usersJoin?.last_name ?? null,
      };
    });

    let rejectedRsvps = 0;
    if (affectedRsvps.length > 0) {
      const nowIso = new Date().toISOString();
      const { error: updateError } = await supabaseAdmin
        .from("rsvps")
        .update({
          status: "rejected",
          rejected_at: nowIso,
          rejected_by: supabaseUser.id,
        })
        .in(
          "id",
          affectedRsvps.map((r) => r.id),
        )
        .eq("status", "pending");

      if (updateError) {
        console.error(
          "[force-reduce] failed to bulk reject RSVPs:",
          updateError,
        );
        return NextResponse.json(
          { error: "Failed to reject pending RSVPs" },
          { status: 500 },
        );
      }
      rejectedRsvps = affectedRsvps.length;
    }

    // Step 3 — reduce capacity. Optimistic lock guards against a sale that
    // sneaks in between the steps above and this update.
    const { data: updatedTier, error: tierUpdateError } = await supabaseAdmin
      .from("ticket_tiers")
      .update({
        quantity_total: new_quantity_total,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tierId)
      .lte("quantity_sold", new_quantity_total)
      .select()
      .single();

    if (tierUpdateError || !updatedTier) {
      console.error(
        "[force-reduce] tier quantity update failed (sold count may have changed):",
        tierUpdateError,
      );
      return NextResponse.json(
        {
          error:
            "Capacity reduction failed — sold count changed mid-operation. Holds and RSVPs were already processed; refresh and retry.",
        },
        { status: 409 },
      );
    }

    // Step 4 (best-effort) — Stripe cancel + email + push per affected RSVP.
    // Failures are logged but never roll back the capacity reduction; the
    // operator can manually clean up via the Stripe dashboard if needed.
    const orgName = await (async () => {
      const { data } = await supabaseAdmin!
        .from("organizations")
        .select("name")
        .eq("id", tier.events.organization_id)
        .single();
      return data?.name ?? "Event Organizer";
    })();

    await Promise.allSettled(
      affectedRsvps.map(async (rsvp) => {
        if (rsvp.stripe_payment_intent_id) {
          try {
            const pi = await stripe.paymentIntents.retrieve(
              rsvp.stripe_payment_intent_id,
            );
            const cancellable = [
              "requires_capture",
              "requires_action",
              "requires_confirmation",
              "requires_payment_method",
            ];
            if (cancellable.includes(pi.status)) {
              await stripe.paymentIntents.cancel(rsvp.stripe_payment_intent_id);
            }
          } catch (stripeErr) {
            console.error(
              `[force-reduce] Stripe cancel failed for RSVP ${rsvp.id}:`,
              stripeErr,
            );
          }
        }

        if (rsvp.user_email) {
          try {
            const userName = rsvp.user_first_name
              ? `${rsvp.user_first_name} ${rsvp.user_last_name ?? ""}`.trim()
              : rsvp.user_email;
            await sendRsvpRejectionEmail({
              userEmail: rsvp.user_email,
              userName,
              eventName: tier.events.name,
              eventDate: tier.events.starts_at,
              eventTimezone: tier.events.timezone || "America/Guayaquil",
              eventVenue: tier.events.venue ?? "",
              ticketTierName: tier.name,
              quantity: rsvp.requested_quantity,
              organizationName: orgName,
              // Use the generic "none" outcome — we don't fetch the PI amount
              // here. Email still tells the attendee their RSVP was cancelled;
              // the Stripe authorization (if any) is released best-effort
              // above. Operators can confirm via the Stripe dashboard.
              paymentOutcome: { kind: "none" },
            });
          } catch (emailErr) {
            console.error(
              `[force-reduce] rejection email failed for RSVP ${rsvp.id}:`,
              emailErr,
            );
          }
        }

        try {
          await sendPushNotification({
            userId: rsvp.user_id,
            type: "rsvp_rejected",
            title: "RSVP Update",
            body: `Your RSVP for ${tier.events.name} was cancelled because the organizer reduced capacity.`,
            data: {
              deepLink: "/(tabs)/my-tickets",
              eventId: tier.events.id,
            },
          });
        } catch (pushErr) {
          console.error(
            `[force-reduce] push notification failed for RSVP ${rsvp.id}:`,
            pushErr,
          );
        }
      }),
    );

    revalidatePath("/organizer");
    revalidatePath(`/events/${tier.events.slug}`);

    return NextResponse.json({
      tier: updatedTier,
      cancelled_holds: cancelledHolds,
      rejected_rsvps: rejectedRsvps,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.issues },
        { status: 400 },
      );
    }
    console.error("[force-reduce] unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

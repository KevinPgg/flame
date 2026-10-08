import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { stripe } from "@/app/lib/stripe/stripe";
import { isCancellableStatus } from "@/app/lib/stripe/constants";

/**
 * Cron Job: Cleanup Pending RSVPs for Past Events
 *
 * Purpose: Automatically clean up pending RSVPs for events that have already ended.
 * When an event ends, any pending RSVPs that were not approved in time should be
 * marked as expired to prevent confusion and maintain data integrity.
 *
 * Schedule: Run daily (recommended: once per day at off-peak hours)
 *
 * Integration:
 * - Vercel Cron: Add to vercel.json
 * - Other platforms: Schedule HTTP POST to this endpoint with CRON_SECRET header
 *
 * Environment Variables Required:
 * - CRON_SECRET: Secret key for authenticating cron requests
 *
 * What it does:
 * 1. Finds all events that have ended (ends_at < now())
 * 2. Identifies pending RSVPs for those events
 * 3. Updates their status to 'expired'
 * 4. Cleans up orphaned rsvp_pending_requests records
 * 5. Logs the cleanup for audit purposes
 *
 * Manual Testing:
 * ```bash
 * curl -X POST http://localhost:3000/api/cron/cleanup-past-event-rsvps \
 *   -H "Authorization: Bearer YOUR_CRON_SECRET"
 * ```
 *
 * Production Testing (Vercel):
 * ```bash
 * curl -X POST https://your-domain.com/api/cron/cleanup-past-event-rsvps \
 *   -H "Authorization: Bearer YOUR_CRON_SECRET"
 * ```
 */
export async function POST(req: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error("CRON_SECRET not configured");
      return NextResponse.json(
        { error: "Cron job not configured" },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      console.error("Unauthorized cron request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      console.error("Database connection not available");
      return NextResponse.json(
        { error: "Database connection error" },
        { status: 500 }
      );
    }

    const results = await cleanupPastEventRsvps();

    return NextResponse.json({
      success: true,
      summary: results,
    });
  } catch (error) {
    console.error("Error in past event RSVP cleanup cron:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Main cleanup logic
 */
async function cleanupPastEventRsvps() {
  const startTime = Date.now();
  console.log("🧹 Starting past event RSVP cleanup...");

  try {
    // Step 1: Find all events that have ended
    // Note: Fetching all past events at once. For production scale (1000+ past events),
    // consider adding pagination here similar to the RSVP batching below.
    // Current implementation is acceptable for typical event volumes.
    const { data: pastEvents, error: eventsError } = await supabaseAdmin!
      .from("events")
      .select("id, name, ends_at")
      .lt("ends_at", new Date().toISOString())
      .order("ends_at", { ascending: false });

    if (eventsError) {
      console.error("Error fetching past events:", eventsError);
      throw new Error(`Failed to fetch past events: ${eventsError.message}`);
    }

    if (!pastEvents || pastEvents.length === 0) {
      console.log("✅ No past events found");
      return {
        totalPastEvents: 0,
        totalPendingRsvps: 0,
        totalExpired: 0,
        duration: Date.now() - startTime,
      };
    }

    console.log(`📅 Found ${pastEvents.length} past events`);

    // Step 2: Find all pending RSVPs for these past events
    // Batching: Process events in chunks to avoid large query URLs
    const BATCH_SIZE = 50;
    const allPendingRsvps = [];
    const pastEventIds = pastEvents.map(e => e.id);
    
    for (let i = 0; i < pastEventIds.length; i += BATCH_SIZE) {
      const chunk = pastEventIds.slice(i, i + BATCH_SIZE);
      const { data: chunkRsvps, error: chunkError } = await supabaseAdmin!
      .from("rsvps")
        .select("id, event_id, user_id, requested_quantity, stripe_payment_intent_id, events(name, ends_at)")
        .in("event_id", chunk)
      .eq("status", "pending");

      if (chunkError) {
        console.error("Error fetching pending RSVPs chunk:", chunkError);
        // Continue with other chunks
      } else if (chunkRsvps) {
        allPendingRsvps.push(...chunkRsvps);
      }
    }

    const pendingRsvps = allPendingRsvps;

    let expiredCount = 0;
    let cancelledPaymentIntents = 0;
    const expiredRsvps = [];

    if (pendingRsvps && pendingRsvps.length > 0) {
      console.log(`🔍 Found ${pendingRsvps.length} pending RSVPs for past events`);

      // Step 3: Update all pending RSVPs to 'expired' status (Batched)
      const rsvpIds = pendingRsvps.map(r => r.id);
      
      // Process updates in chunks
      for (let i = 0; i < rsvpIds.length; i += BATCH_SIZE) {
        const chunk = rsvpIds.slice(i, i + BATCH_SIZE);
        const { data: chunkExpired, error: updateError } = await supabaseAdmin!
        .from("rsvps")
        .update({
          status: "expired",
          updated_at: new Date().toISOString(),
        })
          .in("id", chunk)
        .eq("status", "pending") // Double-check status hasn't changed
          .select("id, event_id, stripe_payment_intent_id");

      if (updateError) {
        console.error("Error updating RSVPs to expired:", updateError);
        } else if (chunkExpired) {
          expiredRsvps.push(...chunkExpired);
        }
      }

      expiredCount = expiredRsvps.length;
      console.log(`✅ Successfully expired ${expiredCount} pending RSVPs`);

      // Step 3.5: Cancel associated PaymentIntents for expired RSVPs
      // This releases customer funds immediately instead of waiting 7 days
      const rsvpsWithPayment = expiredRsvps.filter(r => r.stripe_payment_intent_id);
      
      if (rsvpsWithPayment.length > 0) {
        console.log(`Processing ${rsvpsWithPayment.length} PaymentIntents for cancellation...`);
        
        // Process cancellations with concurrency limit
        const CANCEL_CONCURRENCY = 5;
        for (let i = 0; i < rsvpsWithPayment.length; i += CANCEL_CONCURRENCY) {
          const chunk = rsvpsWithPayment.slice(i, i + CANCEL_CONCURRENCY);
          await Promise.all(chunk.map(async (rsvp: { id: string; event_id: string; stripe_payment_intent_id: string }) => {
            try {
              const piId = rsvp.stripe_payment_intent_id;
              // Retrieve first to check status
              const pi = await stripe.paymentIntents.retrieve(piId);
              
              if (isCancellableStatus(pi.status)) {
                await stripe.paymentIntents.cancel(piId);
                cancelledPaymentIntents++;
                console.log(`Cancelled PaymentIntent ${piId} for expired RSVP ${rsvp.id}`);
              }
            } catch (err) {
              console.error(`Failed to cancel PaymentIntent for RSVP ${rsvp.id}:`, err);
            }
          }));
        }
      }

      // Log some details for audit
      if (expiredCount > 0) {
        const eventBreakdown = expiredRsvps.reduce((acc: Record<string, number>, rsvp: { id: string; event_id: string; stripe_payment_intent_id: string | null }) => {
          acc[rsvp.event_id] = (acc[rsvp.event_id] || 0) + 1;
          return acc;
        }, {});

        console.log("📊 Breakdown by event:");
        for (const [eventId, count] of Object.entries(eventBreakdown)) {
          const event = pastEvents.find(e => e.id === eventId);
          console.log(`  - ${event?.name || eventId}: ${count} RSVPs expired`);
        }
      }
    } else {
      console.log("✅ No pending RSVPs found for past events");
    }

    // Step 4: Also clean up pending RSVP requests for past events (Batched)
    let totalDeletedRequests = 0;
    for (let i = 0; i < pastEventIds.length; i += BATCH_SIZE) {
      const chunk = pastEventIds.slice(i, i + BATCH_SIZE);
    const { data: deletedPendingRequests, error: pendingRequestsError } = await supabaseAdmin!
      .from("rsvp_pending_requests")
      .delete()
        .in("event_id", chunk)
      .select("id");

    if (pendingRequestsError) {
        console.warn("⚠️  Error cleaning up pending RSVP requests chunk:", pendingRequestsError);
    } else {
        totalDeletedRequests += deletedPendingRequests?.length || 0;
      }
    }

    if (totalDeletedRequests > 0) {
      console.log(`🗑️  Cleaned up ${totalDeletedRequests} pending RSVP requests for past events`);
    }

    const duration = Date.now() - startTime;
    console.log(`⏱️  Cleanup completed in ${duration}ms`);

    return {
      totalPastEvents: pastEvents.length,
      totalPendingRsvps: pendingRsvps.length,
      totalExpired: expiredCount,
      totalCancelledPaymentIntents: cancelledPaymentIntents,
      totalPendingRequestsDeleted: totalDeletedRequests,
      duration,
      eventBreakdown: expiredRsvps?.reduce((acc: Record<string, number>, rsvp: { id: string; event_id: string; stripe_payment_intent_id: string | null }) => {
        acc[rsvp.event_id] = (acc[rsvp.event_id] || 0) + 1;
        return acc;
      }, {}),
    };
  } catch (error) {
    console.error("❌ Error in cleanup process:", error);
    throw error;
  }
}

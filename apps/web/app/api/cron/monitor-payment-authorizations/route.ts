import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { stripe } from "@/app/lib/stripe/stripe";
import { sendPushNotification } from "@/app/lib/push-notifications";
import { getBaseUrl } from "@/app/lib/utils/url";
import Stripe from "stripe";

interface RsvpWithRelations {
  id: string;
  stripe_payment_intent_id: string | null;
  created_at: string;
  status: string;
  user_id: string;
  event_id: string;
  requested_quantity: number;
  last_notified_at: string | null;
  events: {
    id: string;
    name: string;
    organization_id: string;
    organizations: {
      id: string;
      name: string;
      owner_id: string;
      stripe_account_id: string | null;
    };
  };
}

/**
 * Extended PaymentIntent type for expanded charges
 *
 * Note: While Stripe SDK v18+ provides expanded types when using expand: ["charges"],
 * we use this manual interface to ensure type safety and explicit access to capture_before.
 * This approach is acceptable and provides clearer type definitions for our use case.
 *
 * IMPORTANT: capture_before is a top-level field on the Charge object, not nested
 * under payment_method_details. This field indicates when the authorization expires
 * and varies by card network (Visa ~5 days, others ~7 days).
 */
interface PaymentIntentWithCharges extends Stripe.PaymentIntent {
  charges: {
    data: Array<{
      id: string;
      capture_before?: number | null; // Top-level field on Charge object
    }>;
  };
}

/**
 * Cron Job: Monitor Payment Authorizations for Expiry
 *
 * Purpose: Prevent authorizations from expiring and causing "stale authorization" errors
 * by monitoring and acting on RSVPs approaching the 7-day limit.
 *
 * Schedule: Run every 6 hours (or more frequently as needed)
 *
 * Integration:
 * - Vercel Cron: Add to vercel.json
 * - Other platforms: Schedule HTTP POST to this endpoint with CRON_SECRET header
 *
 * Environment Variables Required:
 * - CRON_SECRET: Secret key for authenticating cron requests
 *
 * @see stripe-implementation/stripe_goals.md Section 4.2
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

    const results = await monitorPaymentAuthorizations();

    return NextResponse.json({
      success: true,
      summary: results,
    });
  } catch (error) {
    console.error("Error in payment authorization monitoring cron:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Monitor payment authorizations approaching expiry
 *
 * NOTE: Concurrency Protection Strategy
 * - Uses last_notified_at timestamp to prevent duplicate notifications across cron runs
 * - The 3-7 day query window catches both notification and auto-cancel candidates
 * - Notification logic filters to 3-6 day window and checks last_notified_at
 * - Auto-cancel logic applies to 6.5+ day old RSVPs
 * - Stripe idempotency keys on cancel operations prevent duplicate cancellations
 */
async function monitorPaymentAuthorizations() {
  if (!supabaseAdmin) {
    console.error("Database connection not available");
    throw new Error("Database connection not available");
  }

  const SEVEN_DAYS_AGO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const THREE_DAYS_AGO = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  // Query RSVPs with pending authorizations approaching or past expiry
  // Window: 3-7 days old to catch all notification and auto-cancel candidates
  //
  // CRITICAL: Must start at 3 days to catch Visa cards in notification window:
  // - Visa authorization window: ~5 days
  // - Notification threshold: 48 hours before expiry
  // - Therefore: 5 days - 48 hours = ~3 days old when notification should be sent
  //
  // The old 5-7 day window missed Visa notifications entirely (already expired by 5 days)
  //
  // Note: We fetch all RSVPs in this window regardless of last_notified_at
  // to ensure auto-cancellation works even after notification is sent
  //
  // PERFORMANCE: For production workloads, consider adding a composite index:
  // CREATE INDEX idx_rsvps_payment_monitoring ON rsvps(status, stripe_payment_intent_id, created_at)
  // WHERE status = 'pending' AND stripe_payment_intent_id IS NOT NULL;
  // This would optimize the query filter conditions and date range scan.
  const { data: expiringRsvps, error: queryError } = await supabaseAdmin!
    .from("rsvps")
    .select(
      `
      id,
      stripe_payment_intent_id,
      created_at,
      status,
      user_id,
      event_id,
      requested_quantity,
      last_notified_at,
      events!inner (
        id,
        name,
        organization_id,
        organizations!inner (
          id,
          name,
          owner_id,
          stripe_account_id
        )
      )
    `
    )
    .eq("status", "pending")
    .not("stripe_payment_intent_id", "is", null)
    .not("events.organizations.stripe_account_id", "is", null) // Only process RSVPs for organizations with Stripe accounts
    .lte("created_at", THREE_DAYS_AGO.toISOString()) // Created at least 3 days ago (catches Visa notification window)
    .gte("created_at", SEVEN_DAYS_AGO.toISOString()); // Created at most 7 days ago (before Stripe auto-expires)

  if (queryError) {
    console.error("Error querying expiring RSVPs:", queryError);
    throw new Error(`Database query failed: ${queryError.message}`);
  }

  const results = {
    total: expiringRsvps?.length || 0,
    notified: 0,
    autoCancelled: 0,
    errors: [] as string[],
  };

  if (!expiringRsvps || expiringRsvps.length === 0) {
    console.log("No expiring authorizations found");
    return results;
  }

  console.log(
    `Found ${expiringRsvps.length} RSVPs with expiring authorizations`
  );

  const baseUrl = getBaseUrl();

  for (const rsvp of expiringRsvps) {
    try {
      if (!rsvp.stripe_payment_intent_id) {
        console.warn("RSVP missing payment intent ID:", rsvp.id);
        continue;
      }

      // Type assertion: Supabase returns nested relations as arrays, but !inner means single object
      // Use 'unknown' intermediate cast to handle Supabase's array return type
      const rsvpWithRelations = rsvp as unknown as RsvpWithRelations;
      const event = rsvpWithRelations.events;
      const organization = event.organizations;

      // Validate stripe_account_id is present
      if (!organization?.stripe_account_id) {
        console.warn("RSVP organization missing Stripe account:", {
          rsvpId: rsvp.id,
          organizationId: organization?.id,
        });
        results.errors.push(
          `RSVP ${rsvp.id}: Organization missing Stripe account`
        );
        continue;
      }

      // Verify PaymentIntent is still in capturable state
      // NOTE: PaymentIntents were created as destination charges (on_behalf_of + transfer_data) on the platform account,
      // so we must NOT pass stripeAccount option here - use platform account for these operations
      const paymentIntent = await stripe.paymentIntents.retrieve(
        rsvp.stripe_payment_intent_id,
        { expand: ["charges"] } // Expand charges to access capture_before field
      );

      // SECURITY: Validate PaymentIntent metadata matches RSVP record
      // This protects against DB inconsistencies or manual Stripe changes
      const metadataRsvpId = paymentIntent.metadata?.rsvpId;
      if (!metadataRsvpId) {
        console.warn("PaymentIntent missing rsvpId in metadata:", {
          rsvpId: rsvp.id,
          paymentIntentId: rsvp.stripe_payment_intent_id,
        });
        // Skip processing if metadata is missing to be safe, though this might skip valid older records.
        // Given the security implications, it's safer to skip monitoring for these edge cases.
        continue;
      }
      if (metadataRsvpId && metadataRsvpId !== String(rsvp.id)) {
        console.error("SECURITY: PaymentIntent metadata mismatch detected:", {
          rsvpId: rsvp.id,
          metadataRsvpId,
          paymentIntentId: rsvp.stripe_payment_intent_id,
        });
        // Skip this RSVP - don't act on mismatched metadata
        continue;
      }

      if (paymentIntent.status === "requires_capture") {
        // Use Stripe's capture_before field for accurate per-transaction expiry
        // Different card networks have different authorization windows (Visa ~5 days, others ~7 days)
        // NOTE: capture_before is a top-level field on the Charge object (charges.data[0].capture_before)
        const paymentIntentWithCharges =
          paymentIntent as unknown as PaymentIntentWithCharges;
        const charges = paymentIntentWithCharges.charges;
        const firstCharge = charges?.data?.[0];

        // capture_before is a top-level field on the Charge object
        const captureBeforeTimestamp = firstCharge?.capture_before ?? null;

        if (!captureBeforeTimestamp) {
          console.warn(
            "Missing capture_before field - using 7-day fallback estimate. " +
              "This may indicate an uncaptured auth or card network variation:",
            {
              rsvpId: rsvp.id,
              paymentIntentId: rsvp.stripe_payment_intent_id,
              chargeCount: charges?.data?.length ?? 0,
              firstChargeId: firstCharge?.id ?? null,
            }
          );
        }

        const expiresAt = captureBeforeTimestamp
          ? captureBeforeTimestamp * 1000 // Convert Unix timestamp to milliseconds
          : new Date(rsvp.created_at).getTime() + 7 * 24 * 60 * 60 * 1000; // Fallback to 7 days

        const timeUntilExpiryMs = expiresAt - Date.now();
        const timeUntilExpiryHours = timeUntilExpiryMs / (60 * 60 * 1000);

        // Dynamic thresholds based on actual expiry time
        const NOTIFICATION_THRESHOLD_HOURS = 48; // Notify 48 hours before expiry
        const AUTO_CANCEL_THRESHOLD_HOURS = 12; // Auto-cancel 12 hours before expiry (grace period)

        // Send notification if within notification window AND haven't notified yet
        // Use optimistic locking to prevent race conditions when multiple cron runs overlap
        // Feature flag: Skip notification path until ready to avoid noisy logs
        const NOTIFICATIONS_ENABLED =
          process.env.ENABLE_EXPIRY_NOTIFICATIONS === "true";

        if (
          timeUntilExpiryHours <= NOTIFICATION_THRESHOLD_HOURS &&
          timeUntilExpiryHours > AUTO_CANCEL_THRESHOLD_HOURS &&
          !rsvp.last_notified_at && // Pre-check: Only proceed if we haven't notified yet
          NOTIFICATIONS_ENABLED // Skip notification path until feature is ready
        ) {
          // Atomically update last_notified_at only if it's still null AND status is pending
          // This prevents duplicate notifications when cron runs overlap and race conditions
          // The update will only succeed if last_notified_at is still null (optimistic locking)
          const { data: updatedRsvp, error: updateNotifiedError } =
            await supabaseAdmin!
              .from("rsvps")
              .update({ last_notified_at: new Date().toISOString() })
              .eq("id", rsvp.id)
              .eq("status", "pending") // Only update if still pending
              .is("last_notified_at", null) // Optimistic locking: only update if still null
              .select()
              .maybeSingle();

          if (updateNotifiedError) {
            console.error("Failed to update last_notified_at:", {
              rsvpId: rsvp.id,
              error: updateNotifiedError,
            });
            // Skip notification if update failed (another cron run may have updated it)
            // Continue to auto-cancel logic below
          } else if (!updatedRsvp) {
            // Update returned no rows - another cron run already updated last_notified_at
            console.log(
              "Skipping notification - already notified by another cron run:",
              {
                rsvpId: rsvp.id,
              }
            );
            // Continue to auto-cancel logic below
          } else {
            // Atomic update succeeded - we're the first to update, so send notification
            // CRITICAL: We update the timestamp first for optimistic locking (prevents duplicates),
            // but if notification fails, we rollback the timestamp so it can be retried.
            // This prevents silent failures where the timestamp is committed but notification never sent.
            const timestampBeforeNotification = updatedRsvp.last_notified_at;
            try {
              await notifyOrganizerForAuthorizationExpiry({
                organizerId: organization.owner_id,
                organizationId: organization.id,
                rsvpId: rsvp.id,
                eventId: rsvp.event_id,
                expiresAt: expiresAt,
                actionUrl: `${baseUrl}/organizer/rsvps/${rsvp.event_id}`,
              });

              // Notification succeeded - timestamp is already committed, so we're done
              results.notified++;
            } catch (notificationError) {
              // Notification failed - rollback the timestamp so it can be retried
              // Only rollback if the timestamp hasn't changed (still our update)
              console.error("Notification failed, rolling back timestamp:", {
                rsvpId: rsvp.id,
                error:
                  notificationError instanceof Error
                    ? notificationError.message
                    : String(notificationError),
              });

              // Clear the timestamp so subsequent cron runs can retry
              // Use the timestamp value as a safety check to ensure we're not clearing someone else's update
              const { error: rollbackError } = await supabaseAdmin!
                .from("rsvps")
                .update({ last_notified_at: null })
                .eq("id", rsvp.id)
                .eq("status", "pending") // Only rollback if still pending
                .eq("last_notified_at", timestampBeforeNotification); // Only rollback if timestamp matches

              if (rollbackError) {
                console.error("Failed to rollback last_notified_at:", {
                  rsvpId: rsvp.id,
                  error: rollbackError,
                });
                // Log but don't throw - we've already logged the notification failure
              }

              // Add to errors but don't throw - continue processing other RSVPs
              results.errors.push(`Failed to notify for RSVP ${rsvp.id}`);
            }
          }
        }

        // Auto-cancel if within grace period (12 hours before expiry)
        if (timeUntilExpiryHours <= AUTO_CANCEL_THRESHOLD_HOURS) {
          // CRITICAL: Update DB first, then cancel PaymentIntent to prevent inconsistent state
          // If DB update fails, we don't cancel the PaymentIntent (prevents orphaned cancellations)
          // If PaymentIntent cancellation fails, rollback DB status to "pending"
          const { data: updatedRsvp, error: updateError } = await supabaseAdmin!
            .from("rsvps")
            .update({
              status: "auto_cancelled",
              cancelled_at: new Date().toISOString(),
              cancellation_reason:
                "Authorization expired (auto-cancelled before capture window)",
            })
            .eq("id", rsvp.id)
            .eq("status", "pending") // Only update if still pending (prevents race conditions)
            .select("id")
            .maybeSingle();

          if (updateError) {
            console.error("Failed to update auto-cancelled RSVP:", {
              rsvpId: rsvp.id,
              error: updateError,
            });
            results.errors.push(`Failed to update RSVP ${rsvp.id}`);
            // Don't cancel PaymentIntent if DB update failed - prevents inconsistent state
          } else if (!updatedRsvp) {
            // RSVP was not pending anymore (likely approved/rejected by organizer)
            console.log("Skipped auto-cancel - RSVP no longer pending:", {
              rsvpId: rsvp.id,
              paymentIntentId: rsvp.stripe_payment_intent_id,
            });
            // Don't cancel PaymentIntent - RSVP was already processed
          } else {
            // DB update succeeded - now cancel PaymentIntent
            // NOTE: No stripeAccount option - PaymentIntents are on platform account (destination charges)
            try {
              await stripe.paymentIntents.cancel(
                rsvp.stripe_payment_intent_id,
                {},
                {
                  idempotencyKey: `auto_cancel_${rsvp.id}_${rsvp.created_at}`,
                }
              );

              results.autoCancelled++;
              console.log("Auto-cancelled stale authorization:", {
                rsvpId: rsvp.id,
                paymentIntentId: rsvp.stripe_payment_intent_id,
                hoursUntilExpiry: timeUntilExpiryHours.toFixed(2),
                expiresAt: new Date(expiresAt).toISOString(),
              });
            } catch (cancelError) {
              // PaymentIntent cancellation failed - check if PI state has changed
              // before rolling back DB status to prevent inconsistent state
              console.error("Failed to cancel PaymentIntent after DB update:", {
                rsvpId: rsvp.id,
                paymentIntentId: rsvp.stripe_payment_intent_id,
                error:
                  cancelError instanceof Error
                    ? cancelError.message
                    : String(cancelError),
              });

              // If the PI already moved out of requires_capture, skip rollback
              // and let the status sync logic handle it on the next run.
              try {
                const refreshed = await stripe.paymentIntents.retrieve(
                  rsvp.stripe_payment_intent_id
                );
                if (refreshed.status !== "requires_capture") {
                  console.log(
                    "PI state changed during cancel; skipping rollback:",
                    {
                      rsvpId: rsvp.id,
                      paymentIntentId: rsvp.stripe_payment_intent_id,
                      status: refreshed.status,
                    }
                  );

                  // CRITICAL: If PaymentIntent succeeded, we MUST rollback RSVP to 'pending'
                  // so that reconciliation logic (or manual review) can issue tickets.
                  // If we leave it as 'auto_cancelled', the user has paid but gets no tickets.
                  if (refreshed.status === "succeeded") {
                    console.warn(
                      "PaymentIntent succeeded despite cancel attempt - rolling back RSVP to pending for reconciliation:",
                      {
                        rsvpId: rsvp.id,
                        paymentIntentId: rsvp.stripe_payment_intent_id,
                      }
                    );

                    // Proceed to rollback logic below (break out of this if check, or just don't continue)
                    // We intentionally do NOT 'continue' here so the code falls through to rollback
                  } else {
                    // For other states (canceled, processing), we can leave it as auto_cancelled or skip rollback
                    continue;
                  }
                }
              } catch (refreshError) {
                console.warn(
                  "Failed to refresh PI state; proceeding with rollback:",
                  {
                    rsvpId: rsvp.id,
                    paymentIntentId: rsvp.stripe_payment_intent_id,
                    error:
                      refreshError instanceof Error
                        ? refreshError.message
                        : String(refreshError),
                  }
                );
                // Fall through to rollback if refresh fails
              }

              // Rollback RSVP status to "pending"
              const { error: rollbackError } = await supabaseAdmin!
                .from("rsvps")
                .update({
                  status: "pending",
                  cancelled_at: null,
                  cancellation_reason: null,
                })
                .eq("id", rsvp.id)
                .eq("status", "auto_cancelled"); // Only rollback if still auto_cancelled

              if (rollbackError) {
                console.error(
                  "CRITICAL: Failed to rollback RSVP status after cancellation failure:",
                  {
                    rsvpId: rsvp.id,
                    rollbackError,
                  }
                );
                results.errors.push(
                  `Failed to rollback RSVP ${rsvp.id} after PaymentIntent cancellation failure`
                );
              } else {
                console.log(
                  "Rolled back RSVP status to pending after cancellation failure:",
                  {
                    rsvpId: rsvp.id,
                  }
                );
                results.errors.push(
                  `PaymentIntent cancellation failed for RSVP ${rsvp.id}, status rolled back to pending`
                );
              }
            }
          }
        }
      } else if (
        ["succeeded", "canceled", "requires_payment_method"].includes(
          paymentIntent.status
        )
      ) {
        // PaymentIntent already processed - sync RSVP status if needed
        console.log("PaymentIntent already processed:", {
          rsvpId: rsvp.id,
          paymentIntentId: rsvp.stripe_payment_intent_id,
          paymentIntentStatus: paymentIntent.status,
        });

        // Sync RSVP status to prevent stale pending state
        // This handles edge cases where webhook failed or manual Stripe changes occurred
        if (paymentIntent.status === "canceled") {
          const { data: syncedRsvp, error: syncError } = await supabaseAdmin!
            .from("rsvps")
            .update({
              status: "auto_cancelled",
              cancelled_at: new Date().toISOString(),
              cancellation_reason:
                "PaymentIntent was already cancelled in Stripe",
            })
            .eq("id", rsvp.id)
            .eq("status", "pending")
            .select("id")
            .maybeSingle();

          if (syncError) {
            console.error("Failed to sync cancelled RSVP:", {
              rsvpId: rsvp.id,
              error: syncError,
            });
          } else if (syncedRsvp) {
            console.log("Synced cancelled RSVP status:", {
              rsvpId: rsvp.id,
              paymentIntentId: rsvp.stripe_payment_intent_id,
            });
            // Note: This increments autoCancelled for synced cancellations (PaymentIntents already cancelled in Stripe)
            // not just auto-cancellations initiated by this cron. This is accurate but could be clarified in metrics.
            results.autoCancelled++;
          }
        } else if (paymentIntent.status === "succeeded") {
          // Log for investigation - this indicates a webhook might have failed
          console.warn(
            "PaymentIntent succeeded but RSVP still pending - investigate webhook:",
            {
              rsvpId: rsvp.id,
              paymentIntentId: rsvp.stripe_payment_intent_id,
            }
          );
          // We don't auto-sync to approved/purchased here because that requires complex logic
          // (order creation, ticket generation, etc.) which is handled by the webhook.
          // Just logging it as a discrepancy is valuable for now.
        }
      }
    } catch (error) {
      console.error("Error processing expiring authorization:", {
        rsvpId: rsvp.id,
        paymentIntentId: rsvp.stripe_payment_intent_id,
        error: error instanceof Error ? error.message : String(error),
      });
      results.errors.push(`Error processing RSVP ${rsvp.id}`);
      // Continue processing other RSVPs even if one fails
      continue;
    }
  }

  console.log("Payment authorization monitoring complete:", results);
  return results;
}

/**
 * Notify organizer about expiring payment authorization
 *
 * IMPLEMENTATION STATUS: NOT YET IMPLEMENTED
 *
 * This function is intentionally not implemented yet. Notifications will be sent via:
 * - iOS app push notifications (when iOS app is ready)
 * - Email notifications (when email integration is ready)
 *
 * Until then, this function throws an error to ensure:
 * 1. Monitoring metrics accurately reflect that notifications were NOT sent
 * 2. The rollback logic in the calling code works correctly (prevents incorrect last_notified_at timestamps)
 * 3. Errors are properly logged for monitoring/debugging
 *
 * When implementing, this function should:
 * - Send email to organizer using the existing Brevo email infrastructure (see app/lib/email/)
 * - Send push notification to organizer's iOS app (when iOS app is ready)
 * - Return successfully only when both notifications are sent (or handle partial failures appropriately)
 * - Throw errors that will be caught by the calling code's rollback logic
 *
 * @param params - Notification parameters
 * @param params.organizerId - The organizer's user ID (from organizations.owner_id)
 * @param params.organizationId - The organization's ID (organizations.id) — used to pin mobile push deep-links to the correct org
 * @param params.rsvpId - The RSVP ID that has an expiring authorization
 * @param params.eventId - The event ID for context
 * @param params.expiresAt - Unix timestamp (milliseconds) when authorization expires
 * @param params.actionUrl - URL to RSVP management page for organizer to take action
 * @throws {Error} Always throws an error indicating notification is not implemented yet
 */
async function notifyOrganizerForAuthorizationExpiry(params: {
  organizerId: string;
  organizationId: string;
  rsvpId: string;
  eventId: string;
  expiresAt: number;
  actionUrl: string;
}): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error("Database connection not available");
  }

  const hoursLeft = Math.max(
    0,
    Math.round((params.expiresAt - Date.now()) / (1000 * 60 * 60)),
  );

  const { data: eventData, error: eventError } = await supabaseAdmin
    .from("events")
    .select("name")
    .eq("id", params.eventId)
    .single();

  if (eventError) {
    console.error(
      `[monitor-payment-authorizations] Failed to fetch event ${params.eventId}:`,
      eventError,
    );
  }
  const eventName = eventData?.name || "an event";

  // 1. Fetch organizer email for Brevo email notification
  const { data: organizer, error: orgError } = await supabaseAdmin
    .from("users")
    .select("id, email, first_name, last_name")
    .eq("id", params.organizerId)
    .single();

  if (orgError || !organizer?.email) {
    throw new Error(
      `Failed to fetch organizer (${params.organizerId}) for auth expiry notification: ${orgError?.message || "no email"}`,
    );
  }

  // 2. Send Brevo email
  const brevoApiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || "noreply@flme.co";

  if (brevoApiKey) {
    try {
      const { BrevoClient } = await import("@getbrevo/brevo");
      const client = new BrevoClient({ apiKey: brevoApiKey });

      await client.transactionalEmails.sendTransacEmail({
        to: [{ email: organizer.email, name: `${organizer.first_name || ""} ${organizer.last_name || ""}`.trim() || "Organizer" }],
        sender: { email: fromEmail, name: "FLAME Events" },
        subject: `Action Required: RSVP payment for ${eventName} expires in ${hoursLeft}h`,
        htmlContent: `
          <!DOCTYPE html><html><head><meta charset="utf-8"></head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9f9f9; margin: 0; padding: 0;">
            <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <div style="background: linear-gradient(135deg, #ff6b35, #f7931e); color: white; padding: 30px 40px; text-align: center;">
                <h1 style="margin: 0; font-size: 24px;">Payment Authorization Expiring</h1>
              </div>
              <div style="padding: 40px;">
                <p>Hi ${organizer.first_name || "there"},</p>
                <p>An RSVP payment authorization for <strong>${eventName}</strong> will expire in approximately <strong>${hoursLeft} hours</strong>.</p>
                <p>If you don't approve or reject this RSVP before the authorization expires, the payment will auto-cancel and the customer's hold will be released.</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${params.actionUrl}" style="display: inline-block; background: linear-gradient(135deg, #ff6b35, #f7931e); color: white; text-decoration: none; padding: 15px 30px; border-radius: 25px; font-weight: 600;">Review RSVPs</a>
                </div>
              </div>
              <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
                <p style="margin: 0; font-size: 12px; color: #6c757d;">FLAME Events Platform</p>
              </div>
            </div>
          </body></html>`,
        headers: { "X-Priority": "1", "X-MSMail-Priority": "High", Importance: "High", "X-Mailer": "FLAME Events Platform" },
      });
      console.log("✅ Auth expiry email sent to:", organizer.email);
    } catch (emailErr) {
      console.error("❌ Failed to send auth expiry email:", emailErr);
    }
  }

  // 3. Send push notification
  try {
    await sendPushNotification({
      userId: organizer.id,
      type: "auth_expiry_warning",
      title: "Payment Expiring Soon",
      body: `RSVP payment for ${eventName} expires in ${hoursLeft}h. Approve or it auto-cancels.`,
      data: {
        deepLink: "/(tabs)/rsvp",
        eventId: params.eventId,
        orgId: params.organizationId,
      },
    });
    console.log("✅ Auth expiry notification sent for RSVP:", params.rsvpId);
  } catch (pushErr) {
    console.error(
      `[monitor-payment-authorizations] Failed to send push for RSVP ${params.rsvpId}, organizer ${organizer.id}:`,
      pushErr,
    );
    throw pushErr;
  }
}

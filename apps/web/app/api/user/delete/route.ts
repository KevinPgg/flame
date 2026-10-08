import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  supabaseAdmin,
  isSupabaseConfigured,
} from "../../../lib/supabase/server";

// Apple App Store Guideline 5.1.1(v) requires apps with account creation to
// offer account deletion. This endpoint deletes the user from Clerk, which
// triggers the `user.deleted` webhook at /api/webhooks/clerk. That webhook
// hard-deletes the Supabase `users` row when possible, and falls back to
// anonymization (email/name wiped) when the user has dependent records
// (e.g. an attendee with tickets). In both cases the user's personal data is
// no longer accessible, satisfying Apple's rule while preserving historical
// transaction records required for tax/audit compliance (Ecuador requires
// retaining invoice records for ~7 years).
//
// BLOCKER — organizer-with-active-data:
// Organizers who own organizations with (a) upcoming published events or
// (b) any paid/completed orders are blocked from self-serve deletion. A
// silent anonymization here would orphan the org (owner row becomes a
// tombstone, Stripe payouts keep routing to an unmanageable account) and
// leave attendees with events run by a "Deleted User". Apple 5.1.1(v)
// explicitly permits routing users to customer support when there are legal
// / regulatory / financial reasons (we have obligations to ticket buyers
// and tax retention duties). The UI clearly tells the user to email
// support@flme.co so the path is visible.
//
// This is a destructive, idempotent-ish operation. Clerk's deleteUser() is
// synchronous; the Supabase cleanup is eventual-consistent (webhook fires
// within a few seconds). From the client's perspective, once this endpoint
// returns 200, the account is considered deleted — the client should sign
// out immediately because the Clerk session is invalidated server-side.
export async function DELETE() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Organizer active-data check. Fail-open ONLY when Supabase is not
    // configured (local dev without admin creds). On actual query errors we
    // fail-SAFE with 503: we cannot guarantee there's no active organizer
    // data to protect, so we refuse to proceed rather than silently allow a
    // deletion that could orphan an organization with live events / sold
    // tickets. The client retries on 503.
    if (isSupabaseConfigured() && supabaseAdmin) {
      const blockResult = await checkOrganizerActiveData(userId);

      if (blockResult.status === "error") {
        console.error("[delete-user] Guard query failed — refusing delete:", {
          clerkId: userId,
          action: "delete-user-guard",
          error: blockResult.error,
        });
        return NextResponse.json(
          {
            error:
              "We couldn't verify your account state right now. Please try again in a moment.",
            code: "GUARD_UNAVAILABLE",
          },
          { status: 503 },
        );
      }

      if (blockResult.status === "blocked") {
        console.warn("[delete-user] Blocked — organizer has active data:", {
          clerkId: userId,
          reason: blockResult.reason,
        });
        return NextResponse.json(
          {
            error:
              "Your account has active events or sold tickets and cannot be deleted from the app. Please email support@flme.co and we'll help you close out your events before deleting your account.",
            code: "ACTIVE_ORGANIZER_DATA",
            reason: blockResult.reason,
            supportEmail: "support@flme.co",
          },
          { status: 409 },
        );
      }
    }

    const client = await clerkClient();

    try {
      await client.users.deleteUser(userId);
    } catch (err: unknown) {
      // Clerk returns 404 if the user is already deleted. Treat as success
      // so clients retrying after a network blip don't see a confusing error.
      const status =
        err !== null && typeof err === "object" && "status" in err
          ? (err as { status?: number }).status
          : undefined;
      if (status === 404) {
        console.warn("[delete-user] Clerk user already deleted:", userId);
        return NextResponse.json({ success: true, alreadyDeleted: true });
      }

      console.error("[delete-user] Clerk deleteUser failed:", {
        userId,
        error: err,
      });
      return NextResponse.json(
        { error: "Failed to delete account. Please try again or contact support." },
        { status: 500 },
      );
    }

    console.log("[delete-user] Clerk user deleted:", userId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[delete-user] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

type BlockReason =
  | "upcoming_published_events"
  | "sold_tickets"
  | "upcoming_published_events_and_sold_tickets";

type GuardResult =
  | { status: "ok" }
  | { status: "blocked"; reason: BlockReason }
  | { status: "error"; error: unknown };

/**
 * Determine whether the authenticated user is an organization owner with
 * active obligations that prevent self-serve deletion.
 *
 * Returns:
 *   - `{ status: "ok" }` when the user has no Supabase row, owns no orgs,
 *     or owns orgs with no upcoming published events and no paid/completed
 *     orders. The delete may proceed.
 *   - `{ status: "blocked", reason }` when an owned org has upcoming events
 *     or sold tickets. The caller returns 409 and routes to support.
 *   - `{ status: "error", error }` when any Supabase query fails. The
 *     caller returns 503 (retryable). We fail-SAFE here: a silent
 *     fail-open would allow deletions that orphan live organizations.
 */
async function checkOrganizerActiveData(clerkId: string): Promise<GuardResult> {
  if (!supabaseAdmin) {
    // Guard is effectively disabled without admin creds. Safe because
    // downstream the Clerk webhook still runs; the worst-case silent
    // anonymization for an active organizer is only reachable in local
    // dev without Supabase admin config, not in production.
    return { status: "ok" };
  }

  const userLookup = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("clerk_id", clerkId)
    .maybeSingle();

  if (userLookup.error) {
    return { status: "error", error: userLookup.error };
  }
  if (!userLookup.data) {
    // No Supabase row (user already cleaned up, or never synced). Benign —
    // nothing to block on.
    return { status: "ok" };
  }

  const supabaseUserId = userLookup.data.id;

  const orgsLookup = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("owner_user_id", supabaseUserId);

  if (orgsLookup.error) {
    return { status: "error", error: orgsLookup.error };
  }
  if (!orgsLookup.data || orgsLookup.data.length === 0) {
    return { status: "ok" };
  }

  const orgIds = orgsLookup.data.map((o) => o.id);
  const nowIso = new Date().toISOString();

  const [upcomingEventsResult, soldOrdersResult] = await Promise.all([
    supabaseAdmin
      .from("events")
      .select("id", { count: "exact", head: true })
      .in("organization_id", orgIds)
      .eq("status", "published")
      .gt("ends_at", nowIso),
    supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("organization_id", orgIds)
      .in("status", ["paid", "completed"]),
  ]);

  if (upcomingEventsResult.error) {
    return { status: "error", error: upcomingEventsResult.error };
  }
  if (soldOrdersResult.error) {
    return { status: "error", error: soldOrdersResult.error };
  }

  const hasUpcomingEvents = (upcomingEventsResult.count ?? 0) > 0;
  const hasSoldTickets = (soldOrdersResult.count ?? 0) > 0;

  if (hasUpcomingEvents && hasSoldTickets) {
    return {
      status: "blocked",
      reason: "upcoming_published_events_and_sold_tickets",
    };
  }
  if (hasUpcomingEvents) {
    return { status: "blocked", reason: "upcoming_published_events" };
  }
  if (hasSoldTickets) {
    return { status: "blocked", reason: "sold_tickets" };
  }

  return { status: "ok" };
}

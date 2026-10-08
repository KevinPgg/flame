import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { sendPushNotification } from "@/app/lib/push-notifications";

/**
 * Cron Job: Event Reminders
 *
 * Sends push notifications to ticket holders 24 hours before an event starts.
 *
 * Schedule: Every 6 hours (catches events starting in the next 24h window).
 * Deduplication: Uses the `notifications` table — skips users who already
 * received an `event_reminder` for the same event.
 *
 * Environment Variables Required:
 * - CRON_SECRET: Secret key for authenticating cron requests
 *
 * Note: Vercel Cron invokes endpoints with GET requests.
 */
async function runEventReminders() {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      );
    }

    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Find events starting in the next 24 hours
    const { data: upcomingEvents, error: eventsError } = await supabaseAdmin
      .from("events")
      .select("id, name, venue, starts_at, slug")
      .gte("starts_at", now.toISOString())
      .lte("starts_at", in24h.toISOString())
      .eq("status", "published");

    if (eventsError) {
      console.error("[event-reminders] Failed to query events:", eventsError);
      return NextResponse.json(
        { error: "Failed to query events" },
        { status: 500 },
      );
    }

    if (!upcomingEvents?.length) {
      return NextResponse.json({
        message: "No upcoming events in the next 24 hours",
        processed: 0,
      });
    }

    let totalSent = 0;
    let totalSkipped = 0;

    for (const event of upcomingEvents) {
      // Get all ticket holders for this event
      const { data: tickets, error: ticketsError } = await supabaseAdmin
        .from("tickets")
        .select("user_id")
        .eq("event_id", event.id);

      if (ticketsError) {
        console.error(
          `[event-reminders] Tickets query failed for event ${event.id} (${event.name}):`,
          ticketsError,
        );
        continue;
      }
      if (!tickets?.length) continue;

      const uniqueUserIds = [...new Set(tickets.map((t) => t.user_id))];

      // Check which users already received a reminder for this event
      const { data: existingReminders, error: dedupeError } = await supabaseAdmin
        .from("notifications")
        .select("user_id")
        .eq("type", "event_reminder")
        .in("user_id", uniqueUserIds)
        .contains("data", { eventId: event.id });

      if (dedupeError) {
        console.error(
          `[event-reminders] Dedupe query failed for event ${event.id}, users ${uniqueUserIds.length}:`,
          dedupeError,
        );
        continue;
      }

      const alreadyNotified = new Set(
        (existingReminders ?? []).map((r) => r.user_id),
      );

      // Pre-filter opted-out users to avoid wasted sendPushNotification calls
      // and repeated attempts every cron run (no notification record inserted for opted-out)
      const { data: userPrefs } = await supabaseAdmin
        .from("users")
        .select("id, notification_preferences")
        .in("id", uniqueUserIds);

      const optedOut = new Set(
        (userPrefs ?? [])
          .filter(
            (u) =>
              (u.notification_preferences as Record<string, boolean>)?.[
                "event_reminder"
              ] === false,
          )
          .map((u) => u.id),
      );

      for (const userId of uniqueUserIds) {
        if (alreadyNotified.has(userId)) {
          totalSkipped++;
          continue;
        }
        if (optedOut.has(userId)) {
          totalSkipped++;
          continue;
        }

        try {
          const sent = await sendPushNotification({
            userId,
            type: "event_reminder",
            title: "Event Tomorrow!",
            body: `${event.name} is tomorrow${event.venue ? ` at ${event.venue}` : ""}. Don't forget your tickets!`,
            data: {
              deepLink: `/event/${event.slug || event.id}`,
              eventId: event.id,
            },
          });
          if (sent) totalSent++;
        } catch (err) {
          console.error(
            `[event-reminders] Failed to send reminder to user ${userId} for event ${event.id}:`,
            err,
          );
        }
      }
    }

    console.log(
      `[event-reminders] Processed ${upcomingEvents.length} events: ${totalSent} sent, ${totalSkipped} skipped (already notified)`,
    );

    return NextResponse.json({
      message: "Event reminders processed",
      events: upcomingEvents.length,
      sent: totalSent,
      skipped: totalSkipped,
    });
  } catch (error) {
    console.error("[event-reminders] Cron error:", error);
    throw error;
  }
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error("CRON_SECRET not configured");
      return NextResponse.json(
        { error: "Cron job not configured" },
        { status: 500 },
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return await runEventReminders();
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error("CRON_SECRET not configured");
      return NextResponse.json(
        { error: "Cron job not configured" },
        { status: 500 },
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return await runEventReminders();
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

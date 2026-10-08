/**
 * Server-side push notification dispatch via Expo Push Service.
 *
 * Sends push notifications to users' registered devices and persists
 * a notification record in the `notifications` table for in-app display.
 */

import { supabaseAdmin } from "./supabase/server";
import type { NotificationType } from "@project-flame/lib";
import { NON_DISMISSABLE_NOTIFICATION_TYPES } from "@project-flame/lib";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type { NotificationType };

interface PushNotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
}

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound: "default";
  priority: "high";
  channelId: "default";
}

/**
 * Check if a user has opted in to a specific notification type.
 * Returns true if preferences are not set (default: all enabled).
 */
async function isNotificationEnabled(
  userId: string,
  type: NotificationType,
): Promise<boolean> {
  // Non-dismissable notifications are always enabled regardless of user preferences
  if (NON_DISMISSABLE_NOTIFICATION_TYPES.has(type)) return true;

  if (!supabaseAdmin) {
    console.warn("[push] Supabase not configured — treating notifications as disabled");
    return false;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("notification_preferences")
      .eq("id", userId)
      .single();

    if (error) {
      console.error(`[push] Failed to fetch notification prefs for user ${userId}, type ${type}:`, error);
      return false;
    }

    const prefs = data?.notification_preferences as Record<string, boolean> | undefined;
    if (!prefs) return true;
    return prefs[type] !== false;
  } catch (err) {
    console.error(`[push] Error checking notification prefs for user ${userId}, type ${type}:`, err);
    return false;
  }
}

/**
 * Send a push notification to a single user (all their registered devices).
 * Also inserts a notification record for in-app display.
 * @returns true if a notification was actually sent, false if skipped (opt-out, no tokens, etc.)
 */
export async function sendPushNotification(
  payload: PushNotificationPayload,
): Promise<boolean> {
  if (!supabaseAdmin) {
    console.warn("[push] Supabase not configured — skipping push notification");
    return false;
  }

  const { userId, type, title, body, data } = payload;

  try {
    const enabled = await isNotificationEnabled(userId, type);
    if (!enabled) {
      console.log(`[push] User ${userId} has disabled ${type} notifications — skipping`);
      return false;
    }

    // Insert notification record for in-app display (regardless of push delivery)
    const { error: insertError } = await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      type,
      title,
      body,
      data: data ?? {},
    });

    if (insertError) {
      console.error(`[push] Failed to insert notification for user ${userId}, eventId ${data?.eventId ?? "n/a"}, type ${type}:`, insertError, { title, body, data });
      throw insertError;
    }

    // Look up all push tokens for this user
    const { data: tokens, error: tokenError } = await supabaseAdmin
      .from("push_tokens")
      .select("expo_push_token")
      .eq("user_id", userId);

    if (tokenError) {
      console.error(
        `[push] Token lookup failed for user ${userId}, type ${type}, eventId ${data?.eventId ?? "n/a"}:`,
        tokenError,
      );
      return false;
    }
    if (!tokens?.length) {
      console.warn(
        `[push] No registered devices for user ${userId}, type ${type}, eventId ${data?.eventId ?? "n/a"} — user has no push_tokens rows`,
      );
      return false;
    }

    const messages: PushMessage[] = tokens.map((t) => ({
      to: t.expo_push_token,
      title,
      body,
      data: { ...data, type },
      sound: "default" as const,
      priority: "high" as const,
      channelId: "default",
    }));

    await sendToExpoPushService(messages);
    return true;
  } catch (err) {
    console.error(`[push] Failed to send ${type} notification to user ${userId}:`, err);
    throw err;
  }
}

/**
 * @deprecated Use sendPushToOrgMembersByRole with explicit role filter instead.
 * Kept for reference only — do not call or re-export.
 */
async function sendPushToOrgMembers(
  orgId: string,
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  if (!supabaseAdmin) {
    console.warn("[push] supabaseAdmin unavailable — skipping org fanout", {
      action: "sendPushToOrgMembers",
      orgId,
      type,
    });
    return;
  }

  try {
    const { data: members, error } = await supabaseAdmin
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", orgId);

    if (error) {
      console.error(
        `[push] organization_members fanout query failed for org ${orgId}, type ${type}:`,
        error,
      );
      return;
    }
    if (!members?.length) return;

    const FANOUT_CHUNK_SIZE = 10;
    for (let i = 0; i < members.length; i += FANOUT_CHUNK_SIZE) {
      const chunk = members.slice(i, i + FANOUT_CHUNK_SIZE);
      const results = await Promise.allSettled(
        chunk.map((m) =>
          sendPushNotification({
            userId: m.user_id,
            type,
            title,
            body,
            data,
          }),
        ),
      );
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status === "rejected") {
          console.error(
            `[push] Rejected sending ${type} to org ${orgId} member ${chunk[j]?.user_id}:`,
            r.reason,
          );
        }
      }
    }
  } catch (err) {
    console.error(`[push] Failed to send ${type} to org ${orgId}:`, err);
  }
}

/**
 * Role-filtered org push: sends a notification to org members whose role
 * matches the given list (e.g. `["owner", "admin"]`).
 *
 * Handles: `new_rsvp_request`, `ticket_sold`, and any future org-facing types.
 *
 * When `options.eventId` is provided, assigned organizers for that event are
 * also included in the recipient set (relevant for `new_rsvp_request` and
 * similar event-scoped notifications).
 */
export async function sendPushToOrgMembersByRole(
  orgId: string,
  type: NotificationType,
  title: string,
  body: string,
  roles: string[],
  options?: { eventId?: string; data?: Record<string, string> },
): Promise<void> {
  if (!supabaseAdmin) {
    console.warn("[push] supabaseAdmin unavailable — skipping role-filtered org fanout", {
      action: "sendPushToOrgMembersByRole",
      orgId,
      type,
    });
    return;
  }

  try {
    // Fetch members matching the requested roles
    const { data: roleMembers, error: roleError } = await supabaseAdmin
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", orgId)
      .in("role", roles);

    if (roleError) {
      console.error(
        `[push] role-filtered fanout query failed for org ${orgId}, type ${type}:`,
        roleError,
      );
      return;
    }

    const userIds = new Set((roleMembers ?? []).map((m) => m.user_id));

    // For event-scoped notifications, also include assigned organizers for that event
    if (options?.eventId) {
      const { data: assignments, error: assignError } = await supabaseAdmin
        .from("event_assignments")
        .select("user_id")
        .eq("organization_id", orgId)
        .eq("event_id", options.eventId)
        .not("user_id", "is", null);

      if (assignError) {
        console.error(
          `[push] event_assignments query failed for event ${options.eventId}, type ${type}:`,
          assignError,
        );
      } else if (assignments) {
        for (const a of assignments) {
          if (a.user_id) userIds.add(a.user_id);
        }
      }
    }

    if (userIds.size === 0) return;

    const FANOUT_CHUNK_SIZE = 10;
    const ids = Array.from(userIds);
    for (let i = 0; i < ids.length; i += FANOUT_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + FANOUT_CHUNK_SIZE);
      const results = await Promise.allSettled(
        chunk.map((userId) =>
          sendPushNotification({
            userId,
            type,
            title,
            body,
            data: options?.data,
          }),
        ),
      );
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status === "rejected") {
          console.error(
            `[push] Rejected sending ${type} to org ${orgId} member ${chunk[j]}:`,
            r.reason,
          );
        }
      }
    }
  } catch (err) {
    console.error(`[push] Failed to send ${type} (role-filtered) to org ${orgId}:`, err);
  }
}

/**
 * Send a push notification to all ticket holders for a specific event.
 */
export async function sendPushToEventTicketHolders(
  eventId: string,
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  if (!supabaseAdmin) {
    console.warn("[push] supabaseAdmin unavailable — skipping event ticket holders fanout", {
      action: "sendPushToEventTicketHolders",
      eventId,
      type,
    });
    return;
  }

  try {
    const { data: tickets, error } = await supabaseAdmin
      .from("tickets")
      .select("user_id")
      .eq("event_id", eventId);

    if (error) {
      console.error(
        `[push] tickets fanout query failed for event ${eventId}, type ${type}:`,
        error,
      );
      return;
    }
    if (!tickets?.length) return;

    // Deduplicate user IDs (a user may hold multiple tickets)
    const uniqueUserIds = [...new Set(tickets.map((t) => t.user_id))];

    const FANOUT_CHUNK_SIZE = 10;
    for (let i = 0; i < uniqueUserIds.length; i += FANOUT_CHUNK_SIZE) {
      const chunk = uniqueUserIds.slice(i, i + FANOUT_CHUNK_SIZE);
      const results = await Promise.allSettled(
        chunk.map((userId) =>
          sendPushNotification({ userId, type, title, body, data }),
        ),
      );
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status === "rejected") {
          console.error(
            `[push] Rejected sending ${type} to event ${eventId} ticket holder ${chunk[j]}:`,
            r.reason,
          );
        }
      }
    }
  } catch (err) {
    console.error(`[push] Failed to send ${type} to event ${eventId} ticket holders:`, err);
  }
}

/**
 * Low-level function to send messages to the Expo Push Service.
 * Handles batching (Expo recommends max 100 per request) and auth.
 */
// Emit the missing-token warning at most once per server process to avoid
// flooding logs when many push notifications are sent in a short window.
let warnedAboutMissingExpoAccessToken = false;

async function sendToExpoPushService(messages: PushMessage[]): Promise<void> {
  const accessToken = process.env.EXPO_ACCESS_TOKEN;
  if (!accessToken && !warnedAboutMissingExpoAccessToken) {
    warnedAboutMissingExpoAccessToken = true;
    console.warn(
      "[push] EXPO_ACCESS_TOKEN is not set — push delivery to EAS production builds will likely fail. " +
      "Generate a token at https://expo.dev/accounts/[account]/settings/access-tokens and add it to your server environment.",
    );
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const BATCH_SIZE = 100;
  const FETCH_TIMEOUT_MS = 10_000;

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(batch),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text();
        console.error(`[push] Expo Push API error (${response.status}):`, text);
        continue;
      }

      try {
        const responseJson = (await response.json()) as {
          data?: Array<{ status?: string; message?: string; details?: unknown }>;
        };

        if (Array.isArray(responseJson?.data)) {
          for (let j = 0; j < responseJson.data.length; j++) {
            const ticket = responseJson.data[j];
            if (ticket?.status === "error") {
              console.error(
                `[push] Expo per-ticket error (batch index ${j}):`,
                ticket.message ?? ticket.details ?? ticket,
              );
            }
          }
        }
      } catch (parseErr) {
        console.error("[push] Failed to parse Expo Push API response:", parseErr);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        console.error("[push] Expo Push API request timed out");
      } else {
        console.error("[push] Network error sending to Expo Push Service:", err);
      }
    }
  }
}

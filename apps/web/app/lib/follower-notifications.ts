/**
 * Fase 4.2 · aviso a seguidores (decision of Kevin 2026-11-02): when an organization publishes an
 * event, everyone who follows it gets an in-app notification + push ("followed_org_event"), in
 * their language, unless they turned that type off in Settings. Members of the organization are
 * skipped (they made it). Never throws: the event already exists.
 *
 * Called from POST /api/events through next/server `after()`, so creating the event does not
 * wait for the fan-out.
 */
import { LOCALE_BY_LANGUAGE, resolveLanguage, translate, type Language } from "@project-flame/lib";
import { supabaseAdmin } from "./supabase/server";
import { sendPushNotification } from "./push-notifications";

export type PublishedEvent = {
  id: string;
  organization_id: string;
  name: string;
  starts_at: string;
  timezone?: string | null;
  city?: string | null;
};

const PAGE = 1000; // PostgREST max_rows
const USERS_CHUNK = 200; // ids per `.in()` (keeps the URL short)
const SEND_CHUNK = 10; // like the other fan-outs in push-notifications.ts

/** "Sat 14 Nov, 22:00" in the event's time zone and the reader's language. */
export function formatEventDate(startsAt: string, timezone: string | null | undefined, lang: Language): string {
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return "";
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false };
  try {
    return new Intl.DateTimeFormat(LOCALE_BY_LANGUAGE[lang], { ...opts, timeZone: timezone || "UTC" }).format(d);
  } catch {
    return new Intl.DateTimeFormat(LOCALE_BY_LANGUAGE[lang], { ...opts, timeZone: "UTC" }).format(d);
  }
}

export function followedEventMessage(lang: Language, orgName: string, ev: PublishedEvent) {
  const date = formatEventDate(ev.starts_at, ev.timezone, lang);
  const city = ev.city?.trim();
  return {
    title: translate(lang, "pushes.followedOrgEvent.title", { org: orgName }),
    body: city
      ? translate(lang, "pushes.followedOrgEvent.bodyCity", { event: ev.name, date, city })
      : translate(lang, "pushes.followedOrgEvent.body", { event: ev.name, date }),
  };
}

/** Every follower of the organization (all pages), minus its members. */
async function followerIds(orgId: string): Promise<string[]> {
  const db = supabaseAdmin!;
  const ids: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("organization_follows")
      .select("user_id")
      .eq("organization_id", orgId)
      .order("user_id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ user_id: string }>;
    ids.push(...rows.map((r) => r.user_id));
    if (rows.length < PAGE) break;
  }
  if (ids.length === 0) return [];
  const { data: members, error } = await db.from("organization_members").select("user_id").eq("organization_id", orgId);
  if (error) throw error;
  const skip = new Set(((members ?? []) as Array<{ user_id: string }>).map((m) => m.user_id));
  return [...new Set(ids)].filter((id) => !skip.has(id));
}

/** Returns how many followers got it (for logs/tests). */
export async function notifyFollowersOfNewEvent(ev: PublishedEvent, orgName?: string | null): Promise<number> {
  if (!supabaseAdmin) return 0;
  let sent = 0;
  try {
    const ids = await followerIds(ev.organization_id);
    if (ids.length === 0) return 0;

    let name = orgName?.trim();
    if (!name) {
      const { data } = await supabaseAdmin.from("organizations").select("name").eq("id", ev.organization_id).maybeSingle();
      name = (data as { name?: string } | null)?.name ?? "Flame";
    }

    // Language and opt-out in one read per chunk (sendPushNotification checks the opt-out again).
    const people: Array<{ id: string; lang: Language }> = [];
    for (let i = 0; i < ids.length; i += USERS_CHUNK) {
      const { data, error } = await supabaseAdmin
        .from("users")
        .select("id, language, notification_preferences")
        .in("id", ids.slice(i, i + USERS_CHUNK));
      if (error) throw error;
      for (const u of (data ?? []) as Array<{ id: string; language?: string | null; notification_preferences?: Record<string, boolean> | null }>) {
        if (u.notification_preferences?.followed_org_event === false) continue;
        people.push({ id: u.id, lang: resolveLanguage(u.language) });
      }
    }

    const messages = new Map<Language, { title: string; body: string }>();
    const msg = (lang: Language) => {
      if (!messages.has(lang)) messages.set(lang, followedEventMessage(lang, name!, ev));
      return messages.get(lang)!;
    };

    for (let i = 0; i < people.length; i += SEND_CHUNK) {
      const chunk = people.slice(i, i + SEND_CHUNK);
      const results = await Promise.allSettled(
        chunk.map((p) =>
          sendPushNotification({
            userId: p.id,
            type: "followed_org_event",
            ...msg(p.lang),
            data: { eventId: ev.id, orgId: ev.organization_id },
          })
        )
      );
      results.forEach((r, j) => {
        if (r.status === "fulfilled") sent += 1; // in-app row written (push may be skipped: no device)
        else console.error(`[followers] notification failed for user ${chunk[j].id}, event ${ev.id}:`, r.reason);
      });
    }
    console.log(`[followers] event ${ev.id}: notified ${sent}/${people.length} followers`);
  } catch (err) {
    console.error(`[followers] fan-out failed for event ${ev.id}:`, err);
  }
  return sent;
}

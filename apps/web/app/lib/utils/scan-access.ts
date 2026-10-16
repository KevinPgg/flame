import { selectAllPages } from "./supabase-pagination";

/**
 * Door scanning (decision 2026-10-16): who may verify / check in tickets of an event.
 *  - platform admins (users.role = 'admin');
 *  - any member of the event's organization (any role);
 *  - any member of an organization co-hosting the event;
 *  - people designated for that event (event_scanners) — any Flame account.
 *  - separately, anyone holding the event's access code (no account; see accessCodesEnabled).
 * Before, any users.role = 'organizer' could verify tickets and only org membership was checked
 * for organizers; people without an organizer account could only use the shared event code.
 */

export type ScanVia = "platform_admin" | "member" | "cohost" | "designated";
export type ScanAccess = { allowed: true; via: ScanVia } | { allowed: false; failed?: boolean };

export interface ScanUser {
  id: string;
  role?: string | null;
}

/** users row (id, role) of a Clerk user, or null if not found. Throws on DB error. */
export async function scanUserFromClerk(db: any, clerkId: string): Promise<ScanUser | null> {
  const { data, error } = await db.from("users").select("id, role").eq("clerk_id", clerkId).maybeSingle();
  if (error) throw error;
  return (data as ScanUser | null) ?? null;
}

export async function getScanAccess(
  db: any,
  user: ScanUser,
  event: { id: string; organization_id: string }
): Promise<ScanAccess> {
  try {
    if (user.role === "admin") return { allowed: true, via: "platform_admin" };

    const { data: memberships, error: mErr } = await db
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id);
    if (mErr) throw mErr;
    const orgIds = (memberships ?? []).map((m: { organization_id: string }) => m.organization_id);
    if (orgIds.includes(event.organization_id)) return { allowed: true, via: "member" };

    if (orgIds.length > 0) {
      const { data: cohost, error: cErr } = await db
        .from("event_assignments")
        .select("id")
        .eq("event_id", event.id)
        .in("cohost_organization_id", orgIds)
        .limit(1);
      if (cErr) throw cErr;
      if ((cohost ?? []).length > 0) return { allowed: true, via: "cohost" };
    }

    const { data: designated, error: dErr } = await db
      .from("event_scanners")
      .select("id")
      .eq("event_id", event.id)
      .eq("user_id", user.id)
      .limit(1);
    if (dErr) throw dErr;
    if ((designated ?? []).length > 0) return { allowed: true, via: "designated" };

    return { allowed: false };
  } catch (error) {
    console.error("[scan-access] lookup failed", { userId: user.id, eventId: event.id, error });
    return { allowed: false, failed: true };
  }
}

/**
 * Ids of the events a person may scan (for the scanner's event picker): own/co-hosted orgs'
 * events plus the ones they were designated for. Platform admins: null = every event.
 * Throws on DB error.
 */
export async function scannableEventIds(db: any, user: ScanUser): Promise<string[] | null> {
  if (user.role === "admin") return null;
  const { data: memberships, error: mErr } = await db
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id);
  if (mErr) throw mErr;
  const orgIds: string[] = (memberships ?? []).map((m: { organization_id: string }) => m.organization_id);
  const ids = new Set<string>();
  if (orgIds.length > 0) {
    const own = await selectAllPages<{ id: string }>((from, to) =>
      db.from("events").select("id").in("organization_id", orgIds).order("id").range(from, to)
    );
    own.forEach((e) => ids.add(e.id));
    const cohost = await selectAllPages<{ id: string; event_id: string }>((from, to) =>
      db.from("event_assignments").select("id, event_id").in("cohost_organization_id", orgIds).order("id").range(from, to)
    );
    cohost.forEach((e) => ids.add(e.event_id));
  }
  const designated = await selectAllPages<{ id: string; event_id: string }>((from, to) =>
    db.from("event_scanners").select("id, event_id").eq("user_id", user.id).order("id").range(from, to)
  );
  designated.forEach((e) => ids.add(e.event_id));
  return Array.from(ids);
}

/**
 * Per-event access code: a permanent second way in (decision 2026-10-16) for phones the organizer
 * hands to door staff without creating an account. SCANNER_ACCESS_CODES=off is only an emergency
 * switch (verify, checkin and validate-code then refuse codes).
 */
export const accessCodesEnabled = () => process.env.SCANNER_ACCESS_CODES !== "off";

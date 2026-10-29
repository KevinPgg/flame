/**
 * Organizer RSVP management — pure functions shared by web and mobile (Flame 2.0).
 *
 * Input is what GET /api/organizer/rsvps returns. Rules match v1
 * (apps/web/app/components/RsvpManagement.tsx) unless noted:
 * - Shown amount = what the organizer receives (stored base price, or the legacy extraction).
 * - Only pending RSVPs of events that haven't ended can be approved or rejected.
 * - Tabs follow the prototype: "Approved" also lists RSVPs already paid ("purchased");
 *   v1's Approved filter hid them.
 */
import { getBasePriceFromTicket } from "../pricing/calculations";
import { splitEventsByTime, searchEventsByName, type DashboardEvent } from "./dashboard";

export type RsvpStatus =
  | "pending"
  | "approved"
  | "purchased"
  | "rejected"
  | "auto_cancelled"
  | "payment_failed"
  | "expired";

export interface RsvpUser {
  first_name: string | null;
  last_name: string | null;
  email: string;
  document_id?: string | null;
  date_of_birth?: string | null;
}

export interface OrganizerRsvp {
  id: string;
  status: string;
  requested_quantity: number;
  requested_at: string;
  approved_at?: string | null;
  rejected_at?: string | null;
  stage_name?: string | null;
  stage_price_cents?: number | null;
  base_price_cents?: number | null;
  fee_percentage?: number | null;
  registration_data?: Record<string, unknown> | null;
  users: RsvpUser;
  ticket_tiers: { name: string; price_cents: number };
}

export interface RegistrationField {
  id: string;
  label: string;
  type?: string;
  required?: boolean;
  archived?: boolean;
}

export const RSVP_TABS = ["all", "pending", "approved", "rejected"] as const;
export type RsvpTab = (typeof RSVP_TABS)[number];

/** Statuses with their own label; anything unknown is shown as "other". */
const KNOWN: readonly string[] = ["pending", "approved", "purchased", "rejected", "auto_cancelled", "payment_failed", "expired"];
export const rsvpStatusKey = (status: string): RsvpStatus | "other" =>
  (KNOWN.includes(status) ? status : "other") as RsvpStatus | "other";

/** Tab an RSVP belongs to besides "all" (null = only in "all", e.g. expired). */
export function rsvpTabOf(status: string): Exclude<RsvpTab, "all"> | null {
  if (status === "pending") return "pending";
  if (status === "approved" || status === "purchased") return "approved";
  if (status === "rejected") return "rejected";
  return null;
}

export function rsvpTabCounts(rsvps: Pick<OrganizerRsvp, "status">[]): Record<RsvpTab, number> {
  const counts: Record<RsvpTab, number> = { all: rsvps.length, pending: 0, approved: 0, rejected: 0 };
  for (const r of rsvps) {
    const tab = rsvpTabOf(r.status);
    if (tab) counts[tab]++;
  }
  return counts;
}

export function filterRsvps<R extends Pick<OrganizerRsvp, "status">>(rsvps: R[], tab: RsvpTab): R[] {
  return tab === "all" ? rsvps : rsvps.filter((r) => rsvpTabOf(r.status) === tab);
}

/** Tab to open first: Pending when something waits, otherwise All (prototype). */
export const defaultRsvpTab = (rsvps: Pick<OrganizerRsvp, "status">[]): RsvpTab =>
  rsvps.some((r) => r.status === "pending") ? "pending" : "all";

/**
 * Amount shown for an RSVP = what the organizer receives for the whole request.
 * Stored `base_price_cents` already includes quantity and discount; older RSVPs fall back to the
 * stage/tier price through the legacy fee extraction × quantity (v1 getRsvpDisplayPrice).
 */
export function rsvpAmountCents(rsvp: OrganizerRsvp): number {
  if (rsvp.base_price_cents !== null && rsvp.base_price_cents !== undefined) return rsvp.base_price_cents;
  const unit = rsvp.stage_price_cents ?? rsvp.ticket_tiers.price_cents;
  try {
    return getBasePriceFromTicket(unit, rsvp.requested_at, rsvp.fee_percentage) * rsvp.requested_quantity;
  } catch {
    return unit * rsvp.requested_quantity;
  }
}

/** "First Last", or the email when the account has no name. */
export function rsvpGuestName(user: RsvpUser): string {
  const name = [user.first_name, user.last_name].map((x) => x?.trim()).filter(Boolean).join(" ");
  return name || user.email;
}

export const rsvpTicketLabel = (rsvp: OrganizerRsvp) =>
  rsvp.stage_name ? `${rsvp.ticket_tiers.name} · ${rsvp.stage_name}` : rsvp.ticket_tiers.name;

/** Approve/reject only pending requests of events that haven't ended (v1 hides them otherwise). */
export function canDecideRsvp(rsvp: Pick<OrganizerRsvp, "status">, eventEndsAt: string, now: Date = new Date()): boolean {
  return rsvp.status === "pending" && new Date(eventEndsAt).getTime() > now.getTime();
}

/** What "Approve all" would do: every pending request, with the organizer total and how many are paid. */
export function approveAllPlan(rsvps: OrganizerRsvp[]) {
  const pending = rsvps.filter((r) => r.status === "pending");
  const amounts = pending.map(rsvpAmountCents);
  return {
    rsvps: pending,
    count: pending.length,
    totalCents: amounts.reduce((a, b) => a + b, 0),
    paidCount: amounts.filter((a) => a > 0).length,
  };
}

export type RegistrationValue = { kind: "text"; text: string } | { kind: "bool"; value: boolean } | { kind: "missing" };

export interface RegistrationEntry {
  key: string;
  label: string;
  required: boolean;
  archived: boolean;
  value: RegistrationValue;
}

const toValue = (raw: unknown, type?: string): RegistrationValue => {
  if (raw === undefined || raw === null || raw === "") return { kind: "missing" };
  if (type === "checkbox" || typeof raw === "boolean") return { kind: "bool", value: Boolean(raw) };
  return { kind: "text", text: String(raw) };
};

/**
 * Registration answers in the organizer's form order, labelled with the form's own labels
 * (organizer content, never translated). Without a form config, the raw submitted keys are shown
 * (`fromConfig: false`), like v1.
 */
export function registrationEntries(
  config: RegistrationField[] | null | undefined,
  data: Record<string, unknown> | null | undefined
): { fromConfig: boolean; entries: RegistrationEntry[] } {
  if (Array.isArray(config) && config.length > 0) {
    return {
      fromConfig: true,
      entries: config.map((f) => ({
        key: f.id,
        label: f.label,
        required: Boolean(f.required),
        archived: Boolean(f.archived),
        value: toValue(data?.[f.id], f.type),
      })),
    };
  }
  return {
    fromConfig: false,
    // Internal keys (`_guests`, `_promotional_code_id`) aren't answers.
    entries: Object.entries(data ?? {}).filter(([k]) => !k.startsWith("_")).map(([k, v]) => ({
      key: k,
      label: k,
      required: false,
      archived: false,
      value: toValue(v),
    })),
  };
}

/**
 * Fase 3.4: answers of guests 2..N (`registration_data._guests`), one block per guest, with the
 * same labels as the requester's. Empty when the RSVP has no extra guests' answers.
 */
export function rsvpGuestBlocks(
  config: RegistrationField[] | null | undefined,
  data: Record<string, unknown> | null | undefined
): Array<{ guest: number; entries: RegistrationEntry[] }> {
  const guests = data && Array.isArray(data._guests) ? (data._guests as unknown[]) : [];
  return guests.map((g, i) => ({
    guest: i + 2,
    entries: registrationEntries(config, g && typeof g === "object" ? (g as Record<string, unknown>) : {}).entries,
  }));
}

/** Events in the RSVP section: RSVP-only events, split current/past, searched by name. */
export function rsvpEventLists<E extends DashboardEvent>(events: E[], query = "", now: Date = new Date()) {
  const rsvpOnly = events.filter((e) => e.requires_rsvp === true);
  const { current, past } = splitEventsByTime(rsvpOnly, now);
  return { current: searchEventsByName(current, query), past: searchEventsByName(past, query) };
}

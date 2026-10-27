/**
 * Flame 2.0 "My tickets" and the QR ticket (fase 2.3) — one rule set for web and app over the
 * same UserTicket rows both already load (web /api/user/tickets, app useUserTickets).
 *
 * - One card per EVENT with every ticket you can show at the door (all tiers, purchased and
 *   courtesy), so the ticket screen can swipe across all of them without reloading.
 * - RSVP requests get their own card with their state (pending, approved, not approved…).
 * - Counters as in v1: purchased = tickets of upcoming events; pending = requested quantity of
 *   pending/approved RSVPs of upcoming events.
 * - The courtesy (promotional) QR keeps v1's content exactly, including its `ticketNumber`
 *   (position among the same event + tier, in the order the rows arrive).
 */
import type { QRCodeData } from "../types";
import type { UserTicket } from "../types/ticket";
import { getOrderDisplayCents } from "../pricing/calculations";
import { isValidIanaTimezone } from "./format";
import { dayKeyIn } from "./home-feed";

const FALLBACK_TZ = "America/Guayaquil";

export type WalletEventInfo = NonNullable<UserTicket["ticket_tier"]>["event"];

/** A ticket that opens a QR at the door. */
export function isDoorTicket(t: UserTicket): boolean {
  return (t.type === "ticket" || t.type === "promotional") && (t.status === "issued" || t.status === "checked_in");
}

const eventOf = (t: UserTicket) => t.ticket_tier?.event ?? null;
const ts = (s: string | undefined) => {
  const n = s ? Date.parse(s) : NaN;
  return Number.isFinite(n) ? n : 0;
};
/** Purchase order: oldest first (1, 2, 3…), ties by id so the order never jumps. */
const byPurchase = (a: UserTicket, b: UserTicket) => ts(a.created_at) - ts(b.created_at) || a.id.localeCompare(b.id);

export type WalletEvent = {
  event: WalletEventInfo;
  /** Door tickets of this event, in purchase order. */
  tickets: UserTicket[];
  /** Tier names in the order they first appear. */
  tiers: string[];
  checkedIn: number;
};

export type WalletRequestState = "pending" | "approved" | "rejected" | "cancelled" | "payment_failed";

export type WalletRequest = {
  rsvp: UserTicket;
  event: WalletEventInfo;
  quantity: number;
  state: WalletRequestState;
};

export type Wallet = {
  upcoming: WalletEvent[];
  requests: WalletRequest[];
  past: WalletEvent[];
  stats: { total: number; purchased: number; pending: number };
};

function requestState(status: UserTicket["status"]): WalletRequestState | null {
  switch (status) {
    case "pending":
      return "pending";
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "cancelled":
    case "auto_cancelled":
      return "cancelled";
    case "payment_failed":
      return "payment_failed";
    default:
      return null; // "purchased" → its tickets are the card
  }
}

const ended = (e: WalletEventInfo, now: Date) => !e.ends_at || Date.parse(e.ends_at) <= now.getTime();

export function buildWallet(rows: UserTicket[], now: Date = new Date()): Wallet {
  const byEvent = new Map<string, WalletEvent>();
  for (const t of rows) {
    const e = eventOf(t);
    if (!e || !isDoorTicket(t)) continue;
    let w = byEvent.get(e.id);
    if (!w) byEvent.set(e.id, (w = { event: e, tickets: [], tiers: [], checkedIn: 0 }));
    w.tickets.push(t);
  }
  for (const w of byEvent.values()) {
    w.tickets.sort(byPurchase);
    w.tiers = [...new Set(w.tickets.map((t) => t.ticket_tier?.name).filter((n): n is string => !!n))];
    w.checkedIn = w.tickets.filter((t) => t.status === "checked_in").length;
  }

  // Event + tier pairs that already have tickets: an approved RSVP there is superseded (v1 race rule).
  const issuedPairs = new Set(rows.filter(isDoorTicket).map((t) => `${eventOf(t)?.id}:${t.ticket_tier?.id}`));
  const requests: WalletRequest[] = [];
  for (const r of rows) {
    if (r.type !== "rsvp") continue;
    const e = eventOf(r);
    const state = requestState(r.status);
    if (!e || !state || ended(e, now)) continue;
    if (state === "approved" && issuedPairs.has(`${e.id}:${r.ticket_tier?.id}`)) continue;
    requests.push({ rsvp: r, event: e, quantity: r.requested_quantity ?? r.quantity ?? 1, state });
  }

  const all = [...byEvent.values()];
  const start = (w: { event: WalletEventInfo }) => ts(w.event.starts_at);
  const upcoming = all.filter((w) => !ended(w.event, now)).sort((a, b) => start(a) - start(b));
  const past = all.filter((w) => ended(w.event, now)).sort((a, b) => start(b) - start(a));
  requests.sort((a, b) => start(a) - start(b));

  const purchased = upcoming.reduce((n, w) => n + w.tickets.length, 0);
  const pending = requests.filter((r) => r.state === "pending" || r.state === "approved").reduce((n, r) => n + r.quantity, 0);
  return { upcoming, requests, past, stats: { total: purchased + pending, purchased, pending } };
}

/** Kicker of an upcoming card: running now, today, tomorrow, in N days (≤ 7) or a date. */
export type WalletWhen = { kind: "now" } | { kind: "today" } | { kind: "tomorrow" } | { kind: "days"; days: number } | { kind: "date" };

export function walletWhen(e: { starts_at: string; ends_at?: string; timezone?: string | null }, now: Date = new Date()): WalletWhen {
  const tz = e.timezone && isValidIanaTimezone(e.timezone) ? e.timezone : FALLBACK_TZ;
  if (Date.parse(e.starts_at) <= now.getTime()) return { kind: "now" };
  const days = Math.round((Date.parse(`${dayKeyIn(e.starts_at, tz)}T12:00:00Z`) - Date.parse(`${dayKeyIn(now, tz)}T12:00:00Z`)) / 86_400_000);
  if (days <= 0) return { kind: "today" };
  if (days === 1) return { kind: "tomorrow" };
  if (days <= 7) return { kind: "days", days };
  return { kind: "date" };
}

/**
 * Tickets of the ticket screen: every door ticket of that event, in purchase order (what you
 * swipe through), and where the opened one sits. A ticket that can't show a QR (refunded,
 * opened from an old link) still opens, alone at the front, as in v1. null = not yours / gone.
 */
export function eventTicketSlides(rows: UserTicket[], id: string): { slides: UserTicket[]; index: number } | null {
  const t = rows.find((x) => x.id === id);
  if (!t) return null;
  const e = eventOf(t);
  if (!e) return { slides: [t], index: 0 };
  const door = rows.filter((x) => eventOf(x)?.id === e.id && isDoorTicket(x)).sort(byPurchase);
  const slides = door.some((x) => x.id === id) ? door : [t, ...door];
  return { slides, index: Math.max(0, slides.findIndex((x) => x.id === id)) };
}

/** Price shown on a ticket, before translation (same rules as the v1 QR screen). */
export type TicketPrice = { kind: "complimentary" } | { kind: "free" } | { kind: "amount"; cents: number } | { kind: "none" };

export function ticketPrice(t: UserTicket): TicketPrice {
  if (t.type === "promotional") return { kind: "complimentary" };
  const o = t.order;
  if (o) {
    if (o.total_cents === 0) return { kind: "free" };
    const display = getOrderDisplayCents(o);
    if (display != null && display > 0 && o.quantity > 0) return { kind: "amount", cents: Math.round(display / o.quantity) };
    if (o.unit_price_cents != null && o.unit_price_cents > 0) return { kind: "amount", cents: o.unit_price_cents };
  }
  const p = t.ticket_tier?.price_cents;
  if (p === 0) return { kind: "free" };
  if (p != null && p > 0) return { kind: "amount", cents: p };
  return { kind: "none" };
}

/** Stage of a ticket ("Early bird"), if any. */
export function ticketStage(t: UserTicket): string | null {
  return (t.metadata?.stage_name as string | undefined) || t.stage_name || null;
}

/**
 * What the QR holds: purchased tickets already carry their QR image (`qr_code`); a courtesy
 * ticket's QR is built from its token exactly as v1 did. null = no valid QR (not a door ticket).
 */
export type TicketQr = { kind: "image"; uri: string } | { kind: "value"; value: string } | null;

export function ticketQr(t: UserTicket, rows: UserTicket[]): TicketQr {
  if (!isDoorTicket(t)) return null;
  if (t.type === "ticket") return t.qr_code ? { kind: "image", uri: t.qr_code } : null;
  if (!t.qr_token) return null;
  const e = eventOf(t);
  // v1 numbering: position among door tickets of the same event + tier, in the order received.
  const sameTier = rows.filter((x) => isDoorTicket(x) && eventOf(x)?.id === e?.id && x.ticket_tier?.id === t.ticket_tier?.id);
  const n = Math.max(0, sameTier.findIndex((x) => x.id === t.id)) + 1;
  const data: QRCodeData = {
    orderId: t.order?.id ?? "",
    eventId: e?.id ?? "",
    userId: t.attendee_email ?? "",
    tierName: t.ticket_tier?.name ?? "",
    eventName: e?.name ?? "",
    ticketNumber: n,
    qrToken: t.qr_token,
    timestamp: t.created_at ?? new Date().toISOString(),
  };
  return { kind: "value", value: JSON.stringify(data) };
}

/** Organizer name of a ticket's event. */
export function walletOrganizer(e: WalletEventInfo | null | undefined): string | null {
  if (!e) return null;
  if (e.organization?.name) return e.organization.name;
  const o = e.organizations;
  return (Array.isArray(o) ? o.find((x) => x.name)?.name : o?.name) ?? null;
}

/** Maps link for the venue (Directions). */
export function directionsUrl(e: { venue?: string | null; city?: string | null }): string | null {
  const q = [e.venue, e.city].filter(Boolean).join(", ");
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

/** "vie, 31 oct" and "22:00" of an event start, in the event's zone. */
export function walletDayTime(startsAt: string, timezone: string | null | undefined, locale: string): { day: string; time: string } {
  const timeZone = timezone && isValidIanaTimezone(timezone) ? timezone : FALLBACK_TZ;
  const d = new Date(startsAt);
  return {
    day: new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", timeZone }).format(d),
    time: new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone }).format(d),
  };
}

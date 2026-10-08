/**
 * Maps UserTicket data to dashboard and history card formats.
 * Ported from apps/mobile/lib/user-ticket-mappers.ts for web dashboard.
 */

import {
  formatCentsAsPrice,
  formatEventDate,
  buildTimeRange,
  isValidIanaTimezone,
  separateEventsByDate,
  getOrderDisplayCents,
} from "@project-flame/lib";
import type { UserTicket } from "@project-flame/lib";

export type TicketDisplayStatus =
  | "purchased"
  | "pending"
  | "cancelled";

export interface TicketGroupDisplay {
  id: string;
  eventId: string;
  tierId: string;
  tierName: string;
  stageName: string | null;
  eventName: string;
  eventImageUrl: string;
  date: string;
  timeRange: string;
  location: string;
  ticketQuantity: number;
  priceDisplay: string;
  totalCostCents: number;
  currency?: string;
  status: TicketDisplayStatus;
  tickets: UserTicket[];
}

function getEventInfo(ticket: UserTicket) {
  return ticket.ticket_tier?.event ?? null;
}

function getTierInfo(ticket: UserTicket) {
  return ticket.ticket_tier ?? null;
}

function getStageName(ticket: UserTicket): string | null {
  if (ticket.metadata?.stage_name) return ticket.metadata.stage_name as string;
  if (ticket.stage_name) return ticket.stage_name;
  return null;
}

function mapStatus(ticket: UserTicket): TicketDisplayStatus {
  if (ticket.type === "ticket" || ticket.type === "promotional") {
    if (ticket.status === "issued" || ticket.status === "checked_in") {
      return "purchased";
    }
    if (ticket.status === "refunded" || ticket.status === "void") {
      return "cancelled";
    }
  }
  if (ticket.type === "rsvp") {
    // Approved RSVPs are a transient state — once tickets are issued they're
    // filtered out by the API and the issued ticket rows show instead. Surface
    // as "pending" until that happens so the user never sees a dead-end CTA.
    if (ticket.status === "approved") return "pending";
    if (ticket.status === "pending") return "pending";
    // "purchased" means the RSVP was approved and a real ticket record was issued.
    // The RSVP entry itself is now superseded — treat it as inactive so we don't
    // surface a dead-end QR icon on the dashboard.
    if (ticket.status === "purchased") return "cancelled";
    if (
      ticket.status === "rejected" ||
      ticket.status === "cancelled" ||
      ticket.status === "auto_cancelled" ||
      ticket.status === "payment_failed"
    ) {
      return "cancelled";
    }
  }
  return "purchased";
}

function formatCostDisplay(
  totalCost: number | undefined,
  tierInfo: { price_cents: number } | null,
  totalQuantity: number,
  ticket: UserTicket,
  currency?: string,
  rsvpTotalCents?: number,
): string {
  const hasOrderData = ticket.order?.id !== undefined;
  if (ticket.type === "ticket") {
    if (!hasOrderData || totalCost === undefined || totalCost === null) {
      return "—";
    }
    return formatCentsAsPrice(totalCost, currency);
  }
  // Promotional tickets are organizer-issued at no charge; surface the word
  // "Complimentary" so users immediately understand they didn't pay rather
  // than seeing a misleading "$0.00" alongside the tier name.
  if (ticket.type === "promotional") {
    return "Complimentary";
  }
  // For RSVPs, prefer the server-stored user-facing total (incl. fees) captured
  // at request time. Falls back to base × qty only when the RSVP predates the
  // total_amount_cents column.
  if (ticket.type === "rsvp" && rsvpTotalCents != null && rsvpTotalCents > 0) {
    return formatCentsAsPrice(rsvpTotalCents, currency);
  }
  const pricePerUnit = ticket.stage_price_cents ?? tierInfo?.price_cents ?? 0;
  return formatCentsAsPrice(
    totalCost ?? pricePerUnit * totalQuantity,
    currency,
  );
}

function formatDate(dateString: string, timezone?: string): string {
  if (!timezone || !isValidIanaTimezone(timezone)) {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  return formatEventDate(dateString, timezone);
}

function groupTicketsByEventAndTier(
  tickets: UserTicket[],
): TicketGroupDisplay[] {
  const groups: Record<string, UserTicket[]> = {};

  tickets.forEach((ticket) => {
    const eventInfo = getEventInfo(ticket);
    const tierInfo = getTierInfo(ticket);
    if (eventInfo && tierInfo) {
      // Pending RSVPs are pre-fulfillment requests — each is a distinct in-flight
      // transaction that must surface as its own card, even when the user has
      // existing issued tickets for the same event+tier (e.g. previously bought
      // 2 GA tickets, just requested 3 more). Without this split, the in-group
      // dedup below (`filter t.type !== "rsvp"`) would silently hide the new
      // pending RSVP because it co-grouped with the old purchase.
      // Approved RSVPs intentionally still group by event+tier so the existing
      // post-approval-race dedup keeps working when the issued tickets arrive.
      const isPendingRsvp =
        ticket.type === "rsvp" && ticket.status === "pending";
      const key = isPendingRsvp
        ? `${eventInfo.id}-${tierInfo.id}-rsvp-${ticket.id}`
        : `${eventInfo.id}-${tierInfo.id}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(ticket);
    }
  });

  return Object.entries(groups).map(([key, group]) => {
    const eventInfo = getEventInfo(group[0])!;
    const tierInfo = getTierInfo(group[0])!;
    const hasIssuedTickets = group.some(
      (t) =>
        (t.type === "ticket" || t.type === "promotional") &&
        (t.status === "issued" || t.status === "checked_in"),
    );
    // When tickets exist for an approved RSVP, the RSVP row is superseded and
    // the API may briefly return both. Count tickets only in that case to
    // avoid double-counting (RSVP requested_quantity + per-ticket rows).
    const countableTickets = hasIssuedTickets
      ? group.filter((t) => t.type !== "rsvp")
      : group;
    const totalQuantity = countableTickets.reduce((sum, t) => {
      if (t.type === "rsvp") {
        return sum + (t.requested_quantity ?? t.quantity ?? 1);
      }
      return sum + 1;
    }, 0);
    const orderMap = new Map<string, number>();
    group.forEach((t) => {
      if (t.order?.id && t.order.total_cents !== undefined) {
        // Bank-transfer orders display the base price (no platform fee).
        // Stripe orders display total_cents (what the user actually paid).
        const displayCents = getOrderDisplayCents(t.order) ?? t.order.total_cents;
        orderMap.set(t.order.id, displayCents);
      }
    });
    const totalCost = Array.from(orderMap.values()).reduce((a, b) => a + b, 0);
    // Sum the user-facing totals across pending/approved RSVP rows. Used as a
    // pre-order price source so the My Tickets card shows the price the user
    // actually saw at request time (incl. service fee), not just the base.
    const rsvpTotalCents = countableTickets.reduce((sum, t) => {
      if (t.type === "rsvp" && t.total_amount_cents != null) {
        return sum + t.total_amount_cents;
      }
      return sum;
    }, 0);
    const eventCurrency = eventInfo.currency;
    const priceDisplay = formatCostDisplay(
      orderMap.size > 0 ? totalCost : undefined,
      tierInfo,
      totalQuantity,
      group[0],
      eventCurrency,
      rsvpTotalCents,
    );
    // Prefer a valid issued/checked-in ticket over a superseded RSVP when determining status.
    const representative =
      group.find(
        (r) =>
          (r.type === "ticket" || r.type === "promotional") &&
          (r.status === "issued" || r.status === "checked_in"),
      ) ??
      group.find(
        (r) =>
          r.status !== "cancelled" &&
          r.status !== "auto_cancelled" &&
          r.status !== "rejected" &&
          r.status !== "payment_failed",
      ) ??
      group[0];
    const status = mapStatus(representative);
    const tz: string | undefined =
      eventInfo.timezone && isValidIanaTimezone(eventInfo.timezone)
        ? eventInfo.timezone
        : undefined;

    const startsAt = eventInfo.starts_at;
    const endsAt = eventInfo.ends_at;
    const timeRange = startsAt
      ? buildTimeRange(startsAt, endsAt, tz, eventInfo.city)
      : "";

    const stageNames = group
      .map((t) => getStageName(t))
      .filter((s): s is string => s != null);
    const uniqueStages = [...new Set(stageNames)];
    const stageName =
      uniqueStages.length === 0
        ? null
        : uniqueStages.length === 1
          ? uniqueStages[0]
          : "Mixed";

    return {
      id: key,
      eventId: eventInfo.id,
      tierId: tierInfo.id,
      tierName: tierInfo.name ?? "Ticket",
      stageName,
      eventName: eventInfo.name,
      eventImageUrl: eventInfo.image_url || "",
      date: startsAt ? formatDate(startsAt, tz) : "",
      timeRange,
      location: eventInfo.venue || "",
      ticketQuantity: totalQuantity,
      priceDisplay,
      totalCostCents: totalCost,
      currency: eventCurrency,
      status,
      tickets: group,
    };
  });
}

export interface SeparatedTicketGroups {
  currentGroups: TicketGroupDisplay[];
  pastGroups: TicketGroupDisplay[];
}

// Sort by the most recent ticket purchase date in each group, newest first.
// Falls back to `requested_at` for RSVP-only groups (no `tickets[].created_at`
// because the RSVP record is the only row), then to 0 if neither exists.
function getGroupPurchaseTime(group: TicketGroupDisplay): number {
  let latest = 0;
  for (const t of group.tickets) {
    const ts = t.created_at ?? t.requested_at;
    if (!ts) continue;
    const ms = new Date(ts).getTime();
    if (Number.isFinite(ms) && ms > latest) latest = ms;
  }
  return latest;
}

export function separateTicketGroupsByDate(
  tickets: UserTicket[],
): SeparatedTicketGroups {
  const groups = groupTicketsByEventAndTier(tickets);
  const withDates = groups.map((g) => ({
    ...g,
    starts_at: g.tickets[0]?.ticket_tier?.event?.starts_at ?? "",
    ends_at: g.tickets[0]?.ticket_tier?.event?.ends_at ?? "",
  }));
  const { currentEvents, pastEvents } = separateEventsByDate(
    withDates,
    new Date(),
  );
  // Sort each list by purchase date (most recent ticket in the group), newest
  // first. The API returns tickets sorted by `created_at` DESC, but after
  // grouping `Object.entries` ordering depends on insertion order which isn't
  // guaranteed to map cleanly to the user's mental model. Sort explicitly so
  // both platforms surface the most recently purchased event-group at the top.
  // See MAY_2026_FIXES.md.
  const sortByPurchaseDateDesc = (
    a: TicketGroupDisplay,
    b: TicketGroupDisplay,
  ) => getGroupPurchaseTime(b) - getGroupPurchaseTime(a);
  return {
    currentGroups: currentEvents
      .map(({ starts_at, ends_at, ...rest }) => rest)
      .sort(sortByPurchaseDateDesc),
    pastGroups: pastEvents
      .map(({ starts_at, ends_at, ...rest }) => rest)
      .sort(sortByPurchaseDateDesc),
  };
}

export function getFirstTicketIdForGroup(
  group: TicketGroupDisplay,
): string | null {
  const issued = group.tickets.find(
    (t) =>
      (t.type === "ticket" || t.type === "promotional") &&
      (t.status === "issued" || t.status === "checked_in"),
  );
  return issued?.id ?? group.tickets[0]?.id ?? null;
}

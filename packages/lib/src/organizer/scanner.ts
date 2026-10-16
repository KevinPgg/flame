/**
 * Door scanner (v2): reading a ticket QR, telling the person at the door what to do, and the
 * list of events they can scan. Pure logic — the camera lives in the web/app screens.
 */

export interface TicketQrData {
  orderId?: string;
  eventId: string;
  userId?: string;
  tierName?: string;
  eventName?: string;
  ticketNumber?: number;
  timestamp?: string;
  /** Promotional (sent) tickets carry only a token. */
  qrToken?: string;
}

/**
 * Ticket QRs are JSON. Regular tickets: orderId + eventId + ticketNumber. Promotional tickets:
 * eventId + qrToken. Anything else (a URL, a random QR) is ignored — null.
 */
export function parseTicketQr(text: string): TicketQrData | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.eventId !== "string" || !d.eventId) return null;
  if (!d.orderId) {
    return typeof d.qrToken === "string" && d.qrToken ? (d as unknown as TicketQrData) : null;
  }
  const n = Number(d.ticketNumber);
  if (typeof d.orderId !== "string" || !Number.isInteger(n) || n < 1) return null;
  return { ...(d as unknown as TicketQrData), ticketNumber: n };
}

export type ScanResultKind = "valid" | "already" | "wrong_event" | "invalid" | "error";

export interface VerifiedTicket {
  id: string;
  attendee_name: string | null;
  status: string;
  checked_in_at: string | null;
  ticket_tier?: { name: string } | null;
  order?: { quantity: number } | null;
  sequence_number?: number;
}

/** What the screen shows after verifying: green (let in), amber (already in), red (no). */
export function scanResultKind(ticket: VerifiedTicket): ScanResultKind {
  if (ticket.checked_in_at || ticket.status === "checked_in") return "already";
  if (ticket.status === "void" || ticket.status === "refunded") return "invalid";
  return "valid";
}

/**
 * Verify / check-in API error → result. 404 = no such ticket, 400 = void / refunded / other
 * event (the screen checks the event itself before calling), 409 = already checked in;
 * 401/403/5xx are problems with the scanner, not the ticket.
 */
export function scanErrorKind(status: number): ScanResultKind {
  if (status === 404 || status === 400) return "invalid";
  if (status === 409) return "already";
  return "error";
}

export interface ScannerEvent {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
}

/**
 * Events offered in the scanner: on now or upcoming (soonest first). Events that ended more
 * than `graceHours` ago are left out — nobody scans last month's party.
 */
export function scannerEventList<T extends ScannerEvent>(events: T[], now: Date = new Date(), graceHours = 12): T[] {
  const cutoff = now.getTime() - graceHours * 3_600_000;
  return events
    .filter((e) => new Date(e.ends_at).getTime() >= cutoff)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
}

/** On right now (between start − 3 h and end): the scanner opens it straight away when it's the only one. */
export function isHappeningNow(e: ScannerEvent, now: Date = new Date()): boolean {
  const t = now.getTime();
  return t >= new Date(e.starts_at).getTime() - 3 * 3_600_000 && t <= new Date(e.ends_at).getTime();
}

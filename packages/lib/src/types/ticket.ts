/**
 * Ticket Types
 *
 * Shared ticket and user profile type definitions used by both web and mobile.
 * Single source of truth — extracted from apps/web/app/lib/hooks/useUserTickets.ts
 * and apps/mobile/hooks/useUserTickets.ts (Feb 2026).
 */

export type RSVPStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "purchased"
  | "cancelled"
  | "auto_cancelled"
  | "payment_failed";

export type TicketStatus = "issued" | "void" | "checked_in" | "refunded";

export interface UserTicket {
  id: string;
  type: "ticket" | "rsvp" | "promotional";
  attendee_name?: string;
  attendee_email?: string;
  qr_code?: string;
  qr_token?: string;
  checked_in_at?: string;
  metadata?: {
    stage_id?: string;
    stage_name?: string;
    stage_price_cents?: number;
  };
  quantity?: number;
  requested_quantity?: number;
  requested_at?: string;
  approved_at?: string;
  stage_id?: string;
  stage_name?: string;
  stage_price_cents?: number;
  // RSVP-only — populated for type === "rsvp" rows. Stored at request time so
  // the My Tickets card can show the user-facing total (incl. fees) before an
  // order exists. Once approved + ticket issued, the ticket row's order.total_cents
  // takes over and these fields are unused.
  base_price_cents?: number;
  total_amount_cents?: number;
  discount_amount_cents?: number;
  status: RSVPStatus | TicketStatus;
  created_at: string;
  ticket_tier?: {
    id: string;
    name: string;
    price_cents: number;
    event: {
      id: string;
      name: string;
      slug: string;
      description: string;
      image_url: string;
      starts_at: string;
      ends_at: string;
      venue: string;
      city?: string;
      timezone?: string;
      currency?: string;
      organization?: { name: string };
      organizations?: { name: string } | { name: string }[];
    };
  };
  order?: {
    id: string | null; // null for promotional tickets (no order record)
    quantity: number;
    total_cents: number;
    subtotal_cents?: number;
    discount_amount_cents?: number;
    unit_price_cents?: number;
    payment_provider?: string;
    created_at: string;
  };
}

export interface UserTicketsResponse {
  tickets: UserTicket[];
}

/**
 * User profile returned by GET /api/user/profile.
 * Billing and document fields are returned by the API but are optional
 * (populated only after the user completes their profile).
 */
export interface UserProfile {
  id: string;
  email: string;
  clerk_id: string;
  first_name: string | null;
  last_name: string | null;
  document_id?: string | null;
  document_type?: string | null;
  billing_address?: string | null;
  billing_city?: string | null;
  billing_country?: string | null;
  profile_image_url?: string | null;
}

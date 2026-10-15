import type { SupabaseClient } from "@supabase/supabase-js";
import { selectAllPagesByIds } from "./supabase-pagination";

export type RsvpCounts = { pending: number; approved: number; rejected: number; purchased: number };

export interface RsvpRow {
  event_id: string;
  status: string | null;
  ticket_tier_id: string | null;
  requested_quantity: number | null;
}

export const emptyRsvpCounts = (): RsvpCounts => ({ pending: 0, approved: 0, rejected: 0, purchased: 0 });

/** Every RSVP of these events (status + tier + quantity), paged past the 1000-row cap. Throws on error. */
export function fetchRsvpRowsForEvents(db: SupabaseClient, eventIds: string[]): Promise<RsvpRow[]> {
  return selectAllPagesByIds<RsvpRow>(eventIds, (ids, from, to) =>
    db
      .from("rsvps")
      .select("id, event_id, status, ticket_tier_id, requested_quantity")
      .in("event_id", ids)
      .order("id", { ascending: true })
      .range(from, to)
  );
}

/**
 * RSVP counts per event (organizer dashboard / RSVP badges) and requested quantities of pending
 * + approved RSVPs per tier (the "reserved" part of a tier's remaining capacity, same definition
 * as the get_event_with_tiers RPC).
 */
export function summarizeRsvps(rows: RsvpRow[]): {
  countsByEvent: Map<string, RsvpCounts>;
  reservedByTier: Record<string, number>;
} {
  const countsByEvent = new Map<string, RsvpCounts>();
  const reservedByTier: Record<string, number> = {};
  for (const row of rows) {
    let counts = countsByEvent.get(row.event_id);
    if (!counts) countsByEvent.set(row.event_id, (counts = emptyRsvpCounts()));
    if (row.status === "pending") counts.pending++;
    else if (row.status === "approved") counts.approved++;
    else if (row.status === "rejected") counts.rejected++;
    else if (row.status === "purchased") counts.purchased++;
    if (row.ticket_tier_id && (row.status === "pending" || row.status === "approved")) {
      reservedByTier[row.ticket_tier_id] = (reservedByTier[row.ticket_tier_id] || 0) + (row.requested_quantity || 0);
    }
  }
  return { countsByEvent, reservedByTier };
}

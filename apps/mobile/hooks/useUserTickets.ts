/**
 * Fetches the current user's tickets (purchased, promotional, and RSVPs).
 *
 * Queries Supabase directly using a Clerk-issued "supabase" JWT.
 * RLS policies automatically scope results to the authenticated user.
 *
 * Web source-of-truth: apps/web/app/api/user/tickets/route.ts
 */

import { useQuery } from "@tanstack/react-query";
import type { UserTicket, UserTicketsResponse } from "@project-flame/lib";
import { getAuthenticatedClient } from "../lib/supabase-auth";
import { useOptionalAuth } from "./useOptionalAuth";

export type { UserTicket, UserTicketsResponse };

export interface UseUserTicketsOptions {
  enabled?: boolean;
}

// Supabase returns single FK relations as objects (or arrays depending on config).
// These helpers safely unwrap either shape into a single object.
function unwrapSingle<T>(val: T | T[] | null | undefined): T | null {
  if (Array.isArray(val)) return val[0] ?? null;
  return val ?? null;
}

// ---------------------------------------------------------------------------
// Supabase row types — match the SELECT strings below exactly.
// ---------------------------------------------------------------------------

interface EventRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  image_url: string;
  starts_at: string;
  ends_at: string;
  venue: string;
  city: string | null;
  timezone?: string;
  currency?: string;
  organizations?: { name: string } | { name: string }[] | null;
}

interface TicketTierRow {
  id: string;
  name: string;
  price_cents: number;
  /** TICKET_SELECT aliases the join as "event" (singular) */
  event?: EventRow | EventRow[] | null;
  /** RSVP_SELECT and PROMO_SELECT use the unaliased "events" (plural) */
  events?: EventRow | EventRow[] | null;
}

interface OrderRow {
  id: string;
  quantity: number;
  total_cents: number;
  subtotal_cents: number;
  discount_amount_cents: number;
  unit_price_cents: number;
  payment_provider: string;
  created_at: string;
}

interface TicketRow {
  id: string;
  attendee_name: string | null;
  attendee_email: string | null;
  status: string;
  qr_code: string | null;
  qr_token: string | null;
  checked_in_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
  ticket_tier: TicketTierRow | TicketTierRow[] | null;
  order: OrderRow | OrderRow[] | null;
}

interface PromoRow {
  id: string;
  customer_name: string | null;
  email: string | null;
  status: string;
  qr_token: string | null;
  checked_in_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
  ticket_tiers: TicketTierRow | TicketTierRow[] | null;
}

interface RsvpRow {
  id: string;
  requested_quantity: number;
  status: string;
  requested_at: string;
  created_at: string;
  approved_at: string | null;
  stage_id: string | null;
  stage_name: string | null;
  stage_price_cents: number | null;
  base_price_cents: number | null;
  total_amount_cents: number | null;
  discount_amount_cents: number | null;
  ticket_tiers: TicketTierRow | TicketTierRow[] | null;
}

interface StageRow {
  id: string;
  name: string;
  price_cents: number;
  ticket_tier_id: string;
}

interface OrderDedupeRow {
  idempotency_key: string | null;
}

// ---------------------------------------------------------------------------

const TICKET_SELECT = `
  id, attendee_name, attendee_email, status, qr_code, qr_token,
  checked_in_at, created_at, metadata,
  ticket_tier:ticket_tiers(
    id, name, price_cents,
    event:events(
      id, name, slug, description, image_url, starts_at, ends_at, venue, city, timezone, currency,
      organizations(name)
    )
  ),
  order:orders(
    id, quantity, total_cents, subtotal_cents, discount_amount_cents,
    unit_price_cents, payment_provider, created_at
  )
`;

const RSVP_SELECT = `
  id, requested_quantity, status, requested_at, created_at, approved_at,
  stage_id, stage_name, stage_price_cents,
  base_price_cents, total_amount_cents, discount_amount_cents,
  ticket_tiers(
    id, name, price_cents,
    events(
      id, name, slug, description, image_url, starts_at, ends_at, venue, city, timezone, currency,
      organizations(name)
    )
  )
`;

const PROMO_SELECT = `
  id, customer_name, email, status, qr_token,
  checked_in_at, created_at, metadata,
  ticket_tiers(
    id, name, price_cents,
    events(
      id, name, slug, description, image_url, starts_at, ends_at, venue, city, timezone, currency,
      organizations(name)
    )
  )
`;

export function useUserTickets(options?: UseUserTicketsOptions) {
  const { getToken, isSignedIn, isConfigured, userId } = useOptionalAuth();

  return useQuery<UserTicketsResponse>({
    queryKey: ["user-tickets", userId],
    queryFn: async () => {
      try {
      const client = await getAuthenticatedClient(getToken);

      // Resolve the user's internal DB id from their Clerk id.
      // Needed to scope tickets to the user's OWN orders — the tickets
      // table has an org-member RLS policy that would otherwise include
      // ALL tickets for orgs the user belongs to (not just their purchases).
      const { data: currentUser, error: userError } = await client
        .from("users")
        .select("id, email")
        .eq("clerk_id", userId!)
        .maybeSingle();

      if (userError) throw userError;
      if (!currentUser) return { tickets: [] };

      const { data: userOrderRows, error: ordersError } = await client
        .from("orders")
        .select("id")
        .eq("user_id", currentUser.id);

      if (ordersError) throw ordersError;

      const userOrderIds = (userOrderRows ?? []).map(o => o.id as string);

      // --- 1. Fetch purchased tickets scoped to the user's own orders ---
      let rawTickets: TicketRow[] = [];
      if (userOrderIds.length > 0) {
        const { data, error: ticketsError } = await client
          .from("tickets")
          .select(TICKET_SELECT)
          .in("status", ["issued", "checked_in"])
          .in("order_id", userOrderIds)
          .order("created_at", { ascending: false });

        if (ticketsError) throw ticketsError;
        rawTickets = (data ?? []) as TicketRow[];
      }

      // --- 2. Fetch RSVPs scoped to the user's own records ---
      // The rsvps table has an org-member RLS policy that returns ALL RSVPs
      // for events in the user's organizations. We must explicitly filter by
      // user_id to show only the user's personal RSVPs on the attendee dashboard.
      const { data: rawRsvps, error: rsvpsError } = await client
        .from("rsvps")
        .select(RSVP_SELECT)
        .eq("user_id", currentUser.id)
        .neq("status", "purchased")
        .order("requested_at", { ascending: false });

      if (rsvpsError) throw rsvpsError;

      // --- 3. Fetch promotional tickets scoped to user's email ---
      // The promotional_tickets table has an org-owner RLS policy that returns
      // ALL promo tickets for events in the user's owned orgs. We explicitly
      // filter by email to show only the user's personal promotional tickets.
      let rawPromo: PromoRow[] = [];
      const userEmail = (currentUser as { id: string; email: string | null }).email;
      try {
        let promoQuery = client
          .from("promotional_tickets")
          .select(PROMO_SELECT)
          .in("status", ["issued", "checked_in"])
          .order("created_at", { ascending: false });

        if (userEmail) {
          promoQuery = promoQuery.ilike("email", userEmail);
        }

        const { data, error } = await promoQuery;

        if (error) {
          console.error("[useUserTickets] fetch promotional_tickets failed", {
            action: "fetch_promotional_tickets",
            userId,
            error,
          });
          rawPromo = [];
        } else {
          rawPromo = (data ?? []) as PromoRow[];
        }
      } catch (e) {
        console.error("[useUserTickets] fetch promotional_tickets threw", {
          action: "fetch_promotional_tickets",
          userId,
          error: e instanceof Error ? e.stack : e,
        });
        rawPromo = [];
      }

      // --- 4. Stage enrichment for tickets missing metadata ---
      const ticketsToEnrich = rawTickets.map((t) => ({
        ticket: t,
        order: unwrapSingle<OrderRow>(t.order),
        ticketTier: unwrapSingle<TicketTierRow>(t.ticket_tier),
      }));

      const missingMetadataKeys = new Set<string>();
      ticketsToEnrich.forEach(({ ticket, order, ticketTier }) => {
        if (
          (!ticket.metadata || !ticket.metadata.stage_name) &&
          ticketTier?.id &&
          order?.unit_price_cents != null
        ) {
          missingMetadataKeys.add(`${ticketTier.id}:${order.unit_price_cents}`);
        }
      });

      const stagesMap = new Map<string, { id: string; name: string; price_cents: number }>();
      if (missingMetadataKeys.size > 0) {
        const tierIds = [...new Set([...missingMetadataKeys].map((k) => k.split(":")[0]))];
        const { data: stages, error: stagesError } = await client
          .from("ticket_stages")
          .select("id, name, price_cents, ticket_tier_id")
          .in("ticket_tier_id", tierIds);

        if (stagesError) {
          console.error("[useUserTickets] ticket_stages enrichment query failed", {
            action: "ticket_stages",
            userId,
            tierIds,
            error: stagesError,
          });
        } else {
          (stages as StageRow[] | null)?.forEach((s) => {
            const key = `${s.ticket_tier_id}:${s.price_cents}`;
            if (missingMetadataKeys.has(key)) {
              stagesMap.set(key, { id: s.id, name: s.name, price_cents: s.price_cents });
            }
          });
        }
      }

      const enrichedTickets: UserTicket[] = ticketsToEnrich.map(
        ({ ticket, order, ticketTier }) => {
          let metadata = ticket.metadata;
          if (
            (!metadata || !metadata.stage_name) &&
            ticketTier?.id &&
            order?.unit_price_cents != null
          ) {
            const stage = stagesMap.get(`${ticketTier.id}:${order.unit_price_cents}`);
            if (stage) {
              metadata = {
                ...(metadata ?? {}),
                stage_id: stage.id,
                stage_name: stage.name,
                stage_price_cents: stage.price_cents,
              };
            }
          }
          const event = unwrapSingle<EventRow>(ticketTier?.event);
          return {
            ...ticket,
            attendee_name: ticket.attendee_name ?? undefined,
            attendee_email: ticket.attendee_email ?? undefined,
            qr_code: ticket.qr_code ?? undefined,
            qr_token: ticket.qr_token ?? undefined,
            checked_in_at: ticket.checked_in_at ?? undefined,
            status: ticket.status as UserTicket["status"],
            metadata: (metadata ?? undefined) as UserTicket["metadata"],
            order: order ?? undefined,
            ticket_tier: (ticketTier && event
              ? {
                  ...ticketTier,
                  event: {
                    ...event,
                    organization: unwrapSingle(event.organizations) ?? undefined,
                    organizations: event.organizations ?? undefined,
                  },
                }
              : undefined) as UserTicket["ticket_tier"],
            type: "ticket" as const,
          };
        }
      );

      // --- 5. Format promotional tickets ---
      const formattedPromo: UserTicket[] = rawPromo.map((p) => {
        const tier = unwrapSingle<TicketTierRow>(p.ticket_tiers);
        const event = unwrapSingle<EventRow>(tier?.events);
        const org = unwrapSingle(event?.organizations ?? null) ?? undefined;
        return {
          id: p.id,
          attendee_name: p.customer_name ?? undefined,
          attendee_email: p.email ?? undefined,
          status: p.status as UserTicket["status"],
          qr_token: p.qr_token ?? undefined,
          checked_in_at: p.checked_in_at ?? undefined,
          created_at: p.created_at,
          metadata: p.metadata as UserTicket["metadata"],
          ticket_tier: tier && event
            ? {
                id: tier.id,
                name: tier.name,
                price_cents: tier.price_cents,
                event: {
                  ...event,
                  organization: org,
                  organizations: event.organizations ?? undefined,
                },
              }
            : undefined,
          order: {
            id: null,
            quantity: 1,
            total_cents: (p.metadata?.stage_price_cents as number) || 0,
            subtotal_cents: (p.metadata?.stage_price_cents as number) || 0,
            discount_amount_cents: 0,
            unit_price_cents: (p.metadata?.stage_price_cents as number) || 0,
            created_at: p.created_at,
          },
          type: "promotional" as const,
        };
      });

      // --- 6. Format RSVPs ---
      // Build from scratch (like formattedPromo) to avoid leaking raw Supabase
      // relation data (ticket_tiers) into UserTicket.
      const formattedRsvps: UserTicket[] = ((rawRsvps ?? []) as RsvpRow[]).map((r) => {
        const tier = unwrapSingle<TicketTierRow>(r.ticket_tiers);
        const event = unwrapSingle<EventRow>(tier?.events);
        const org = unwrapSingle(event?.organizations ?? null) ?? undefined;
        return {
          id: r.id,
          type: "rsvp" as const,
          quantity: r.requested_quantity,
          requested_quantity: r.requested_quantity,
          requested_at: r.requested_at,
          status: r.status as UserTicket["status"],
          created_at: r.created_at || r.requested_at,
          approved_at: r.approved_at ?? undefined,
          stage_id: r.stage_id ?? undefined,
          stage_name: r.stage_name ?? undefined,
          stage_price_cents: r.stage_price_cents ?? undefined,
          base_price_cents: r.base_price_cents ?? undefined,
          total_amount_cents: r.total_amount_cents ?? undefined,
          discount_amount_cents: r.discount_amount_cents ?? undefined,
          ticket_tier: tier && event
            ? {
                id: tier.id,
                name: tier.name,
                price_cents: tier.price_cents,
                event: {
                  ...event,
                  organization: org,
                  organizations: event.organizations ?? undefined,
                },
              }
            : undefined,
        };
      });

      // --- 7. Dedup: remove approved RSVPs that already have tickets ---
      // The web route uses supabaseAdmin (bypasses RLS). Mobile queries orders
      // via the authenticated client — RLS applies. The baseline policy
      // "Users can view their own orders" uses auth.jwt() ->> 'sub' via
      // users.clerk_id (Clerk-compatible), so this query returns the user's
      // orders. If RLS failed, existingOrderKeys would stay empty and
      // approved RSVPs would not be filtered, producing duplicates.
      const approvedRsvpIds = formattedRsvps
        .filter((r) => r.status === "approved")
        .map((r) => r.id);

      const existingOrderKeys = new Set<string>();
      if (approvedRsvpIds.length > 0) {
        const idempotencyKeys = approvedRsvpIds.map((id) => `free_${id}`);
        const { data: existingOrders, error: dedupeError } = await client
          .from("orders")
          .select("idempotency_key")
          .in("idempotency_key", idempotencyKeys);

        // A failed dedup query must be surfaced — silently treating existingOrders
        // as empty would pass all approved RSVPs through, producing duplicate
        // ticket entries alongside their fulfilled ticket records.
        if (dedupeError) throw dedupeError;

        (existingOrders as OrderDedupeRow[] | null)?.forEach((o) => {
          if (o.idempotency_key) existingOrderKeys.add(o.idempotency_key);
        });
      }

      const filteredRsvps = formattedRsvps.filter((r) => {
        if (r.status === "approved" && existingOrderKeys.has(`free_${r.id}`)) {
          return false;
        }
        return true;
      });

      return {
        tickets: [...enrichedTickets, ...formattedPromo, ...filteredRsvps],
      };
      } catch (err) {
        console.error("[useUserTickets]", {
          action: "queryFn_failed",
          userId,
          error: err instanceof Error ? err.stack : err,
        });
        throw err;
      }
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    retry: false,
    enabled:
      (options?.enabled ?? true) && Boolean(isSignedIn && isConfigured && userId),
  });
}

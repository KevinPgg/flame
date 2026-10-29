import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase/server";
import {
  fetchEventPurchasesForEvents,
  type Purchase,
} from "../../../lib/utils/purchase-data";
import {
  emptyRsvpCounts,
  fetchRsvpRowsForEvents,
  summarizeRsvps,
  type RsvpCounts,
} from "../../../lib/utils/rsvp-stats";
import { selectAllPagesByIds } from "../../../lib/utils/supabase-pagination";
import { extractBasePriceHistorical } from "@project-flame/lib";
import {
  selectOrganization,
  type Organization,
} from "../../../lib/utils/organization-selection";
import { transformBankTransferOrders } from "../../../lib/utils/bank-transfer-data";
import { visibleEventIds } from "../../../lib/utils/event-access";
import { retrySupabaseOperation } from "../../../lib/utils/supabase-retry";

/**
 * Adds RSVP counts, purchases, revenue, attendees, per-tier reservations and promoter link stats
 * to one event. Everything is fetched beforehand for ALL events at once (fixed number of queries,
 * paged past PostgREST's 1000-row cap) — before 2026-10-15 this ran 2–4 queries per event.
 */
function enrichEventWithStats(
  event: any,
  prefetched: {
    purchases: Purchase[];
    rsvpCounts: RsvpCounts;
    /** Orders grouped by "event_id:promoter_code". */
    ordersByEventAndPromoter?: Record<string, any[]>;
    reservedByTier?: Record<string, number>;
  }
) {
  const { purchases, rsvpCounts } = prefetched;
  const ordersByEventAndPromoter = prefetched.ordersByEventAndPromoter ?? {};
  const reservedByTier = prefetched.reservedByTier ?? {};
  const pending_rsvps = rsvpCounts.pending;
  const approved_rsvps = rsvpCounts.approved;
  const rejected_rsvps = rsvpCounts.rejected;
  const purchased_rsvps = rsvpCounts.purchased;

  // Attach quantity_reserved per tier (active holds + pending/approved RSVPs)
  // for the organizer UI pending hint. Matches the get_event_with_tiers RPC
  // semantics so organizer dashboard, public event page, and mobile agree on
  // "true remaining". Safe default (0) when batch lookup was skipped.
  const ticketTiersWithReserved = (event.ticket_tiers || []).map(
    (tier: any) => ({
      ...tier,
      quantity_reserved: reservedByTier[tier.id] || 0,
    })
  );

  // Calculate revenue from base price only (what organizer receives, excluding service fee and IVA)
  const totalRevenue = purchases.reduce(
    (sum, purchase) => sum + purchase.basePrice,
    0
  );
  // Calculate total attendees from quantity_sold in ticket tiers (includes all payment methods including bank transfers)
  // This matches the calculation used in Events & Ticket Tiers Management view and the server-side rendered page
  const totalAttendees = (event.ticket_tiers || []).reduce(
    (sum: number, tier: any) => sum + (tier.quantity_sold || 0),
    0
  );

  // Calculate promoter link stats with sales data
  const promoterLinksWithStats = ((event as any).promoter_links || []).map(
    (link: any) => {
      const key = `${event.id}:${link.promoter_code}`;
      const orders = ordersByEventAndPromoter[key] || [];

      // If no orders, return zeros
      if (orders.length === 0) {
        return {
          ...link,
          total_tickets_sold: 0,
          total_revenue_cents: 0,
        };
      }

      const totalTickets = orders.reduce(
        (sum: number, order: any) => sum + (order.quantity || 0),
        0
      );

      const totalRevenue = orders.reduce((sum: number, order: any) => {
        // Calculate the base price the organizer receives
        // PRIORITY: Use stored base_price_cents if available (Stripe Guaranteed Net model)
        // This field already contains the final discounted base price
        const totalCents = order.total_amount_cents || 0;
        const discountCents = order.discount_amount_cents || 0;
        
        let actualBasePrice: number;
        
        if (order.base_price_cents !== null && order.base_price_cents !== undefined) {
          // Stripe Guaranteed Net model: base_price_cents is the final discounted base price
          actualBasePrice = order.base_price_cents;
        } else {
          // Legacy Datafast model: extract base price from total
          const subtotalBeforeDiscount = totalCents + discountCents;
          const priceBreakdown = extractBasePriceHistorical(
            subtotalBeforeDiscount,
            order.created_at,
            order.fee_percentage
          );
          
          actualBasePrice = priceBreakdown.basePriceCents;
          if (discountCents > 0 && subtotalBeforeDiscount > 0) {
            const discountProportion = discountCents / subtotalBeforeDiscount;
            actualBasePrice = Math.round(
              priceBreakdown.basePriceCents * (1 - discountProportion)
            );
          }
        }

        return sum + actualBasePrice;
      }, 0);

      return {
        ...link,
        total_tickets_sold: totalTickets,
        total_revenue_cents: totalRevenue,
      };
    }
  );

  return {
    ...event,
    ticket_tiers: ticketTiersWithReserved,
    pending_rsvps,
    approved_rsvps,
    rejected_rsvps,
    purchased_rsvps,
    purchases,
    totalRevenue,
    totalAttendees,
    promoter_links: promoterLinksWithStats,
    // Explicitly preserve bank_transfer_orders if it exists
    bank_transfer_orders: (event as any).bank_transfer_orders || [],
  };
}

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 }
      );
    }

    // Get selected organization from query params
    const searchParams = req.nextUrl.searchParams;
    const selectedOrgSlug = searchParams.get("org");

    // Use shared utility to fetch and select organization
    let orgSelection;
    try {
      orgSelection = await selectOrganization(userId, selectedOrgSlug);
    } catch (error: any) {
      console.error(
        `[API /organizer/data] Error selecting organization:`,
        error.message
      );
      if (error.message === "User not found in database") {
        return NextResponse.json(
          { error: "User not found in database" },
          { status: 404 }
        );
      }
      if (error.message === "No organization found") {
        return NextResponse.json(
          { error: "No organization found" },
          { status: 404 }
        );
      }
      if (error.message === "No approved organization found") {
        return NextResponse.json(
          { error: "No approved organization found" },
          { status: 404 }
        );
      }
      throw error;
    }

    const { organization } = orgSelection;

    // Organizer role: only the events assigned to them — sales rows (names, emails) of other
    // events must not leave the server. Before 2026-10-15 this was filtered only in the browser.
    const myMembership = orgSelection.approvedMemberships.find(
      m => m.organization_id === organization.id
    );
    let visible: Set<string> | null;
    try {
      visible = await visibleEventIds(
        supabaseAdmin!,
        myMembership?.user_id ?? "",
        organization.id,
        myMembership?.role ?? null
      );
    } catch {
      return NextResponse.json(
        { error: "Failed to load event assignments" },
        { status: 500 }
      );
    }
    const inScope = (eventId: string) => visible === null || visible.has(eventId);

    // Fetch events for this organization with complete ticket tier data including stages
    // Ticket tiers are ordered by price (lowest first) at the database level
    const { data: events, error: eventsError } = await retrySupabaseOperation<
      any[]
    >(
      async () =>
        await supabaseAdmin!
          .from("events")
          .select(
            `
        *,
        ticket_tiers (
          id,
          name,
          price_cents,
          quantity_total,
          quantity_sold,
          per_user_limit,
          sales_start,
          sales_end,
          secret_code,
          order_index,
          registration_form_fields,
          registration_per_ticket,
          is_manually_sold_out,
          is_hidden,
          description,
          ticket_stages (
            id,
            name,
            price_cents,
            quantity,
            sold_quantity,
            order_index,
            description
          )
        ),
        promotional_tickets (
          id,
          email,
          customer_name,
          status,
          created_at,
          checked_in_at,
          qr_token,
          metadata,
          ticket_tiers (
            id,
            name,
            price_cents
          )
        ),
        bank_transfer_orders:orders!orders_event_id_fkey (
          id,
          user_id,
          customer_email,
          customer_name,
          quantity,
          total_amount_cents,
          created_at,
          status,
          payment_provider,
          users!orders_user_id_fkey (
            id,
            email,
            first_name,
            last_name
          ),
          ticket_tiers (
            id,
            name,
            price_cents
          ),
          tickets (
            id,
            checked_in_at,
            metadata
          )
        ),
        promotional_codes (
          id,
          code,
          discount_percentage,
          usage_limit,
          usage_count,
          created_at
        ),
        promoter_links (
          id,
          promoter_code,
          promoter_name,
          created_at
        )
      `
          )
          .eq("organization_id", organization.id)
          .order("starts_at", { ascending: true })
          .order("price_cents", {
            foreignTable: "ticket_tiers",
            ascending: true,
          })
          .order("created_at", {
            foreignTable: "promoter_links",
            ascending: false,
          })
    );

    if (eventsError) {
      console.error(
        `[API /organizer/data] Error fetching events:`,
        eventsError
      );
    }

    // Fetch event_assignments where THIS org IS the owner (source) and has
    // cohorts assigned out. Used by the dashboard to render "Co-host with X"
    // pills on owned events. Mirrors mobile useEventAssignments(orgId).
    const { data: ownerSideAssignments } = await retrySupabaseOperation<any[]>(
      async () =>
        await supabaseAdmin!
          .from("event_assignments")
          .select(
            "id, event_id, cohost_org:cohost_organization_id (id, name)",
          )
          .eq("organization_id", organization.id)
          .not("cohost_organization_id", "is", null)
    );

    const ownerCohostAssignments = ((ownerSideAssignments ?? []) as any[])
      .map(row => {
        const cohostOrg = Array.isArray(row.cohost_org)
          ? row.cohost_org[0]
          : row.cohost_org;
        if (!cohostOrg) return null;
        return {
          event_id: row.event_id as string,
          cohost_org_name: (cohostOrg.name as string) ?? "Unknown org",
        };
      })
      .filter((x): x is { event_id: string; cohost_org_name: string } => x !== null);

    // Fetch events where THIS org is a cohost (mirrors mobile useCohostEvents).
    // Lighter SELECT than primary events — cohorts do not see promo codes /
    // bank-transfer order rows, but DO see ticket tier inventory, the owning
    // org's name (for the "Co-host with {X}" pill), and per-event revenue so
    // the dashboard card matches the cohost detail view.
    const { data: cohostAssignments } = await retrySupabaseOperation<any[]>(
      async () =>
        await supabaseAdmin!
          .from("event_assignments")
          .select(
            `
              id,
              event_id,
              source_org:organization_id (id, name, slug),
              events:event_id (
                id, name, slug, description, status, starts_at, ends_at,
                venue, city, image_url, organization_id, currency, timezone,
                requires_rsvp, qr_scanner_code, registration_form_config,
                ticket_tiers (
                  id, name, price_cents, quantity_total, quantity_sold,
                  per_user_limit, sales_start, sales_end, secret_code,
                  order_index, registration_form_fields, registration_per_ticket,
                  is_manually_sold_out, is_hidden, description,
                  ticket_stages (
                    id, name, price_cents, quantity, sold_quantity, order_index, description
                  )
                )
              )
            `
          )
          .eq("cohost_organization_id", organization.id)
          .not("cohost_organization_id", "is", null)
    );

    type CohostEventEntry = {
      assignment_id: string;
      owner_org_name: string;
      owner_org_slug: string;
      event: any;
    };

    const cohostEvents: CohostEventEntry[] = ((cohostAssignments ?? []) as any[])
      .map(row => {
        const ev = Array.isArray(row.events) ? row.events[0] : row.events;
        const owner = Array.isArray(row.source_org)
          ? row.source_org[0]
          : row.source_org;
        if (!ev) return null;
        return {
          assignment_id: row.id,
          owner_org_name: owner?.name ?? "Unknown org",
          owner_org_slug: owner?.slug ?? "",
          event: ev,
        };
      })
      .filter((x): x is CohostEventEntry => x !== null)
      .filter(x => inScope(x.event.id));

    // Enrich cohost events with totalAttendees + RSVP counts + per-event
    // totalRevenue so the cohost org's dashboard cards / RSVPs tab show real
    // numbers. Revenue is computed with the same fetchEventPurchases path as
    // owner events (net base price via calculateOrganizerBasePrice, excludes
    // bank_transfer), so a cohost card matches its detail view exactly. Full
    // purchase rows are still withheld — cohost scope stays narrower.
    const cohostEventIdList = cohostEvents.map(c => c.event.id);
    if (cohostEventIdList.length > 0) {
      let cohostCounts = new Map<string, RsvpCounts>();
      try {
        cohostCounts = summarizeRsvps(
          await fetchRsvpRowsForEvents(supabaseAdmin!, cohostEventIdList)
        ).countsByEvent;
      } catch (error) {
        console.error(`[API /organizer/data] Error fetching cohost RSVPs:`, error);
      }
      // Same net-revenue computation as owner events: sum of basePrice (net of
      // service fee, bank transfers excluded) so the cohost card matches its
      // detail view instead of showing $0. Purchase rows themselves stay withheld.
      const cohostPurchases = await fetchEventPurchasesForEvents(
        supabaseAdmin!,
        cohostEventIdList
      );
      for (const entry of cohostEvents) {
        const counts = cohostCounts.get(entry.event.id) ?? emptyRsvpCounts();
        const totalAttendees = (entry.event.ticket_tiers || []).reduce(
          (sum: number, tier: any) => sum + (tier.quantity_sold || 0),
          0
        );
        const totalRevenue = (cohostPurchases.get(entry.event.id) ?? []).reduce(
          (sum, purchase) => sum + purchase.basePrice,
          0
        );
        entry.event = {
          ...entry.event,
          pending_rsvps: counts.pending,
          approved_rsvps: counts.approved,
          rejected_rsvps: counts.rejected,
          purchased_rsvps: counts.purchased,
          totalAttendees,
          totalRevenue,
        };
      }
    }

    // Transform bank transfer orders to match promotional_tickets structure for display
    const eventsWithFilteredBankTransfers = transformBankTransferOrders(
      (events || []).filter((e: { id: string }) => inScope(e.id))
    );

    const eventIds = (eventsWithFilteredBankTransfers || []).map(e => String(e.id));

    // Guard against empty eventIds array to prevent Postgres error
    if (!eventIds || eventIds.length === 0) {
      // Return early with empty orders data
      const eventsWithRsvpCounts = (eventsWithFilteredBankTransfers || []).map(
        event =>
          enrichEventWithStats(event, {
            purchases: [],
            rsvpCounts: emptyRsvpCounts(),
          })
      );

      return NextResponse.json({
        organization,
        events: eventsWithRsvpCounts || [],
        cohost_events: cohostEvents,
        owner_cohost_assignments: ownerCohostAssignments,
      });
    }

    // Fetch all orders for all events to calculate promoter link stats
    // We use a separate query here instead of reusing 'purchases' because 'purchases' excludes bank transfers,
    // but promoter stats should include ALL sales (including bank transfers) to align with totalAttendees derived from ticket_tiers.
    // Org-wide → paged (an org easily has > 1000 orders).
    let allOrders: any[] | null = null;
    let ordersError: unknown = null;
    try {
      allOrders = await selectAllPagesByIds<any>(eventIds, (ids, from, to) =>
        supabaseAdmin!
          .from("orders")
          .select(
            "id, event_id, promoter_code, quantity, total_amount_cents, discount_amount_cents, fee_percentage, created_at, base_price_cents"
          )
          .in("event_id", ids)
          .in("status", ["completed", "paid"])
          .not("promoter_code", "is", null) // Optimization: Only fetch orders with a promoter code
          .order("id", { ascending: true })
          .range(from, to)
      );
    } catch (error) {
      ordersError = error;
    }

    // Handle orders query error
    if (ordersError) {
      console.error(
        `[API /organizer/data] Error fetching orders:`,
        ordersError
      );
      return NextResponse.json(
        { error: "Failed to fetch orders data" },
        { status: 500 }
      );
    }

    // Group orders by event_id and promoter_code for efficient stats calculation
    // Ensure allOrders is treated as possibly null/undefined
    const ordersByEventAndPromoter = (allOrders ?? []).reduce(
      (acc: any, order: any) => {
        if (!order.promoter_code) return acc;
        const key = `${order.event_id}:${order.promoter_code}`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(order);
        return acc;
      },
      {}
    );

    // Everything per event, fetched for all events at once (fixed number of
    // queries whatever the number of events, each paged past the 1000-row cap):
    // active holds, RSVPs (counts + reserved quantities) and purchases.
    const registrationEventIds = (eventsWithFilteredBankTransfers || [])
      .filter(
        (e: any) =>
          Array.isArray(e?.registration_form_config) &&
          e.registration_form_config.length > 0
      )
      .map((e: any) => e.id as string);

    const [holdsRows, rsvpRows, purchasesByEvent] = await Promise.all([
      selectAllPagesByIds<{ tier_id: string; quantity: number | null }>(
        eventIds,
        (ids, from, to) =>
          supabaseAdmin!
            .from("holds")
            .select("id, tier_id, quantity, ticket_tiers!inner(event_id)")
            .in("ticket_tiers.event_id", ids)
            .gt("expires_at", new Date().toISOString())
            .is("order_id", null)
            .order("id", { ascending: true })
            .range(from, to)
      ).catch(error => {
        // Non-critical: the pending hint omits held counts.
        console.error(`[API /organizer/data] Error fetching holds:`, error);
        return [];
      }),
      fetchRsvpRowsForEvents(supabaseAdmin!, eventIds).catch(error => {
        console.error(`[API /organizer/data] Error fetching RSVPs:`, error);
        return [];
      }),
      fetchEventPurchasesForEvents(supabaseAdmin!, eventIds, {
        registrationEventIds,
      }),
    ]);

    const { countsByEvent, reservedByTier } = summarizeRsvps(rsvpRows);
    for (const row of holdsRows) {
      if (!row.tier_id) continue;
      reservedByTier[row.tier_id] =
        (reservedByTier[row.tier_id] || 0) + (row.quantity || 0);
    }

    const eventsWithRsvpCounts = (eventsWithFilteredBankTransfers || []).map(
      event =>
        enrichEventWithStats(event, {
          purchases: purchasesByEvent.get(String(event.id)) ?? [],
          rsvpCounts: countsByEvent.get(String(event.id)) ?? emptyRsvpCounts(),
          ordersByEventAndPromoter,
          reservedByTier,
        })
    );

    return NextResponse.json({
      organization,
      events: eventsWithRsvpCounts || [],
      cohost_events: cohostEvents,
      owner_cohost_assignments: ownerCohostAssignments,
    });
  } catch (error) {
    console.error(`[API /organizer/data] Error:`, error);
    return NextResponse.json(
      { error: "Failed to fetch organizer data" },
      { status: 500 }
    );
  }
}

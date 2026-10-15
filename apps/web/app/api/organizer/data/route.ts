import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase/server";
import { fetchEventPurchases } from "../../../lib/utils/purchase-data";
import { extractBasePriceHistorical } from "@project-flame/lib";
import {
  selectOrganization,
  type Organization,
} from "../../../lib/utils/organization-selection";
import { transformBankTransferOrders } from "../../../lib/utils/bank-transfer-data";
import { visibleEventIds } from "../../../lib/utils/event-access";
import { retrySupabaseOperation } from "../../../lib/utils/supabase-retry";

/**
 * Enriches an event with RSVP counts, purchase data, revenue calculations, and promoter link stats.
 * @param event - The event to enrich
 * @param supabaseAdmin - Supabase admin client
 * @param ordersByEventAndPromoter - Map of orders grouped by event_id and promoter_code (key format: "event_id:promoter_code")
 * @returns The enriched event with additional stats
 */
async function enrichEventWithStats(
  event: any,
  supabaseAdmin: any,
  ordersByEventAndPromoter: Record<string, any[]> = {},
  reservedByTier: Record<string, number> = {}
) {
  if (!supabaseAdmin) return event;

  // Fetch RSVP counts
  const { data: rsvpCounts, error: rsvpError } = await retrySupabaseOperation<
    any[]
  >(
    async () =>
      await supabaseAdmin
        .from("rsvps")
        .select("status")
        .eq("event_id", event.id)
  );

  if (rsvpError) {
    console.error("Error fetching RSVP counts for event", event.id, rsvpError);
  }

  const pending_rsvps =
    rsvpCounts?.filter((r: any) => r.status === "pending").length || 0;
  const approved_rsvps =
    rsvpCounts?.filter((r: any) => r.status === "approved").length || 0;
  const rejected_rsvps =
    rsvpCounts?.filter((r: any) => r.status === "rejected").length || 0;
  const purchased_rsvps =
    rsvpCounts?.filter((r: any) => r.status === "purchased").length || 0;

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

  // Fetch completed orders (purchases) with user and tier details.
  // For RSVP events with a registration form, also pull each registrant's
  // answers so the organizer purchase export can include them.
  const includeRegistrationData =
    Array.isArray(event?.registration_form_config) &&
    event.registration_form_config.length > 0;
  const purchases = await fetchEventPurchases(supabaseAdmin, event.id, {
    includeRegistrationData,
  });

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
                  order_index, registration_form_fields,
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
      const { data: cohostRsvpRows } = await retrySupabaseOperation<any[]>(
        async () =>
          await supabaseAdmin!
            .from("rsvps")
            .select("event_id, status")
            .in("event_id", cohostEventIdList)
      );

      type RsvpCounts = {
        pending: number;
        approved: number;
        rejected: number;
        purchased: number;
      };
      const rsvpCountsByEvent: Record<string, RsvpCounts> = {};
      for (const row of (cohostRsvpRows ?? []) as Array<{
        event_id: string;
        status: string;
      }>) {
        const counts: RsvpCounts =
          rsvpCountsByEvent[row.event_id] ??
          (rsvpCountsByEvent[row.event_id] = {
            pending: 0,
            approved: 0,
            rejected: 0,
            purchased: 0,
          });
        if (row.status === "pending") counts.pending++;
        else if (row.status === "approved") counts.approved++;
        else if (row.status === "rejected") counts.rejected++;
        else if (row.status === "purchased") counts.purchased++;
      }

      await Promise.all(
        cohostEvents.map(async entry => {
          const counts = rsvpCountsByEvent[entry.event.id] ?? {
            pending: 0,
            approved: 0,
            rejected: 0,
            purchased: 0,
          };
          const totalAttendees = (entry.event.ticket_tiers || []).reduce(
            (sum: number, tier: any) => sum + (tier.quantity_sold || 0),
            0,
          );
          // Same net-revenue computation as owner events (enrichEventWithStats):
          // fetchEventPurchases sums basePrice via the shared
          // calculateOrganizerBasePrice logic and excludes bank_transfer, so the
          // cohost card matches its detail view instead of showing $0.
          const purchases = await fetchEventPurchases(
            supabaseAdmin!,
            entry.event.id,
          );
          const totalRevenue = purchases.reduce(
            (sum, purchase) => sum + purchase.basePrice,
            0,
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
        }),
      );
    }

    // Transform bank transfer orders to match promotional_tickets structure for display
    const eventsWithFilteredBankTransfers = transformBankTransferOrders(
      (events || []).filter((e: { id: string }) => inScope(e.id))
    );

    const eventIds = (eventsWithFilteredBankTransfers || []).map(e => e.id);

    // Guard against empty eventIds array to prevent Postgres error
    if (!eventIds || eventIds.length === 0) {
      // Return early with empty orders data
      const eventsWithRsvpCounts = await Promise.all(
        (eventsWithFilteredBankTransfers || []).map(async event =>
          enrichEventWithStats(event, supabaseAdmin, {})
        )
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
    const { data: allOrders, error: ordersError } =
      await retrySupabaseOperation<any[]>(
        async () =>
          await supabaseAdmin!
            .from("orders")
            .select(
              "event_id, promoter_code, quantity, total_amount_cents, discount_amount_cents, fee_percentage, created_at, base_price_cents"
            )
            .in("event_id", eventIds)
            .in("status", ["completed", "paid"])
            .not("promoter_code", "is", null) // Optimization: Only fetch orders with a promoter code
      );

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

    // Batch fetch per-tier reservations (active holds + pending/approved
    // RSVPs) for the organizer "pending" hint. Runs in parallel with event
    // enrichment rather than per-event to avoid N+1 queries.
    const [holdsResult, reservedRsvpsResult] = await Promise.all([
      retrySupabaseOperation<any[]>(
        async () =>
          await supabaseAdmin!
            .from("holds")
            .select("tier_id, quantity, ticket_tiers!inner(event_id)")
            .in("ticket_tiers.event_id", eventIds)
            .gt("expires_at", new Date().toISOString())
            .is("order_id", null)
      ),
      retrySupabaseOperation<any[]>(
        async () =>
          await supabaseAdmin!
            .from("rsvps")
            .select("ticket_tier_id, requested_quantity, status")
            .in("event_id", eventIds)
            .in("status", ["pending", "approved"])
      ),
    ]);

    if (holdsResult.error) {
      console.error(
        `[API /organizer/data] Error fetching holds:`,
        holdsResult.error
      );
    }
    if (reservedRsvpsResult.error) {
      console.error(
        `[API /organizer/data] Error fetching reserved RSVPs:`,
        reservedRsvpsResult.error
      );
    }

    const reservedByTier: Record<string, number> = {};
    for (const row of (holdsResult.data || []) as Array<{
      tier_id: string;
      quantity: number | null;
    }>) {
      if (!row.tier_id) continue;
      reservedByTier[row.tier_id] =
        (reservedByTier[row.tier_id] || 0) + (row.quantity || 0);
    }
    for (const row of (reservedRsvpsResult.data || []) as Array<{
      ticket_tier_id: string | null;
      requested_quantity: number | null;
    }>) {
      if (!row.ticket_tier_id) continue;
      reservedByTier[row.ticket_tier_id] =
        (reservedByTier[row.ticket_tier_id] || 0) +
        (row.requested_quantity || 0);
    }

    // Add RSVP counts and purchase details to each event
    const eventsWithRsvpCounts = await Promise.all(
      (eventsWithFilteredBankTransfers || []).map(async event =>
        enrichEventWithStats(
          event,
          supabaseAdmin,
          ordersByEventAndPromoter,
          reservedByTier
        )
      )
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

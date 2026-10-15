import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "../lib/supabase/server";
import { Navbar } from "../components";
import OrganizerDashboard from "../components/OrganizerDashboard";
import { fetchEventPurchasesForEvents } from "../lib/utils/purchase-data";
import { visibleEventIds } from "../lib/utils/event-access";
import {
  emptyRsvpCounts,
  fetchRsvpRowsForEvents,
  summarizeRsvps,
  type RsvpCounts,
} from "../lib/utils/rsvp-stats";
import { selectAllPagesByIds } from "../lib/utils/supabase-pagination";
import { extractBasePriceHistorical, calculateOrganizerBasePrice } from "@project-flame/lib";
import { selectOrganization } from "../lib/utils/organization-selection";
import { transformBankTransferOrders } from "../lib/utils/bank-transfer-data";

// Use Incremental Static Regeneration (ISR) with reasonable caching
// Revalidate every 60 seconds - balances freshness with performance
// Client-side React Query will handle real-time updates within this window
export const revalidate = 60;

interface PageProps {
  searchParams: Promise<{ org?: string }>;
}

export default async function OrganizerPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  const user = await currentUser();
  const params = await searchParams;
  const selectedOrgSlug = params.org;

  if (!userId || !supabaseAdmin) {
    redirect("/");
  }

  // Use shared utility to fetch and select organization
  let orgSelection;
  try {
    orgSelection = await selectOrganization(userId, selectedOrgSlug);
  } catch (error: any) {
    console.error("Error selecting organization:", error.message);
    if (error.message === "No organization found") {
      redirect("/?onboarding=true");
    }
    if (error.message === "No approved organization found") {
      redirect("/account");
    }
    throw error;
  }

  const { organization, allOrganizations, approvedMemberships } = orgSelection;

  // If user has multiple organizations and URL doesn't match the selected org, redirect to fix it
  // This handles both missing org param and invalid org slug cases
  if (
    approvedMemberships.length > 1 &&
    (!selectedOrgSlug || selectedOrgSlug !== organization.slug)
  ) {
    redirect(`/organizer?org=${organization.slug}`);
  }

  // Serialize user data for client component
  const userData = user
    ? {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        emailAddresses: user.emailAddresses.map(email => ({
          emailAddress: email.emailAddress,
        })),
      }
    : null;

  // Fetch events for this organization with RSVP counts and ticket stages
  // Ticket tiers are ordered by price (lowest first) at the database level
  const { data: events } = await supabaseAdmin
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
        order_index,
        ticket_stages (
          id,
          name,
          price_cents,
          quantity,
          sold_quantity,
          order_index
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
          qr_token,
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
    .order("price_cents", { foreignTable: "ticket_tiers", ascending: true })
    .order("created_at", { foreignTable: "promoter_links", ascending: false });

  // Transform bank transfer orders to match promotional_tickets structure for display
  // Organizer role: only the events assigned to them (same rule as /api/organizer/data and every
  // organizer route). Before 2026-10-15 this page rendered every event of the organization, with
  // its buyers, into the HTML of any member.
  const myMembership = approvedMemberships.find(
    m => m.organization_id === organization.id
  );
  const visible = await visibleEventIds(
    supabaseAdmin,
    myMembership?.user_id ?? "",
    organization.id,
    myMembership?.role ?? null
  );
  const inScope = (eventId: string) => visible === null || visible.has(eventId);
  const eventsWithFilteredBankTransfers = transformBankTransferOrders(
    (events || []).filter((e: { id: string }) => inScope(e.id))
  );

  // SSR-fetch owner-side assignments so the dashboard can render "Co-host
  // with X" pills on events the current org OWNS and has assigned cohosts to,
  // on first paint. Mirrors mobile useEventAssignments(orgId).
  const { data: ownerSideAssignmentsRaw } = await supabaseAdmin
    .from("event_assignments")
    .select("id, event_id, cohost_org:cohost_organization_id (id, name)")
    .eq("organization_id", organization.id)
    .not("cohost_organization_id", "is", null);

  const initialOwnerCohostAssignments = ((ownerSideAssignmentsRaw ?? []) as any[])
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

  // SSR-fetch cohost events for the dashboard so the cohost-org's events list +
  // pills are populated on first paint (otherwise initialData ships without
  // cohost_events and the dashboard waits for the 15s poll to fill them in).
  // Mirrors the cohort fetch in /api/organizer/data.
  const { data: cohostAssignmentsRaw } = await supabaseAdmin
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
            ticket_stages (
              id, name, price_cents, quantity, sold_quantity, order_index
            )
          )
        )
      `
    )
    .eq("cohost_organization_id", organization.id)
    .not("cohost_organization_id", "is", null);

  const initialCohostEvents = ((cohostAssignmentsRaw ?? []) as any[])
    .map(row => {
      const ev = Array.isArray(row.events) ? row.events[0] : row.events;
      const owner = Array.isArray(row.source_org)
        ? row.source_org[0]
        : row.source_org;
      if (!ev) return null;
      return {
        assignment_id: row.id as string,
        owner_org_name: (owner?.name as string) ?? "Unknown org",
        owner_org_slug: (owner?.slug as string) ?? "",
        event: ev,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .filter(x => inScope(x.event.id));

  // Enrich cohost events with totalAttendees + RSVP counts + per-event
  // totalRevenue so first-paint shows real numbers (matches the per-event
  // enrichment we do for primary events further down AND the /api/organizer/data
  // poll). Without totalRevenue here, a co-hosted card renders Revenue: $0.00
  // until the client's 15s poll lands — the web twin of the mobile cohost-$0
  // bug (JULY_2026_FIXES.md #8). Revenue uses the same fetchEventPurchases path
  // as owner events (net basePrice via calculateOrganizerBasePrice, excludes
  // bank_transfer), so the cohost card matches its detail view exactly.
  const initialCohostEventIds = initialCohostEvents.map(c => c.event.id);
  if (initialCohostEventIds.length > 0) {
    // One paged RSVP read and one batched purchases read for all cohost events
    // (was one purchases query per event).
    let cohostCounts = new Map<string, RsvpCounts>();
    try {
      cohostCounts = summarizeRsvps(
        await fetchRsvpRowsForEvents(supabaseAdmin, initialCohostEventIds)
      ).countsByEvent;
    } catch (error) {
      console.error("Failed to fetch cohost RSVPs:", error);
    }
    const cohostPurchases = await fetchEventPurchasesForEvents(
      supabaseAdmin,
      initialCohostEventIds
    );
    for (const entry of initialCohostEvents) {
      const counts = cohostCounts.get(entry.event.id) ?? emptyRsvpCounts();
      const totalAttendees = ((entry.event as any).ticket_tiers || []).reduce(
        (sum: number, tier: any) => sum + (tier.quantity_sold || 0),
        0,
      );
      // Same net-revenue computation as owner events and the API cohost
      // enrichment: sum basePrice (net of service fee/IVA, excludes
      // bank_transfer) so the cohost card matches its detail view.
      const totalRevenue = (cohostPurchases.get(entry.event.id) ?? []).reduce(
        (sum, purchase) => sum + purchase.basePrice,
        0,
      );
      entry.event = {
        ...(entry.event as any),
        pending_rsvps: counts.pending,
        approved_rsvps: counts.approved,
        rejected_rsvps: counts.rejected,
        purchased_rsvps: counts.purchased,
        totalAttendees,
        totalRevenue,
      };
    }
  }

  // Optimize: Fetch ALL RSVPs and purchases for all events in parallel (2 queries instead of N*2)
  const eventIds = (eventsWithFilteredBankTransfers || []).map(e => String(e.id));

  // Early return if no events (owned). Still pass cohost events so the cohost
  // org's dashboard renders its cohosted events on first paint.
  if (eventIds.length === 0) {
    return (
      <>
        <Navbar />
        <OrganizerDashboard
          user={userData}
          organization={organization}
          organizations={allOrganizations}
          events={[]}
          initialCohostEvents={initialCohostEvents}
          initialOwnerCohostAssignments={initialOwnerCohostAssignments}
        />
      </>
    );
  }

  const [allRsvpsResult, allPurchasesResult, allHoldsResult] = await Promise.all([
    // Fetch all RSVPs for all events at once. Select ticket_tier_id and
    // requested_quantity so we can also compute a per-tier quantity_reserved
    // hint (pending/approved RSVP quantities) in addition to the event-level
    // status counts used below.
    // Paged: an org can exceed PostgREST's 1000-row cap in RSVPs too.
    fetchRsvpRowsForEvents(supabaseAdmin, eventIds).then(
      data => ({ data, error: null as unknown }),
      error => ({ data: [] as Awaited<ReturnType<typeof fetchRsvpRowsForEvents>>, error })
    ),
    // Fetch all purchases for all events at once.
    // Exclude bank transfer orders from purchase details (they appear in "Sent Promotional Tickets" instead).
    //
    // PostgREST caps every response at 1000 rows by default. This SSR query is
    // org-wide (`.in("event_id", eventIds)`) so a high-volume org easily exceeds
    // that (e.g. 1045 orders), silently truncating the overflow on first paint —
    // the newest event's latest orders drop out and its revenue under-counts
    // (the $8,390 vs $10,060 flash: SSR shows the truncated total, then the
    // client's /api/organizer/data poll — which fetches per-event, under the cap
    // — replaces it with the correct figure a few seconds later). Page through
    // the full result set ordered by the unique primary key `id` so pagination
    // is stable (no skipped/duplicated rows across page boundaries) and the
    // first paint is already correct. (The sibling RSVP/holds queries below stay
    // single-shot: RSVPs and active holds are well under 1000 per org — only the
    // orders volume crosses the cap. If an org ever exceeds 1000 RSVPs, apply
    // the same pagination there.)
    (async () => {
      const PAGE_SIZE = 1000;
      const all: any[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabaseAdmin
          .from("orders")
          .select(
            `
            id,
            event_id,
            promoter_code,
            total_amount_cents,
            discount_amount_cents,
            unit_price_cents,
            quantity,
            fee_percentage,
            base_price_cents,
            status,
            payment_provider,
            created_at,
            users!user_id (
              first_name,
              last_name,
              email
            ),
            ticket_tiers!ticket_tier_id (
              id,
              name
            ),
            tickets (
              id,
              status,
              checked_in_at,
              metadata
            )
          `
          )
          .in("event_id", eventIds)
          .in("status", ["completed", "paid"]) // Include both Datafast (completed) and Stripe (paid) orders
          .neq("payment_provider", "bank_transfer") // Exclude bank transfer orders from purchase details
          .order("id", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        // Fail fast on a pagination error rather than returning the partial
        // `all` accumulated so far — partial data here silently under-counts
        // revenue (the exact bug this pagination prevents). Mirrors the mobile
        // twin `useOrgDashboardStats.ts` which `throw error`s mid-loop.
        if (error) throw error;
        const batch = data ?? [];
        all.push(...batch);
        if (batch.length < PAGE_SIZE) break;
      }
      return { data: all, error: null };
    })(),
    // Fetch active (non-expired, not attached to an order) holds for all
    // tiers on these events, so we can display a per-tier "pending" hint
    // alongside quantity_sold on the organizer dashboard.
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
    ).then(
      data => ({ data, error: null as unknown }),
      error => ({ data: [] as Array<{ tier_id: string; quantity: number | null }>, error })
    ),
  ]);

  // Check for query errors
  if (allRsvpsResult.error) {
    console.error("Failed to fetch RSVPs:", allRsvpsResult.error);
    // Consider throwing or handling the error appropriately
  }
  if (allPurchasesResult.error) {
    console.error("Failed to fetch purchases:", allPurchasesResult.error);
    // Consider throwing or handling the error appropriately
  }
  if (allHoldsResult.error) {
    console.error("Failed to fetch holds:", allHoldsResult.error);
    // Non-critical — fall through with an empty holds array. The pending
    // hint will simply omit held counts; quantity_sold display remains correct.
  }

  // Build per-tier quantity_reserved map (active holds + pending/approved
  // RSVPs). Matches the get_event_with_tiers RPC definition so the organizer
  // dashboard, public event page, and mobile all agree on "true remaining".
  const reservedByTier: Record<string, number> = {};
  for (const row of (allHoldsResult.data || []) as Array<{
    tier_id: string;
    quantity: number | null;
  }>) {
    if (!row.tier_id) continue;
    reservedByTier[row.tier_id] =
      (reservedByTier[row.tier_id] || 0) + (row.quantity || 0);
  }
  for (const row of (allRsvpsResult.data || []) as Array<{
    ticket_tier_id: string | null;
    requested_quantity: number | null;
    status: string | null;
  }>) {
    if (!row.ticket_tier_id) continue;
    if (row.status !== "pending" && row.status !== "approved") continue;
    reservedByTier[row.ticket_tier_id] =
      (reservedByTier[row.ticket_tier_id] || 0) +
      (row.requested_quantity || 0);
  }

  // Group RSVPs by event_id
  const rsvpsByEvent: Record<string, { pending: number; approved: number; rejected: number }> = (allRsvpsResult.data || []).reduce(
    (acc: Record<string, { pending: number; approved: number; rejected: number }>, rsvp: any) => {
      if (!acc[rsvp.event_id]) {
        acc[rsvp.event_id] = { pending: 0, approved: 0, rejected: 0 };
      }
      if (rsvp.status === "pending") acc[rsvp.event_id].pending++;
      else if (rsvp.status === "approved") acc[rsvp.event_id].approved++;
      else if (rsvp.status === "rejected") acc[rsvp.event_id].rejected++;
      return acc;
    },
    {}
  );

  // Pre-fetch stage information for orders missing metadata (single batch query for performance)
  const ordersNeedingStageLookup = (allPurchasesResult.data || []).filter(
    (order: any) => {
      const firstTicket = order.tickets?.[0];
      return (
        !firstTicket?.metadata?.stage_name &&
        order.ticket_tiers?.id &&
        order.unit_price_cents !== undefined &&
        order.unit_price_cents !== null
      );
    }
  );

  const stageLookupMap = new Map<string, string>();
  if (ordersNeedingStageLookup.length > 0 && supabaseAdmin) {
    // Collect unique (tier, price) pairs we need
    const neededPairs = new Set(
      ordersNeedingStageLookup.map(
        (o: any) => `${o.ticket_tiers.id}:${o.unit_price_cents}`
      )
    );

    const tierIds = Array.from(
      new Set(ordersNeedingStageLookup.map((o: any) => o.ticket_tiers.id))
    );

    // Fetch all stages for the required tiers (avoid Cartesian product)
    const { data: stages } = await supabaseAdmin
      .from("ticket_stages")
      .select("ticket_tier_id, price_cents, name")
      .in("ticket_tier_id", tierIds);

    // Filter in-memory to only include the specific (tier, price) pairs we need
    if (stages) {
      stages.forEach((stage: any) => {
        const key = `${stage.ticket_tier_id}:${stage.price_cents}`;
        // Only include stages that match our needed (tier, price) pairs
        if (neededPairs.has(key)) {
          stageLookupMap.set(key, stage.name);
        }
      });
    }
  }

  // Group purchases by event_id
  const purchasesByEvent: Record<string, any[]> = (allPurchasesResult.data || []).reduce(
    (acc: Record<string, any[]>, order: any) => {
      if (!acc[order.event_id]) acc[order.event_id] = [];

      // Determine if any tickets have been scanned
      const tickets = order.tickets || [];
      const hasScannedTickets = tickets.some(
        (ticket: any) => ticket.checked_in_at !== null
      );

      // For completed orders, rsvpStatus should be "purchased"
      // Ticket status shows: 'issued', 'void', 'checked_in', 'refunded'
      const ticketStatus = tickets[0]?.status || "issued";

      // Calculate the base price the organizer receives
      // PRIORITY: Use stored base_price_cents if available (Stripe Guaranteed Net model)
      // This field already contains the final discounted base price
      // Otherwise, fall back to historical extraction for legacy Datafast orders
      const totalCents = order.total_amount_cents || 0;
      
      const actualBasePrice = calculateOrganizerBasePrice(order);

      // Extract stage name from ticket metadata or infer from order price
      const firstTicket = tickets?.[0];
      let stageName = firstTicket?.metadata?.stage_name || null;

      // If stage name is missing, look it up from our pre-fetched map
      if (
        !stageName &&
        order.ticket_tiers?.id &&
        order.unit_price_cents !== undefined &&
        order.unit_price_cents !== null
      ) {
        const lookupKey = `${order.ticket_tiers.id}:${order.unit_price_cents}`;
        stageName = stageLookupMap.get(lookupKey) || null;
      }

      acc[order.event_id].push({
        id: order.id,
        userName: `${order.users?.first_name || ""} ${
          order.users?.last_name || ""
        }`.trim(),
        userEmail: order.users?.email || "",
        tierName: order.ticket_tiers?.name || "Unknown",
        stageName: stageName,
        quantity: order.quantity,
        totalPrice: totalCents,
        basePrice: actualBasePrice, // Base price after discount (what organizer actually receives)
        createdAt: order.created_at,
        rsvpStatus: "purchased", // For completed orders, status is "purchased"
        scanned: hasScannedTickets,
      });
      return acc;
    },
    {}
  );

  // Calculate promoter link stats for all events
  // Group orders by event_id and promoter_code for efficient stats calculation
  const ordersByEventAndPromoter = (allPurchasesResult.data || []).reduce(
    (acc: any, order: any) => {
      if (!order.promoter_code) return acc;
      const key = `${order.event_id}:${order.promoter_code}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(order);
      return acc;
    },
    {}
  );

  // Combine data with events (all synchronous now)
  const eventsWithRsvpCounts = (eventsWithFilteredBankTransfers || []).map((event: any) => {
    const eventId = String(event.id); // Ensure event.id is treated as string
    const rsvpCounts = rsvpsByEvent[eventId] || {
      pending: 0,
      approved: 0,
      rejected: 0,
    };
    const purchases = purchasesByEvent[eventId] || [];

    // Calculate revenue from base price only (what organizer receives, excluding service fee and IVA)
    const totalRevenue = purchases.reduce(
      (sum: number, purchase: any) => sum + (purchase.basePrice || 0),
      0
    );
    // Calculate total attendees from quantity_sold in ticket tiers (includes all payment methods including bank transfers)
    // This matches the calculation used in Events & Ticket Tiers Management view
    const totalAttendees = (event.ticket_tiers || []).reduce(
      (sum: number, tier: any) => sum + (tier.quantity_sold || 0),
      0
    );

    // Calculate promoter link stats with sales data
    const promoterLinksWithStats = ((event as any).promoter_links || []).map(
      (link: any) => {
        const key = `${event.id}:${link.promoter_code}`;
        const orders = ordersByEventAndPromoter[key] || [];

        const totalTickets = orders.reduce(
          (sum: number, order: any) => sum + (order.quantity || 0),
          0
        );

        const totalRevenue = orders.reduce((sum: number, order: any) => {
          // Calculate the base price the organizer receives
          // PRIORITY: Use stored base_price_cents if available (Stripe Guaranteed Net model)
          // This field already contains the final discounted base price
          const actualBasePrice = calculateOrganizerBasePrice(order);

          return sum + actualBasePrice;
        }, 0);

        return {
          ...link,
          total_tickets_sold: totalTickets,
          total_revenue_cents: totalRevenue,
        };
      }
    );

    const ticketTiersWithReserved = (event.ticket_tiers || []).map(
      (tier: any) => ({
        ...tier,
        quantity_reserved: reservedByTier[tier.id] || 0,
      })
    );

    return {
      ...event,
      ticket_tiers: ticketTiersWithReserved,
      pending_rsvps: rsvpCounts.pending,
      approved_rsvps: rsvpCounts.approved,
      rejected_rsvps: rsvpCounts.rejected,
      purchases,
      totalRevenue,
      totalAttendees,
      promoter_links: promoterLinksWithStats,
    };
  });

  return (
    <>
      <Navbar />
      <OrganizerDashboard
        user={userData}
        organization={organization}
        organizations={allOrganizations}
        events={eventsWithRsvpCounts || []}
        initialCohostEvents={initialCohostEvents}
        initialOwnerCohostAssignments={initialOwnerCohostAssignments}
      />
    </>
  );
}

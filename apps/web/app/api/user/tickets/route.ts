import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "../../../lib/supabase/server";

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      console.log("API: No user ID found, returning unauthorized");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database connection error" },
        { status: 500 }
      );
    }

    // Get the user's Supabase ID and email
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("id, email")
      .eq("clerk_id", userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Guard: ensure user.email exists before querying by email
    if (!user.email) {
      console.error("User email is missing for user:", user.id);
      return NextResponse.json(
        { error: "User email not found" },
        { status: 500 }
      );
    }

    // Normalize email to lowercase for consistent matching
    const normalizedEmail = user.email.toLowerCase();

    // Fetch actual purchased tickets (exclude refunded and void tickets)
    const { data: tickets, error: ticketsError } = await supabaseAdmin
      .from("tickets")
      .select(
        `
        id,
        attendee_name,
        attendee_email,
        status,
        qr_code,
        qr_token,
        checked_in_at,
        created_at,
        metadata,
        ticket_tier:ticket_tiers(
          id,
          name,
          price_cents,
          event:events(
            id,
            name,
            slug,
            description,
            image_url,
            starts_at,
            ends_at,
            venue,
            city,
            timezone,
            currency,
            organization:organizations(
              name
            )
          )
        ),
        order:orders(
          id,
          quantity,
          total_cents,
          subtotal_cents,
          discount_amount_cents,
          unit_price_cents,
          payment_provider,
          created_at
        )
      `
      )
      .eq("user_id", user.id)
      .in("status", ["issued", "checked_in"])
      .order("created_at", { ascending: false });

    if (ticketsError) {
      console.error("Error fetching tickets:", ticketsError);
      return NextResponse.json(
        { error: "Failed to fetch user tickets" },
        { status: 500 }
      );
    }

    // Fetch RSVPs (pending, approved, rejected) - exclude purchased ones since they become tickets
    // IMPORTANT: Also check if approved RSVPs have associated orders/tickets to prevent duplicates
    const { data: rsvps, error: rsvpsError } = await supabaseAdmin
      .from("rsvps")
      .select(
        `
        id,
        requested_quantity,
        status,
        requested_at,
        approved_at,
        stage_id,
        stage_name,
        stage_price_cents,
        base_price_cents,
        total_amount_cents,
        discount_amount_cents,
        ticket_tiers (
          id,
          name,
          price_cents,
          events (
            id,
            name,
            slug,
            description,
            image_url,
            starts_at,
            ends_at,
            venue,
            city,
            timezone,
            currency,
            organizations (
              name
            )
          )
        )
      `
      )
      .eq("user_id", user.id)
      .neq("status", "purchased") // Exclude purchased RSVPs since they become actual tickets
      .order("requested_at", { ascending: false });

    if (rsvpsError) {
      console.error("Error fetching RSVPs:", rsvpsError);
      return NextResponse.json(
        { error: "Failed to fetch user tickets" },
        { status: 500 }
      );
    }

    // Fetch promotional tickets (matched by email, exclude void tickets)
    // Use .eq() for exact matching since normalizedEmail is already lowercase
    // This avoids .ilike() wildcard issues with _ or % characters in email addresses
    const { data: promotionalTickets, error: promotionalError } =
      await supabaseAdmin
        .from("promotional_tickets")
        .select(
          `
        id,
        customer_name,
        email,
        status,
        qr_token,
        checked_in_at,
        created_at,
        metadata,
        ticket_tiers (
          id,
          name,
          price_cents,
          events (
            id,
            name,
            slug,
            description,
            image_url,
            starts_at,
            ends_at,
            venue,
            city,
            timezone,
            currency,
            organizations (
              name
            )
          )
        )
      `
        )
        .eq("email", normalizedEmail)
        .in("status", ["issued", "checked_in"])
        .order("created_at", { ascending: false });

    // Log error but don't fail the entire request - still return regular tickets and RSVPs
    if (promotionalError) {
      console.error("Error fetching promotional tickets:", promotionalError);
      // Continue execution - we'll just use an empty array for promotional tickets
    }

    // Combine tickets, promotional tickets, and RSVPs
    // First, enrich tickets with stage metadata if missing (batch-prefetch to avoid N+1)
    const ticketsToEnrich = (tickets || []).map(ticket => {
      // Supabase returns single relationships as objects, but normalize just in case
      const order = Array.isArray(ticket.order)
        ? ticket.order[0]
        : ticket.order;
      const ticketTier = Array.isArray(ticket.ticket_tier)
        ? ticket.ticket_tier[0]
        : ticket.ticket_tier;
      return { ticket, order, ticketTier };
    });

    // Collect unique (tier_id, price_cents) pairs for tickets missing metadata
    const missingMetadataKeys = new Set<string>();

    ticketsToEnrich.forEach(({ ticket, order, ticketTier }) => {
      if (
        (!ticket.metadata || !ticket.metadata.stage_name) &&
        ticketTier?.id &&
        order?.unit_price_cents !== undefined &&
        order?.unit_price_cents !== null
      ) {
        const key = `${ticketTier.id}:${order.unit_price_cents}`;
        missingMetadataKeys.add(key);
      }
    });

    // Batch-fetch all missing stages in a single query
    const stagesMap = new Map<
      string,
      { id: string; name: string; price_cents: number }
    >();

    if (missingMetadataKeys.size > 0) {
      // Extract unique tier IDs only (avoid Cartesian product)
      const tierIds = new Set<string>();

      missingMetadataKeys.forEach(key => {
        const [tierId] = key.split(":");
        tierIds.add(tierId);
      });

      // Fetch all stages for the required tiers (more efficient than Cartesian product)
      const { data: stages } = await supabaseAdmin
        .from("ticket_stages")
        .select("id, name, price_cents, ticket_tier_id")
        .in("ticket_tier_id", Array.from(tierIds));

      // Build lookup map keyed by `${tierId}:${price}` - filter in-memory to only needed pairs
      if (stages) {
        stages.forEach(stage => {
          const mapKey = `${stage.ticket_tier_id}:${stage.price_cents}`;
          // Only include stages that match our needed (tier, price) pairs
          if (missingMetadataKeys.has(mapKey)) {
            stagesMap.set(mapKey, {
              id: stage.id,
              name: stage.name,
              price_cents: stage.price_cents,
            });
          }
        });
      }
    }

    // Iterate tickets synchronously to assign metadata from the map
    const enrichedTickets = ticketsToEnrich.map(
      ({ ticket, order, ticketTier }) => {
        let metadata = ticket.metadata;

        // If missing metadata or missing stage_name, look it up from the batch-fetched map
        if (
          (!metadata || !metadata.stage_name) &&
          ticketTier?.id &&
          order?.unit_price_cents !== undefined &&
          order?.unit_price_cents !== null
        ) {
          const lookupKey = `${ticketTier.id}:${order.unit_price_cents}`;
          const stage = stagesMap.get(lookupKey);

          if (stage) {
            metadata = {
              ...(metadata ?? {}),
              stage_id: stage.id,
              stage_name: stage.name,
              stage_price_cents: stage.price_cents,
            };
          }
        }

        return {
          ...ticket,
          metadata,
          order: order,
          type: "ticket" as const,
        };
      }
    );

    // Format promotional tickets to match the ticket structure
    // Use empty array if promotional tickets failed to fetch (graceful degradation)
    const formattedPromotionalTickets = (
      (promotionalError ? [] : promotionalTickets) || []
    ).map(promoTicket => {
      const ticketTier = Array.isArray(promoTicket.ticket_tiers)
        ? promoTicket.ticket_tiers.length > 0
          ? promoTicket.ticket_tiers[0]
          : null
        : promoTicket.ticket_tiers;
      const event = Array.isArray(ticketTier?.events)
        ? ticketTier.events.length > 0
          ? ticketTier.events[0]
          : null
        : ticketTier?.events;
      const organization = Array.isArray(event?.organizations)
        ? event.organizations.length > 0
          ? event.organizations[0]
          : null
        : event?.organizations;

      return {
        id: promoTicket.id,
        attendee_name: promoTicket.customer_name,
        attendee_email: promoTicket.email,
        status: promoTicket.status,
        qr_code: null, // Promotional tickets don't store QR code, only qr_token
        qr_token: promoTicket.qr_token,
        checked_in_at: promoTicket.checked_in_at,
        created_at: promoTicket.created_at,
        metadata: promoTicket.metadata,
        ticket_tier: {
          id: ticketTier?.id,
          name: ticketTier?.name,
          price_cents: ticketTier?.price_cents,
          event: {
            id: event?.id,
            name: event?.name,
            slug: event?.slug,
            description: event?.description,
            image_url: event?.image_url,
            starts_at: event?.starts_at,
            ends_at: event?.ends_at,
            venue: event?.venue,
            city: event?.city,
            timezone: event?.timezone,
            currency: event?.currency,
            organization: {
              name: organization?.name,
            },
          },
        },
        order: {
          id: null,
          quantity: 1,
          // Use price from metadata if available (for bank transfer tickets), otherwise 0 (for free tickets)
          total_cents: promoTicket.metadata?.stage_price_cents || 0,
          subtotal_cents: promoTicket.metadata?.stage_price_cents || 0,
          discount_amount_cents: 0,
          unit_price_cents: promoTicket.metadata?.stage_price_cents || 0,
          created_at: promoTicket.created_at,
        },
        type: "promotional" as const,
      };
    });

    // Filter out approved RSVPs that already have tickets created
    // This prevents duplicate display when RSVP->purchased status update fails
    // Note: Only filters FREE RSVPs - paid RSVPs remain visible until webhook completes
    
    // Batch optimization: Collect all approved RSVP IDs first to query efficiently
    const approvedRsvps = (rsvps || []).filter(r => r.status === "approved");
    const approvedRsvpIds = approvedRsvps.map(r => r.id);
    const existingOrderMap = new Set<string>();

    if (approvedRsvpIds.length > 0) {
      // Chunking to avoid large URL limits
      const BATCH_SIZE = 50;
      for (let i = 0; i < approvedRsvpIds.length; i += BATCH_SIZE) {
        const chunk = approvedRsvpIds.slice(i, i + BATCH_SIZE);
        const idempotencyKeys = chunk.map(id => `free_${id}`);
        
        // Fetch matching orders for this chunk
        const { data: existingOrders, error: ordersError } = await supabaseAdmin
          .from("orders")
          .select("id, idempotency_key")
          .in("idempotency_key", idempotencyKeys);

        if (ordersError) {
          console.error(
            "Error checking existing orders for RSVPs:",
            ordersError
          );
          continue;
        }

        if (existingOrders) {
          existingOrders.forEach(order => {
            if (order.idempotency_key) {
              existingOrderMap.add(order.idempotency_key);
            }
          });
        }
      }
    }

    const rsvpsWithoutTickets = (rsvps || []).filter(rsvp => {
      // If RSVP is approved, check if tickets were already created (using batched lookup)
      if (rsvp.status === "approved") {
        const idempotencyKey = `free_${rsvp.id}`;
        
        // If order exists for this RSVP, it means tickets were created
        // Don't show this RSVP since the actual tickets are already in the list
        if (existingOrderMap.has(idempotencyKey)) {
          console.log(
            `Filtering out approved RSVP ${rsvp.id} - tickets already created`
          );
          return false;
        }
      }
      return true;
    });

    // Filter out null values (approved RSVPs with existing orders)
    const filteredRsvps = rsvpsWithoutTickets;

    const userTickets = [
      ...enrichedTickets,
      ...formattedPromotionalTickets,
      ...filteredRsvps.map(rsvp => {
        // Handle the case where ticket_tiers might be an array due to Supabase typing
        const ticketTier = Array.isArray(rsvp.ticket_tiers)
          ? rsvp.ticket_tiers.length > 0
            ? rsvp.ticket_tiers[0]
            : null
          : rsvp.ticket_tiers;
        const event = Array.isArray(ticketTier?.events)
          ? ticketTier.events.length > 0
            ? ticketTier.events[0]
            : null
          : ticketTier?.events;
        const organization = Array.isArray(event?.organizations)
          ? event.organizations.length > 0
            ? event.organizations[0]
            : null
          : event?.organizations;

        return {
          ...rsvp,
          quantity: rsvp.requested_quantity,
          stage_id: rsvp.stage_id,
          stage_name: rsvp.stage_name,
          stage_price_cents: rsvp.stage_price_cents,
          ticket_tier: {
            id: ticketTier?.id,
            name: ticketTier?.name,
            price_cents: ticketTier?.price_cents,
            event: {
              id: event?.id,
              name: event?.name,
              slug: event?.slug,
              description: event?.description,
              image_url: event?.image_url,
              starts_at: event?.starts_at,
              ends_at: event?.ends_at,
              venue: event?.venue,
              city: event?.city,
              timezone: event?.timezone,
              currency: event?.currency,
              organization: {
                name: organization?.name,
              },
            },
          },
          type: "rsvp" as const,
        };
      }),
    ];

    return NextResponse.json({ tickets: userTickets });
  } catch (error) {
    console.error("Error fetching user tickets:", error);
    return NextResponse.json(
      { error: "Failed to fetch user tickets" },
      { status: 500 }
    );
  }
}

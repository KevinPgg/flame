/**
 * Public event page data (shared by the v1 page and the Flame 2.0 page, fase 2.4): the event by
 * slug with tiers enriched for availability, and its SEO metadata. Moved verbatim from
 * app/events/[slug]/page.tsx so both pages render the same data and the same <head>.
 */
import type { Metadata } from "next";
import { supabaseAdmin } from "./supabase/server";
import { enrichTicketStagesWithWaterfall } from "@project-flame/lib";
import { siteConfig } from "./seo-config";

// Server-side function to fetch event by slug
export async function getEventBySlug(slug: string) {
  if (!supabaseAdmin) {
    return null;
  }

  try {
    const { data: event, error } = await supabaseAdmin
      .from("events")
      .select(
        `
        *,
        organizations (
          id,
          name,
          slug,
          logo_url
        ),
        ticket_tiers (
          id,
          name,
          description,
          price_cents,
          quantity_total,
          quantity_sold,
          per_user_limit,
          order_index,
          sales_start,
          sales_end,
          registration_form_fields,
          secret_code,
          is_manually_sold_out,
          is_hidden,
          ticket_stages (
            id,
            name,
            price_cents,
            quantity,
            sold_quantity,
            order_index,
            description
          )
        )
      `
      )
      .eq("slug", slug)
      .eq("status", "published")
      .single();

    if (error) {
      console.error("Error fetching event:", error);
      return null;
    }

    // W4-C1: drop organizer-hidden tiers before any enrichment so attendees
    // never see them. The `/api/events` route applies the same filter; here
    // we mirror it for SSR because this page hits Supabase directly rather
    // than going through the `get_event_with_tiers` RPC.
    if (event && Array.isArray(event.ticket_tiers)) {
      event.ticket_tiers = event.ticket_tiers.filter(
        (tier: { is_hidden?: boolean }) => tier.is_hidden !== true,
      );
    }

    // Enrich with pending RSVP counts AND active holds per tier (quantity_reserved)
    // For non-RSVP events with stages, also track stage-specific holds for accurate availability
    // OPTIMIZATION: Run both queries in parallel using Promise.all() instead of sequentially
    if (event && event.ticket_tiers && event.ticket_tiers.length > 0) {
      const allTierIds = event.ticket_tiers.map((tier: any) => tier.id);

      // Fetch RSVPs and holds in parallel for ~2x speed improvement
      // For holds, include stage_id to properly track stage-specific reservations
      const [{ data: rsvpCounts }, { data: holdCounts }] = await Promise.all([
        // Count pending/approved RSVPs
        supabaseAdmin
          .from("rsvps")
          .select("ticket_tier_id, requested_quantity")
          .in("ticket_tier_id", allTierIds)
          .in("status", ["pending", "approved"]), // Only count pending/approved

        // Count active (non-expired) holds (tickets in checkout)
        // Include stage_id for stage-specific tracking in non-RSVP events
        // CRITICAL: Filter by order_id IS NULL to exclude converted holds
        // (converted holds are already counted in quantity_sold via orders)
        supabaseAdmin
          .from("holds")
          .select("tier_id, stage_id, quantity")
          .in("tier_id", allTierIds)
          .gt("expires_at", new Date().toISOString()) // Only count non-expired holds
          .is("order_id", null), // Exclude holds that have been converted to orders
      ]);

      const tierReservedMap: Record<string, number> = {};
      const stageReservedMap: Record<string, number> = {}; // Track holds per stage

      // Add RSVPs to reserved count (only for RSVP events)
      if (rsvpCounts) {
        rsvpCounts.forEach((rsvp: any) => {
          tierReservedMap[rsvp.ticket_tier_id] =
            (tierReservedMap[rsvp.ticket_tier_id] || 0) +
            (rsvp.requested_quantity || 0);
        });
      }

      // Add active holds to reserved count
      if (holdCounts) {
        holdCounts.forEach((hold: any) => {
          // Always track at tier level for backward compatibility
          tierReservedMap[hold.tier_id] =
            (tierReservedMap[hold.tier_id] || 0) + (hold.quantity || 0);

          // For non-RSVP events: Track holds at stage level if stage_id is present
          // This allows accurate per-stage availability for events with ticket stages
          if (!event.requires_rsvp && hold.stage_id) {
            stageReservedMap[hold.stage_id] =
              (stageReservedMap[hold.stage_id] || 0) + (hold.quantity || 0);
          }
        });
      }

      // Attach reserved counts to tiers and stages
      event.ticket_tiers.forEach((tier: any, index: number) => {
        tier.quantity_reserved = tierReservedMap[tier.id] || 0;

        // For non-RSVP events with stages: attach stage-specific hold counts
        // This enables the UI to show accurate availability per stage
        if (
          !event.requires_rsvp &&
          tier.ticket_stages &&
          tier.ticket_stages.length > 0
        ) {
          tier.ticket_stages.forEach((stage: any) => {
            stage.quantity_reserved = stageReservedMap[stage.id] || 0;
          });
        }

        // Apply waterfall logic to fill holes
        // This ensures stages with available capacity are marked available
        // even if total sales suggest we're in a later stage
        event.ticket_tiers[index] = enrichTicketStagesWithWaterfall(tier);
      });
    }

    // Fetch co-host org names from event_assignments
    let cohostOrgNames: string[] = [];
    if (event) {
      const { data: cohosts } = await supabaseAdmin
        .from("event_assignments")
        .select("cohost_org:cohost_organization_id ( name )")
        .eq("event_id", event.id)
        .not("cohost_organization_id", "is", null);

      if (cohosts && cohosts.length > 0) {
        cohostOrgNames = [
          ...new Set(
            cohosts
              .map((c: any) => ((c.cohost_org as any)?.name as string)?.trim())
              .filter(Boolean),
          ),
        ].sort();
      }
    }

    // Transform tiers: derive has_secret_code boolean, then strip the raw
    // secret_code so it is never serialised into the client component's props.
    const safeEvent = {
      ...event,
      cohost_org_names: cohostOrgNames,
      ticket_tiers: event.ticket_tiers?.map((tier: any) => {
        const { secret_code, ...rest } = tier;
        return { ...rest, has_secret_code: Boolean(secret_code) };
      }) ?? [],
    };

    return safeEvent;
  } catch (error) {
    console.error("Error in getEventBySlug:", error);
    return null;
  }
}

// Generate dynamic metadata for each event page
export async function eventPageMetadata(slug: string): Promise<Metadata> {
  const event = await getEventBySlug(slug);

  if (!event) {
    return {
      title: "Event Not Found",
    };
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || siteConfig.url;
  const startDate = new Date(event.starts_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Get minimum price from ticket tiers
  let minPrice = null;
  if (event.ticket_tiers && event.ticket_tiers.length > 0) {
    const prices = event.ticket_tiers
      .map((tier: any) => tier.price_cents)
      .filter((price: number) => price > 0);
    if (prices.length > 0) {
      minPrice = Math.min(...prices) / 100;
    }
  }

  const priceText = minPrice ? ` — From $${minPrice.toFixed(2)}` : "";
  const eventTitle = event.title || "Event";
  const description =
    event.description ||
    `Buy tickets for ${eventTitle} in ${event.city}. ${startDate}${priceText}. Book now with instant confirmation.`;

  return {
    title: `${siteConfig.name} | ${eventTitle}`,
    description: description.substring(0, 160),
    keywords: [
      eventTitle,
      event.city,
      event.venue || "",
      "tickets",
      "entradas",
      "event tickets",
    ].filter(Boolean),
    openGraph: {
      title: `${siteConfig.name} | ${eventTitle}`,
      description: description.substring(0, 200),
      type: "website",
      url: `${baseUrl}/events/${event.slug}`,
      images: event.image_url
        ? [
            {
              url: event.image_url,
              width: 1200,
              height: 630,
              alt: eventTitle,
            },
          ]
        : [],
      siteName: "Flame",
    },
    twitter: {
      card: "summary_large_image",
      title: `${siteConfig.name} | ${eventTitle}`,
      description: description.substring(0, 200),
      images: event.image_url ? [event.image_url] : [],
    },
    alternates: {
      canonical: `${baseUrl}/events/${event.slug}`,
    },
  };
}


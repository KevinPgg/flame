import { Suspense } from "react";
import type { Metadata } from "next";
import { supabaseAdmin } from "./lib/supabase/server";
import HomeContent from "./components/HomeContent";
import LoadingSpinner from "./components/LoadingSpinner";
import { generateMetadata as generateSEOMetadata } from "./lib/seo-config";
import { isProduction } from "./lib/utils/environment";
import { INTERNAL_ORG_IDS } from "@project-flame/lib";

// ISR 60-second revalidation for homepage performance
export const revalidate = 60;

export const metadata: Metadata = generateSEOMetadata({
  title: "Discover Amazing Events Worldwide",
  description:
    "Find and purchase tickets for the best concerts, festivals, workshops, and cultural events near you. Flame is a global event ticketing platform with secure checkout and instant QR code delivery.",
});

async function getHomeData() {
  if (!supabaseAdmin) {
    return { events: [] };
  }

  try {
    const now = new Date().toISOString();

    // Fetch all upcoming published events
    let eventsQuery = supabaseAdmin
      .from("events")
      .select(
        `
        id,
        name,
        slug,
        image_url,
        starts_at,
        ends_at,
        venue,
        city,
        requires_rsvp,
        currency,
        timezone,
        organizations (
          name,
          slug
        ),
        ticket_tiers (
          id,
          price_cents,
          quantity_total,
          quantity_sold,
          sales_start,
          sales_end,
          ticket_stages (
            id,
            price_cents,
            quantity,
            sold_quantity,
            order_index
          )
        )
      `
      )
      .eq("status", "published")
      .gt("ends_at", now)
      .order("starts_at", { ascending: true });

    if (isProduction()) {
      eventsQuery = eventsQuery.not(
        "organization_id",
        "in",
        `(${INTERNAL_ORG_IDS.join(",")})`
      );
    }

    const { data: events, error: eventsError } = await eventsQuery;

    if (eventsError) {
      console.error("Error fetching events for homepage:", eventsError);
    }

    return {
      events: events || [],
    };
  } catch (err) {
    console.error("Error in getHomeData:", err);
    return { events: [] };
  }
}

export default async function Home() {
  const { events } = await getHomeData();

  return (
    <Suspense fallback={<LoadingSpinner fullHeight={true} />}>
      <HomeContent initialEvents={events} />
    </Suspense>
  );
}

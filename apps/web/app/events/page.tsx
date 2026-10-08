import type { Metadata } from "next";
import { supabaseAdmin } from "../lib/supabase/server";
import EventsCatalog from "../components/EventsCatalog";
import { Navbar, Footer } from "../components";
import { generateMetadata as generateSEOMetadata } from "../lib/seo-config";
import { isProduction } from "../lib/utils/environment";
import { INTERNAL_ORG_IDS } from "@project-flame/lib";

// Force dynamic rendering — always fetch fresh data
export const revalidate = 0;

export const metadata: Metadata = generateSEOMetadata({
  title: "All Events",
  description:
    "Browse all upcoming events on Flame. Find concerts, festivals, workshops, and cultural experiences near you. Secure your tickets with instant QR code delivery.",
  url: "/events",
});

async function getEvents() {
  if (!supabaseAdmin) {
    return { events: [], organizers: [] };
  }

  try {
    const now = new Date().toISOString();

    const hideInternal = isProduction();

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

    let orgsQuery = supabaseAdmin
      .from("organizations")
      .select("id, name, slug, logo_url")
      .eq("approved", true)
      .order("name", { ascending: true })
      .limit(20);

    if (hideInternal) {
      eventsQuery = eventsQuery.not(
        "organization_id",
        "in",
        `(${INTERNAL_ORG_IDS.join(",")})`
      );
      orgsQuery = orgsQuery.not(
        "id",
        "in",
        `(${INTERNAL_ORG_IDS.join(",")})`
      );
    }

    const [eventsResult, orgsResult] = await Promise.all([
      eventsQuery,
      orgsQuery,
    ]);

    if (eventsResult.error) {
      console.error("Error fetching events:", eventsResult.error);
    }
    if (orgsResult.error) {
      console.error("Error fetching organizers:", orgsResult.error);
    }

    return {
      events: eventsResult.data || [],
      organizers: orgsResult.data || [],
    };
  } catch (err) {
    console.error("Error in getEvents:", err);
    return { events: [], organizers: [] };
  }
}

export default async function EventsPage() {
  const { events, organizers } = await getEvents();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <EventsCatalog events={events} organizers={organizers} />
      <Footer />
    </div>
  );
}

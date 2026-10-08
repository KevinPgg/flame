import type { Metadata } from "next";
import { supabaseAdmin } from "../lib/supabase/server";
import { Navbar, Footer } from "../components";
import DiscoverContent from "../components/discover/DiscoverContent";
import { generateMetadata as generateSEOMetadata } from "../lib/seo-config";
import { isProduction } from "../lib/utils/environment";
import { INTERNAL_ORG_IDS } from "@project-flame/lib";

export const revalidate = 0;

export const metadata: Metadata = generateSEOMetadata({
  title: "Discover",
  description:
    "Discover events, organizers, and experiences worldwide. Browse featured events, explore organizers, and find your next experience on Flame.",
  url: "/discover",
});

interface DiscoverEvent {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  starts_at: string;
  ends_at: string;
  venue: string;
  city: string;
  timezone: string | null;
  requires_rsvp: boolean;
  currency: string | null;
  is_featured?: boolean;
  main_featured?: boolean;
  description: string | null;
  organizations?:
    | { name: string; slug: string }
    | { name: string; slug: string }[]
    | null;
  ticket_tiers?: {
    id: string;
    price_cents: number;
    quantity_total: number;
    quantity_sold: number;
    sales_start: string | null;
    sales_end: string | null;
    ticket_stages?: {
      id: string;
      price_cents: number;
      quantity: number;
      sold_quantity: number;
      order_index: number;
    }[];
  }[];
}

interface Organizer {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

async function getDiscoverData() {
  if (!supabaseAdmin) {
    return { events: [] as DiscoverEvent[], organizers: [] as Organizer[] };
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
          timezone,
          requires_rsvp,
          currency,
          is_featured,
          main_featured,
          description,
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
      .limit(30);

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
      events: (eventsResult.data || []) as DiscoverEvent[],
      organizers: (orgsResult.data || []) as Organizer[],
    };
  } catch (err) {
    console.error("Error in getDiscoverData:", err);
    return { events: [] as DiscoverEvent[], organizers: [] as Organizer[] };
  }
}

// Cap on the Featured Events carousel — see CHANGELOG_IOS_VERSIONS.md (v1.0.13).
// Mobile mirrors this constant in `apps/mobile/hooks/useAppEvents.ts`.
const FEATURED_EVENTS_LIMIT = 10;

export default async function DiscoverPage() {
  const { events, organizers } = await getDiscoverData();

  // Featured carousel: every event flagged `is_featured`, closest first, capped at 10.
  // (DB query already orders by starts_at ASC; we just slice.)
  const featuredEvents = events
    .filter((e) => e.is_featured)
    .slice(0, FEATURED_EVENTS_LIMIT);

  const upcomingEvents = events.slice(0, 6);

  // Spotlight ("Reserve Your Spot"): a single event flagged `main_featured`.
  // Falls back to the first upcoming event so the slot never appears empty.
  // The DB enforces at most one main_featured event via idx_single_main_featured_event.
  const spotlightEvent =
    events.find((e) => e.main_featured) || upcomingEvents[0] || null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <DiscoverContent
        upcomingEvents={upcomingEvents}
        featuredEvents={featuredEvents}
        spotlightEvent={spotlightEvent}
        organizers={organizers}
      />
      <Footer />
    </div>
  );
}

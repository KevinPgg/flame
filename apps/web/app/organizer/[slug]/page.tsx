import { notFound } from "next/navigation";
import { supabaseAdmin } from "../../lib/supabase/server";
import NavbarWrapper from "../../components/NavbarWrapper";
import OrganizerPublicView from "../../components/organizer/OrganizerPublicView";
import { mapEventToCardData, type EventCardData } from "../../lib/map-event-to-card";
import type { Event } from "@project-flame/lib";

export const revalidate = 60;

interface PageProps {
  params: Promise<{ slug: string }>;
}

interface PublicOrgData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  city: string | null;
  instagram_handle: string | null;
  logo_url: string | null;
}

export default async function OrganizerPublicPage({ params }: PageProps) {
  const { slug } = await params;
  const trimmedSlug = slug?.trim();

  if (!trimmedSlug || !supabaseAdmin) {
    notFound();
  }

  const { data: orgRaw } = await supabaseAdmin
    .from("organizations")
    .select("id, name, slug, description, city, instagram_handle, logo_url, approved")
    .eq("slug", trimmedSlug)
    .maybeSingle();

  if (!orgRaw || !orgRaw.approved) {
    notFound();
  }

  const org: PublicOrgData = {
    id: orgRaw.id,
    name: orgRaw.name,
    slug: orgRaw.slug,
    description: orgRaw.description ?? null,
    city: orgRaw.city ?? null,
    instagram_handle: orgRaw.instagram_handle ?? null,
    logo_url: orgRaw.logo_url ?? null,
  };

  // Events the org owns OR co-hosts. Co-host event IDs come from
  // event_assignments where cohost_organization_id = org.id.
  const { data: cohostRows } = await supabaseAdmin
    .from("event_assignments")
    .select("event_id")
    .eq("cohost_organization_id", org.id);

  const cohostEventIds = (cohostRows ?? []).map(r => r.event_id as string);

  const eventsSelect = `
        id,
        name,
        slug,
        image_url,
        starts_at,
        ends_at,
        venue,
        city,
        timezone,
        currency,
        requires_rsvp,
        organization_id,
        organizations ( name, slug ),
        ticket_tiers (
          id,
          price_cents,
          quantity_total,
          quantity_sold,
          sales_start,
          sales_end
        )
      `;

  const eventsQuery = supabaseAdmin
    .from("events")
    .select(eventsSelect)
    .eq("status", "published");

  const { data: eventsRaw } =
    cohostEventIds.length > 0
      ? await eventsQuery
          .or(`organization_id.eq.${org.id},id.in.(${cohostEventIds.join(",")})`)
          .order("starts_at", { ascending: true })
      : await eventsQuery
          .eq("organization_id", org.id)
          .order("starts_at", { ascending: true });

  const now = Date.now();
  const allEvents = (eventsRaw ?? []) as unknown as Event[];

  const currentEvents: EventCardData[] = [];
  const pastEvents: EventCardData[] = [];

  for (const e of allEvents) {
    const card = mapEventToCardData(e);
    const endsAtMs = e.ends_at ? new Date(e.ends_at).getTime() : null;
    const startsAtMs = e.starts_at ? new Date(e.starts_at).getTime() : 0;
    const isPast = endsAtMs ? endsAtMs <= now : startsAtMs <= now;
    if (isPast) pastEvents.push(card);
    else currentEvents.push(card);
  }
  pastEvents.reverse();

  return (
    <div className="min-h-screen bg-background">
      <NavbarWrapper />
      <main className="pt-16">
        <div className="max-w-[800px] mx-auto px-4 py-6">
          <OrganizerPublicView
            org={org}
            currentEvents={currentEvents}
            pastEvents={pastEvents}
          />
        </div>
      </main>
    </div>
  );
}

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import EventDetail from "../../../../components/EventDetail";
import { generateEventSchema } from "../../../../lib/seo-config";
import { getEventBySlug, eventPageMetadata } from "../../../../lib/event-page";
import { getHomeEvents, type HomeEvent } from "../../../../lib/home-events";
import { AttendeeShell } from "../../AttendeeShell";
import { EventHeader, EventTopBar } from "./EventHeader";
import { MoreFromOrganizer } from "./MoreFromOrganizer";
import { OpenInApp } from "./OpenInApp";

/**
 * Flame 2.0 event page (fase 2.4), served at /events/[slug] by the middleware rewrite (same
 * public URL). Same data, metadata and structured data as the v1 page (app/lib/event-page);
 * public and indexable (the v2 layout's noindex is overridden). Decision 1a: new surroundings,
 * the v1 purchase block (EventDetail) inside unchanged until fase 3.
 */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { ...(await eventPageMetadata(slug)), robots: { index: true, follow: true } };
}

export default async function EventPageV2({ params }: Props) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();

  let more: HomeEvent[] = [];
  try {
    more = (await getHomeEvents()).filter((e) => e.organizations?.slug === event.organizations?.slug && e.id !== event.id).slice(0, 6);
  } catch {
    more = []; // the page works without this row
  }

  return (
    <AttendeeShell active={null} hideTabBar>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(generateEventSchema(event)) }} />
      <EventDetail event={event} header={
          <>
            <EventTopBar slug={event.slug} name={event.name} />
            <EventHeader event={event} />
            <OpenInApp slug={event.slug} />
          </>
        } footer={<MoreFromOrganizer organizer={event.organizations?.name ?? ""} events={more} />} />
    </AttendeeShell>
  );
}

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Navbar, Footer } from "../../components";
import EventDetail from "../../components/EventDetail";
import { generateEventSchema } from "../../lib/seo-config";
import { getEventBySlug, eventPageMetadata } from "../../lib/event-page";

// Use ISR with 30-second revalidation for optimal performance
// Combined with:
// - On-demand revalidation (when inventory changes: holds created/purchased/cancelled)
// - Client-side polling (every 10 seconds for active users)
// This provides excellent freshness while reducing server load by 6x vs 5-second ISR
export const revalidate = 30;

interface EventPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({ params }: EventPageProps): Promise<Metadata> {
  const { slug } = await params;
  return eventPageMetadata(slug);
}

export default async function EventPage({ params }: EventPageProps) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);

  if (!event) {
    notFound();
  }

  // Generate structured data for the event
  const eventSchema = generateEventSchema(event);

  return (
    <div className="bg-background min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(eventSchema),
        }}
      />
      <Navbar />
      <EventDetail event={event} />
      <Footer />
    </div>
  );
}

"use client";

import { HeroCarousel } from "./HeroCarousel";
import { EventsSection } from "./EventsSection";
import { ExploreOrganizers } from "../ExploreOrganizers";
import { SpotlightCard } from "./SpotlightCard";
import { HostBanner } from "./HostBanner";
import { FAQSection } from "./FAQSection";
import type { DiscoverEvent, DiscoverOrganizer } from "./types";

interface DiscoverContentProps {
  upcomingEvents: DiscoverEvent[];
  featuredEvents: DiscoverEvent[];
  spotlightEvent: DiscoverEvent | null;
  organizers: DiscoverOrganizer[];
}

export default function DiscoverContent({
  upcomingEvents,
  featuredEvents,
  spotlightEvent,
  organizers,
}: DiscoverContentProps) {
  const hasEvents =
    upcomingEvents.length > 0 ||
    featuredEvents.length > 0 ||
    !!spotlightEvent;

  return (
    <main className="pt-20 min-h-screen bg-background">
      <div className="max-w-[800px] mx-auto">
        {/* 1. Hero Carousel */}
        <HeroCarousel events={upcomingEvents} />

        <div className="flex flex-col gap-[30px] mt-[30px]">
          {/* 2. Partner Logos — TODO: restore when we have more clients */}
          {/* <PartnerLogos /> */}

          {/* Empty state */}
          {!hasEvents && (
            <div className="py-8 px-6 flex flex-col items-center">
              <h3 className="text-white-100 font-poppins-semibold text-lg text-center m-0">
                No events available
              </h3>
              <p className="text-white-50 text-center text-sm font-poppins mt-2 m-0">
                Check back soon for upcoming events.
              </p>
            </div>
          )}

          {/* 3. Featured Events */}
          <EventsSection title="Featured Events" events={featuredEvents} />

          {/* 4. Explore Organizers */}
          <ExploreOrganizers organizers={organizers} />

          {/* 5. Spotlight */}
          <SpotlightCard event={spotlightEvent} />

          {/* 6. Host Banner */}
          <HostBanner />

          {/* 7. Upcoming Events */}
          <EventsSection title="Upcoming Events" events={upcomingEvents} />

          {/* 8. FAQ Section */}
          <FAQSection />
        </div>
      </div>
    </main>
  );
}

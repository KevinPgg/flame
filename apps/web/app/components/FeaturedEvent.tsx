"use client";

import { useRouter } from "next/navigation";
import { Event } from "../lib/types/event";
import { LinkifiedText } from "../lib/utils/linkify-text";

interface FeaturedEventProps {
  initialEvent?: Event | null;
}

export default function FeaturedEvent({ initialEvent }: FeaturedEventProps) {
  const router = useRouter();

  // Show nothing if no featured event
  if (!initialEvent) {
    return null;
  }

  const featuredEvent = initialEvent;

  const handleReserveSpot = () => {
    router.push(`/events/${featuredEvent.slug}`);
  };

  // Format the date to be more readable
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  // Format the time
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <section className="py-10 md:py-14 bg-background">
      <div className="max-w-[800px] mx-auto px-4">
        <div className="bg-card border border-white-30 rounded-card backdrop-blur-md overflow-hidden">
          <div className="relative">
            {/* Image - aspect 4/5, max 480px height on desktop */}
            <div className="relative aspect-[4/5] max-h-[480px] overflow-hidden">
              <img
                src={featuredEvent.image_url}
                alt={featuredEvent.name}
                className="w-full h-full object-cover"
              />
              {/* Gradient overlay bottom-to-top */}
              <div
                className="absolute inset-0 bg-linear-to-t from-surface via-surface/70 to-transparent"
                aria-hidden="true"
              />
              {/* Badge + date overlay top */}
              <div className="absolute top-3 left-3 right-3 flex justify-between items-start">
                <span className="bg-primary text-white-100 px-3 py-1.5 text-xs font-poppins-medium uppercase tracking-wider rounded-badge">
                  Featured Event
                </span>
                <div className="text-right">
                  <span className="block text-white-100 text-sm font-poppins-medium">
                    {formatDate(featuredEvent.starts_at)}
                  </span>
                  <span className="block text-white-50 text-xs">
                    {formatTime(featuredEvent.starts_at)}
                  </span>
                </div>
              </div>
              {/* Content overlay bottom */}
              <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6">
                <h2 className="text-white-100 font-poppins-bold text-2xl mb-2">
                  {featuredEvent.name}
                </h2>
                <p className="text-white-80 text-sm line-clamp-2 mb-4">
                  <LinkifiedText text={featuredEvent.description} />
                </p>
                <button
                  type="button"
                  onClick={handleReserveSpot}
                  className="inline-flex items-center gap-2 bg-white-100 text-dark px-6 py-3 rounded-pill font-poppins-medium text-sm hover:bg-white-80 transition-colors"
                >
                  <span>Reserve Your Spot</span>
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="shrink-0"
                  >
                    <path
                      d="M7 17L17 7M17 7H7M17 7V17"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

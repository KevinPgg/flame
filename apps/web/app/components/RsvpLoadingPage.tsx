"use client";

interface RsvpLoadingPageProps {
  type: "loading-rsvps" | "loading-dashboard";
  rsvpCount?: number;
  eventName?: string;
}

export default function RsvpLoadingPage({
  type,
  rsvpCount,
  eventName,
}: RsvpLoadingPageProps) {
  const getLoadingContent = () => {
    switch (type) {
      case "loading-rsvps":
        return {
          title: `Loading ${rsvpCount || 0} RSVPs`,
          subtitle: eventName
            ? `For ${eventName}`
            : "Preparing RSVP management",
        };
      case "loading-dashboard":
        return {
          title: "Loading RSVP Management",
          subtitle: "Returning to dashboard",
        };
      default:
        return {
          title: "Loading...",
          subtitle: undefined,
        };
    }
  };

  const content = getLoadingContent();

  return (
    <div className="max-w-[800px] mx-auto px-4 flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full w-8 h-8 border-2 border-white-20 border-t-white-100" />
        <h1 className="text-white-100 font-poppins-semibold text-xl">{content.title}</h1>
        {content.subtitle && (
          <p className="text-white-50 text-sm font-poppins">{content.subtitle}</p>
        )}
      </div>
    </div>
  );
}

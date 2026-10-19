/**
 * SEO Configuration for Flame
 * Centralized metadata and SEO settings
 *
 * SEO Best Practices:
 * - Meta keywords are NOT used by major search engines (deprecated since 2009)
 * - Focus on: quality content, page titles, descriptions, structured data (JSON-LD)
 * - This file prioritizes what actually affects ranking
 */

import { coreKeywords } from "./seo-keywords";

export const siteConfig = {
  name: "Flame",
  description:
    "Discover and buy tickets for concerts, music festivals, workshops, cultural events, and nightlife worldwide. Flame is a global event ticketing platform with secure QR code entry, instant digital delivery, easy checkout, and promo code support. Find the best upcoming events near you, wherever you are.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://flme.co",
  ogImage: "/flame-hero.jpg",
  // Note: Meta keywords have minimal SEO impact but kept for legacy/compatibility
  // For full keyword system see seo-keywords.ts (used for content generation, internal search)
  keywords: coreKeywords,
  locale: "en_US",
  alternateLocales: ["es"],
  social: {
    twitter: "flame_ec", // Update with actual handle
    facebook: "flame.ec", // Update with actual handle
    instagram: "flame.ec", // Update with actual handle
  },
  creator: "Flame",
  publisher: "Flame",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large" as const,
      "max-snippet": -1,
    },
  },
};

export function generateMetadata({
  title,
  description,
  image,
  url,
  noIndex = false,
}: {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  noIndex?: boolean;
}) {
  const pageTitle = title ? `${title} | ${siteConfig.name}` : siteConfig.name;
  const pageDescription = description || siteConfig.description;
  const pageImage = image || siteConfig.ogImage;
  const pageUrl = url ? `${siteConfig.url}${url}` : siteConfig.url;

  return {
    title: pageTitle,
    description: pageDescription,
    keywords: siteConfig.keywords,
    authors: [{ name: siteConfig.creator }],
    creator: siteConfig.creator,
    publisher: siteConfig.publisher,
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    metadataBase: new URL(siteConfig.url),
    alternates: {
      canonical: pageUrl,
    },
    robots: noIndex
      ? {
          index: false,
          follow: false,
        }
      : siteConfig.robots,
    openGraph: {
      type: "website",
      locale: siteConfig.locale,
      url: pageUrl,
      title: pageTitle,
      description: pageDescription,
      siteName: siteConfig.name,
      images: [
        {
          url: pageImage,
          width: 1200,
          height: 630,
          alt: title || siteConfig.name,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description: pageDescription,
      images: [pageImage],
      creator: siteConfig.social.twitter,
    },
    other: {
      "apple-mobile-web-app-title": "FLAME",
    },
  };
}

// JSON-LD structured data for organization
export const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: siteConfig.name,
  url: siteConfig.url,
  logo: `${siteConfig.url}/flame-hero.jpg`,
  description: siteConfig.description,
  sameAs: [
    `https://twitter.com/${siteConfig.social.twitter}`,
    `https://facebook.com/${siteConfig.social.facebook}`,
    `https://instagram.com/${siteConfig.social.instagram}`,
  ],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "Customer Service",
    availableLanguage: ["Spanish", "English"],
  },
};

// Helper to generate event JSON-LD
export function generateEventSchema(event: any) {
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.description,
    image: event.image_url,
    startDate: event.starts_at,
    endDate: event.ends_at,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode:
      event.venue_type === "online"
        ? "https://schema.org/OnlineEventAttendanceMode"
        : "https://schema.org/OfflineEventAttendanceMode",
    location:
      event.venue_type === "online"
        ? {
            "@type": "VirtualLocation",
            url: siteConfig.url,
          }
        : {
            "@type": "Place",
            name: event.venue,
            address: {
              "@type": "PostalAddress",
              addressLocality: event.city,
              // `addressCountry` is intentionally omitted until a `country`
              // column is added to the `events` table. Schema.org treats it as
              // optional; Google will infer country from `addressLocality`.
              // See docs/historico/todos/EDGE_CASES_TODOS.MD — add per-event country for
              // geo-targeted event rich results.
              ...(event.country ? { addressCountry: event.country } : {}),
            },
          },
    organizer: {
      "@type": "Organization",
      name: event.organizations?.name || "Flame",
      url: siteConfig.url,
    },
    offers:
      event.ticket_tiers?.map((tier: any) => ({
        "@type": "Offer",
        name: tier.name,
        price: (tier.price_cents / 100).toFixed(2),
        // Currency is event-level across the codebase (EventCard, SpotlightCard,
        // purchase/success, OrgEventDetailClient all read `event.currency`).
        // Uppercase defensively — Schema.org requires ISO 4217 in uppercase and
        // some tables (e.g. `payments`) store the code lowercase.
        priceCurrency: (event.currency || "USD").toUpperCase(),
        availability:
          tier.quantity_sold >= tier.quantity_total
            ? "https://schema.org/SoldOut"
            : "https://schema.org/InStock",
        url: `${siteConfig.url}/events/${event.slug}`,
        validFrom: tier.sales_start || event.created_at,
        validThrough: tier.sales_end || event.ends_at,
      })) || [],
  };
}

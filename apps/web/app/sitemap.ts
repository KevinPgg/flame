import { MetadataRoute } from "next";
import { supabaseAdmin } from "./lib/supabase/server";
import { isProduction } from "./lib/utils/environment";
import { INTERNAL_ORG_IDS } from "@project-flame/lib";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://flme.co";

  // Static pages - using fixed dates to avoid SEO crawl budget waste
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date("2025-10-28"),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/events`,
      lastModified: new Date("2025-10-28"),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/discover`,
      lastModified: new Date("2026-04-21"),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/about-flame`,
      lastModified: new Date("2025-10-28"),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: new Date("2025-10-28"),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/faqs`,
      lastModified: new Date("2026-04-08"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/privacy-policy`,
      lastModified: new Date("2026-03-31"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms-of-use`,
      lastModified: new Date("2026-03-31"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/purchase-terms`,
      lastModified: new Date("2026-03-31"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/cookie-settings`,
      lastModified: new Date("2026-03-31"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/organizer-agreement`,
      lastModified: new Date("2026-03-31"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  // Dynamic event pages
  let eventPages: MetadataRoute.Sitemap = [];

  if (supabaseAdmin) {
    try {
      let sitemapQuery = supabaseAdmin
        .from("events")
        .select("slug, updated_at")
        .eq("status", "published")
        .order("updated_at", { ascending: false });

      if (isProduction()) {
        sitemapQuery = sitemapQuery.not(
          "organization_id",
          "in",
          `(${INTERNAL_ORG_IDS.join(",")})`
        );
      }

      const { data: events } = await sitemapQuery;

      if (events) {
        eventPages = events.map(event => ({
          url: `${baseUrl}/events/${event.slug}`,
          lastModified: new Date(event.updated_at),
          changeFrequency: "daily" as const,
          priority: 0.8,
        }));
      }
    } catch (error) {
      console.error("Error fetching events for sitemap:", error);
    }
  }

  return [...staticPages, ...eventPages];
}

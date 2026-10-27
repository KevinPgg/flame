import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicOrganizer } from "../../../../lib/organizer-public";
import { siteConfig } from "../../../../lib/seo-config";
import { AttendeeShell } from "../../AttendeeShell";
import OrganizerProfile from "./OrganizerProfile";

/**
 * Flame 2.0 public organizer profile (fase 2.4), served at /organizer/[slug] by the middleware
 * rewrite (the organizer's own screens /organizer/settings|team|rsvps|event stay out). Public and
 * indexable. Followers / Follow are fase 4 and don't show.
 */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicOrganizer(slug);
  if (!data) return { title: "Organizer not found" };
  const { org } = data;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || siteConfig.url;
  const description = (org.description || `Events by ${org.name} on Flame.`).substring(0, 160);
  return {
    title: `${siteConfig.name} | ${org.name}`,
    description,
    robots: { index: true, follow: true },
    openGraph: {
      title: `${siteConfig.name} | ${org.name}`,
      description,
      url: `${baseUrl}/organizer/${org.slug}`,
      images: org.cover_image_url || org.logo_url ? [{ url: (org.cover_image_url || org.logo_url)!, alt: org.name }] : [],
      siteName: "Flame",
    },
    alternates: { canonical: `${baseUrl}/organizer/${org.slug}` },
  };
}

export default async function OrganizerPageV2({ params }: Props) {
  const { slug } = await params;
  const data = await getPublicOrganizer(slug);
  if (!data) notFound();
  return (
    <AttendeeShell active={null}>
      <OrganizerProfile org={data.org} upcoming={data.upcoming} past={data.past} />
    </AttendeeShell>
  );
}

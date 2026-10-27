import type { Metadata } from "next";
import { generateMetadata as generateSEOMetadata } from "../../../lib/seo-config";
import { getHomeEvents, type HomeEvent } from "../../../lib/home-events";
import { AttendeeShell } from "../AttendeeShell";
import HomeView from "./HomeView";
import { Suspense } from "react";
import { OnboardingFromUrl } from "../OnboardingFromUrl";

/**
 * Flame 2.0 Home (fase 2.2), served at `/` by the middleware rewrite (decision 2026-10-27:
 * same public URLs). Public and indexable: the v2 layout's noindex is overridden here with the
 * same SEO metadata as the v1 home.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = generateSEOMetadata({
  title: "Discover Amazing Events Worldwide",
  description:
    "Find and purchase tickets for the best concerts, festivals, workshops, and cultural events near you. Flame is a global event ticketing platform with secure checkout and instant QR code delivery.",
});

export default async function HomePage() {
  let events: HomeEvent[] = [];
  let failed = false;
  try {
    events = await getHomeEvents();
  } catch {
    failed = true;
  }
  return (
    <AttendeeShell active="home">
      <HomeView events={events} failed={failed} />
      <Suspense fallback={null}>
        <OnboardingFromUrl />
      </Suspense>
    </AttendeeShell>
  );
}

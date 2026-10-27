import type { Metadata } from "next";
import { generateMetadata as generateSEOMetadata } from "../../../lib/seo-config";
import { getHomeEvents, type HomeEvent } from "../../../lib/home-events";
import { getExploreOrganizers, type ExploreOrganizer } from "../../../lib/explore-data";
import { AttendeeShell } from "../AttendeeShell";
import ExploreView from "./ExploreView";

/**
 * Flame 2.0 Explore (fase 2.5), served at /discover by the middleware rewrite. Public and
 * indexable with the v1 /discover metadata.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = generateSEOMetadata({
  title: "Discover",
  description:
    "Discover events, organizers, and experiences worldwide. Browse featured events, explore organizers, and find your next experience on Flame.",
  url: "/discover",
});

export default async function ExplorePage() {
  let events: HomeEvent[] = [];
  let organizers: ExploreOrganizer[] = [];
  let failed = false;
  const [ev, org] = await Promise.allSettled([getHomeEvents(), getExploreOrganizers()]);
  if (ev.status === "fulfilled") events = ev.value;
  else failed = true;
  if (org.status === "fulfilled") organizers = org.value;
  return (
    <AttendeeShell active="explore">
      <ExploreView events={events} organizers={organizers} failed={failed} />
    </AttendeeShell>
  );
}

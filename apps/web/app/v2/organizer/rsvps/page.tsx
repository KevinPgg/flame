import { loadOrganizerContext } from "../../lib/organizer-context";
import RsvpEvents from "./RsvpEvents";

/** /v2/organizer/rsvps?org={slug} — events that take RSVP requests, with how many are waiting. */
export const dynamic = "force-dynamic";

export default async function RsvpEventsPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const { org } = await searchParams;
  const ctx = await loadOrganizerContext(org);
  return <RsvpEvents {...ctx} />;
}

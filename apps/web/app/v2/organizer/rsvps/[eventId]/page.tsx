import { loadOrganizerContext } from "../../../lib/organizer-context";
import RsvpEventDetail from "./RsvpEventDetail";

/** /v2/organizer/rsvps/{eventId}?org={slug} — review, approve and reject one event's requests. */
export const dynamic = "force-dynamic";

export default async function RsvpEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ org?: string }>;
}) {
  const { eventId } = await params;
  const { org } = await searchParams;
  const ctx = await loadOrganizerContext(org);
  return <RsvpEventDetail eventId={eventId} {...ctx} />;
}

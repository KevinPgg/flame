/** /v2/organizer/rsvps/{eventId}?org={slug} — one event's RSVP requests (fase 1b.3). */
import { useLocalSearchParams } from "expo-router";
import { OrganizerRoute, firstParam } from "../../../../components/v2/OrganizerRoute";
import { RsvpEventDetail } from "../../../../components/v2/rsvps/RsvpEventDetail";

export default function RsvpEventScreen() {
  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const eventId = firstParam(params.eventId) ?? "";
  return <OrganizerRoute>{(organization) => <RsvpEventDetail key={eventId} eventId={eventId} organization={organization} />}</OrganizerRoute>;
}

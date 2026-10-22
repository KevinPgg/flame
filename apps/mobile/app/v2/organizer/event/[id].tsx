/** /v2/organizer/event/{id}?org={slug}[&tab=…] — event management in the app (fase 1b.2). */
import { useLocalSearchParams } from "expo-router";
import { OrganizerRoute, firstParam } from "../../../../components/v2/OrganizerRoute";
import { EventAdmin } from "../../../../components/v2/event/EventAdmin";

export default function EventAdminScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = firstParam(params.id) ?? "";
  return <OrganizerRoute>{(organization) => <EventAdmin key={eventId} eventId={eventId} organization={organization} />}</OrganizerRoute>;
}

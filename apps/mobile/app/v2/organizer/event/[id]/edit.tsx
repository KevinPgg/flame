/** /v2/organizer/event/{id}/edit?org={slug} — edit event in the app (fase 1b.4). */
import { useLocalSearchParams } from "expo-router";
import { OrganizerRoute, firstParam } from "../../../../../components/v2/OrganizerRoute";
import { EditEvent } from "../../../../../components/v2/eventForm/EditEvent";

export default function EditEventScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = firstParam(params.id) ?? "";
  return <OrganizerRoute>{(organization) => <EditEvent key={eventId} eventId={eventId} organization={organization} />}</OrganizerRoute>;
}

/** /v2/organizer/event/{id}/tiers/{tierId|new}?org={slug} — tier editor in the app (fase 1b.4). */
import { useLocalSearchParams } from "expo-router";
import { OrganizerRoute, firstParam } from "../../../../../../components/v2/OrganizerRoute";
import { TierEditor } from "../../../../../../components/v2/eventForm/TierEditor";

export default function TierEditorScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; tierId?: string | string[] }>();
  const eventId = firstParam(params.id) ?? "";
  const tierId = firstParam(params.tierId) ?? "";
  return <OrganizerRoute>{(organization) => <TierEditor key={`${eventId}:${tierId}`} eventId={eventId} tierId={tierId} organization={organization} />}</OrganizerRoute>;
}

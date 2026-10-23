/** /v2/organizer/create?org={slug} — create event in the app (fase 1b.4). */
import { OrganizerRoute } from "../../../components/v2/OrganizerRoute";
import { CreateEvent } from "../../../components/v2/eventForm/CreateEvent";

export default function CreateEventScreen() {
  return <OrganizerRoute>{(organization) => <CreateEvent key={organization.id} organization={organization} />}</OrganizerRoute>;
}

/** /v2/organizer/rsvps?org={slug} — RSVP events of the organization (fase 1b.3). */
import { OrganizerRoute } from "../../../../components/v2/OrganizerRoute";
import { RsvpEvents } from "../../../../components/v2/rsvps/RsvpEvents";

export default function RsvpEventsScreen() {
  return <OrganizerRoute>{(organization) => <RsvpEvents key={organization.id} organization={organization} />}</OrganizerRoute>;
}

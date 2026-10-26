/** /v2/organizer/team?org={slug} — team of the organization (fase 1b.5, from Manage). */
import { OrganizerRoute } from "../../../components/v2/OrganizerRoute";
import { TeamScreen } from "../../../components/v2/manage/TeamScreen";

export default function TeamRoute() {
  return <OrganizerRoute>{(organization) => <TeamScreen key={organization.id} organization={organization} />}</OrganizerRoute>;
}

/** /v2/organizer/settings?org={slug} — organization settings (fase 1b.5, from Manage). */
import { OrganizerRoute } from "../../../components/v2/OrganizerRoute";
import { OrgSettingsScreen } from "../../../components/v2/manage/OrgSettingsScreen";

export default function OrgSettingsRoute() {
  return <OrganizerRoute>{(organization) => <OrgSettingsScreen key={organization.id} organization={organization} />}</OrganizerRoute>;
}

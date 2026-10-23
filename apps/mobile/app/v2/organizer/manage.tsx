/** /v2/organizer/manage?org={slug} — "Manage organization" hub (owner/admin). */
import { OrganizerRoute } from "../../../components/v2/OrganizerRoute";
import { ManageHub } from "../../../components/v2/ManageHub";

export default function ManageScreen() {
  return <OrganizerRoute>{(organization) => <ManageHub key={organization.id} organization={organization} />}</OrganizerRoute>;
}

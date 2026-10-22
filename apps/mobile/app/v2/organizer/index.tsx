/**
 * /v2/organizer?org={slug} (or ?orgId=, v1 links) — organizer dashboard in the app (fase 1b).
 * "My organizers" itself stays in the profile screen in the app.
 */
import { OrganizerRoute } from "../../../components/v2/OrganizerRoute";
import { OrganizerDashboard } from "../../../components/v2/OrganizerDashboard";

export default function OrganizerScreen() {
  // key: switching organizations resets tabs and search.
  return <OrganizerRoute>{(organization) => <OrganizerDashboard key={organization.id} organization={organization} />}</OrganizerRoute>;
}

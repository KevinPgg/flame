/** /v2/organizer/finance?org={slug} — organization totals and revenue by event (from Manage, 2026-11-02). */
import { OrganizerRoute } from "../../../components/v2/OrganizerRoute";
import { FinanceScreen } from "../../../components/v2/manage/FinanceScreen";

export default function FinanceRoute() {
  return <OrganizerRoute>{(organization) => <FinanceScreen key={organization.id} organization={organization} />}</OrganizerRoute>;
}

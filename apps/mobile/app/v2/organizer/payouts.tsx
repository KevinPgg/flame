/** /v2/organizer/payouts?org={slug} — Stripe balance and payouts (fase 1b.5, from Manage). */
import { OrganizerRoute } from "../../../components/v2/OrganizerRoute";
import { PayoutsScreen } from "../../../components/v2/manage/PayoutsScreen";

export default function PayoutsRoute() {
  return <OrganizerRoute>{(organization) => <PayoutsScreen key={organization.id} organization={organization} />}</OrganizerRoute>;
}

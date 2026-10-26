/** /v2/support/organizations — organizer approvals for Flame support (fase 1b.7, estilo 2.0). */
import { RequireAuthGate } from "../../../hooks/useRequireAuth";
import { OrgApprovals } from "../../../components/v2/support/OrgApprovals";

export default function OrgApprovalsScreen() {
  return (
    <RequireAuthGate>
      <OrgApprovals />
    </RequireAuthGate>
  );
}

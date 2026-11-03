import { redirect } from "next/navigation";
import { canManagePayouts } from "@project-flame/lib";
import { loadOrganizerContext } from "../../lib/organizer-context";
import { routes } from "../../lib/routes";
import FinanceView from "./FinanceView";

/** /v2/organizer/finance?org={slug} — prototype "ow:finance". Owners and admins (it shows the payout balance). */
export const dynamic = "force-dynamic";

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const { org } = await searchParams;
  const ctx = await loadOrganizerContext(org);
  if (!canManagePayouts(ctx.role)) redirect(routes.dashboard(ctx.organization.slug));
  return <FinanceView {...ctx} />;
}

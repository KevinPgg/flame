import { redirect } from "next/navigation";
import { canManagePayouts } from "@project-flame/lib";
import { loadOrganizerContext } from "../../lib/organizer-context";
import { routes } from "../../lib/routes";
import PayoutsView from "./PayoutsView";

/**
 * /v2/organizer/payouts?org={slug}[&connect=success] — prototype "ow:payouts". Owners and admins
 * (same rule as the Stripe Connect and payout APIs).
 */
export const dynamic = "force-dynamic";

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<{ org?: string; connect?: string }> }) {
  const { org, connect } = await searchParams;
  const ctx = await loadOrganizerContext(org);
  if (!canManagePayouts(ctx.role)) redirect(routes.dashboard(ctx.organization.slug));
  return <PayoutsView {...ctx} justConnected={connect === "success"} />;
}

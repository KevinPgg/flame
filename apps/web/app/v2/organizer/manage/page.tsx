import { redirect } from "next/navigation";
import { canAccessOrgSettings } from "@project-flame/lib";
import { loadOrganizerContext } from "../../lib/organizer-context";
import { routes } from "../../lib/routes";
import ManageView from "./ManageView";

/** /v2/organizer/manage?org={slug} — "Manage organization" hub (owner / admin), like the app. */
export const dynamic = "force-dynamic";

export default async function ManagePage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const { org } = await searchParams;
  const ctx = await loadOrganizerContext(org);
  if (!canAccessOrgSettings(ctx.role)) redirect(routes.dashboard(ctx.organization.slug));
  return <ManageView {...ctx} />;
}

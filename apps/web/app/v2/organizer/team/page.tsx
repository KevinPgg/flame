import { redirect } from "next/navigation";
import { canManageMembers } from "@project-flame/lib";
import { loadOrganizerContext } from "../../lib/organizer-context";
import { routes } from "../../lib/routes";
import TeamView from "./TeamView";

/** /v2/organizer/team?org={slug} — owners and admins (same rule as /api/organizations/[id]/members). */
export const dynamic = "force-dynamic";

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const { org } = await searchParams;
  const ctx = await loadOrganizerContext(org);
  if (!canManageMembers(ctx.role)) redirect(routes.dashboard(ctx.organization.slug));
  return <TeamView {...ctx} />;
}

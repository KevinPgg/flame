import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import type { OrgMemberRole } from "@project-flame/lib";
import { selectOrganization } from "../../lib/utils/organization-selection";
import OrganizersList from "./OrganizersList";
import OrganizerDashboard from "./OrganizerDashboard";
import { routes } from "../lib/routes";

/**
 * /v2/organizer            → "My organizers"
 * /v2/organizer?org={slug} → that organizer's dashboard
 * Same query scheme as v1 (/organizer?org=), so links keep working when /v2 is dropped.
 */
export const dynamic = "force-dynamic";

export default async function OrganizerPageV2({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { org } = await searchParams;
  if (!org) return <OrganizersList />;

  // Same server-side checks as v1: membership + approval decide what you can open.
  let selection;
  try {
    selection = await selectOrganization(userId, org);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "No organization found") redirect("/?onboarding=true");
    // Only pending organizers: the list shows them as "Pending approval".
    if (message === "No approved organization found") redirect(routes.organizers());
    throw error;
  }

  const { organization, allOrganizations } = selection;
  // selectOrganization falls back to the first approved org on an unknown slug: fix the URL.
  if (organization.slug !== org) redirect(routes.dashboard(organization.slug));

  const role = (allOrganizations.find((o) => o.id === organization.id)?.role ?? null) as
    | OrgMemberRole
    | null;

  return (
    <OrganizerDashboard
      organization={{
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logo_url: organization.logo_url ?? null,
      }}
      role={role}
      organizations={allOrganizations
        .filter((o) => o.approved)
        .map((o) => ({ id: o.id, name: o.name, slug: o.slug, logo_url: o.logo_url ?? null }))}
    />
  );
}

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import type { OrgMemberRole } from "@project-flame/lib";
import { selectOrganization } from "../../../../lib/utils/organization-selection";
import { routes } from "../../../lib/routes";
import EventAdmin from "./EventAdmin";

/** /v2/organizer/event/{id}?org={slug}[&tab=…] — Flame 2.0 event management. */
export const dynamic = "force-dynamic";

export default async function EventAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ org?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id } = await params;
  const { org } = await searchParams;
  if (!org) redirect(routes.organizers());

  let selection;
  try {
    selection = await selectOrganization(userId, org);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "No organization found") redirect("/?onboarding=true");
    if (message === "No approved organization found") redirect(routes.organizers());
    throw error;
  }
  const { organization, allOrganizations } = selection;
  if (organization.slug !== org) redirect(routes.dashboard(organization.slug));
  const role = (allOrganizations.find((o) => o.id === organization.id)?.role ?? null) as OrgMemberRole | null;

  return (
    <EventAdmin
      eventId={id}
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

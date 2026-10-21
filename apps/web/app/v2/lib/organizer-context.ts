import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import type { OrgMemberRole } from "@project-flame/lib";
import { selectOrganization } from "../../lib/utils/organization-selection";
import { routes } from "./routes";
import type { Org } from "../organizer/useOrganizerModel";
import type { ShellUser } from "../organizer/OrganizerShell";

/**
 * Server side of every v2 organizer page: signed in, member of an approved organization (same
 * checks as v1), canonical `?org=` slug, the member's role, and who is signed in. Redirects otherwise.
 */
export async function loadOrganizerContext(org: string | undefined): Promise<{
  organization: Org;
  organizations: Org[];
  role: OrgMemberRole | null;
  /** Signed-in person for the sidebar / top bar (null if Clerk can't be read). */
  me: ShellUser | null;
}> {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
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
  const toOrg = (o: { id: string; name: string; slug: string; logo_url?: string | null }): Org => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    logo_url: o.logo_url ?? null,
  });
  const me = await loadMe();
  return {
    me,
    organization: toOrg(organization),
    organizations: allOrganizations.filter((o) => o.approved).map(toOrg),
    role: (allOrganizations.find((o) => o.id === organization.id)?.role ?? null) as OrgMemberRole | null,
  };
}

/** Who is signed in, for the shell and the account page (null if Clerk can't be read). */
export async function loadMe(): Promise<ShellUser | null> {
  const user = await currentUser().catch(() => null);
  return user
    ? {
        name:
          [user.firstName, user.lastName].filter(Boolean).join(" ") ||
          user.username ||
          user.emailAddresses?.[0]?.emailAddress ||
          "",
        imageUrl: user.imageUrl ?? null,
        email: (user.primaryEmailAddress?.emailAddress ?? user.emailAddresses?.[0]?.emailAddress ?? "").toLowerCase() || null,
      }
    : null;
}

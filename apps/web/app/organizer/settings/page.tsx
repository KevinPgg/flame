import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "../../lib/supabase/server";
import { Navbar } from "../../components";
import OrgSettingsClient from "./OrgSettingsClient";
import { selectOrganization } from "../../lib/utils/organization-selection";

export default async function OrgSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; tab?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const user = await currentUser();
  if (!user) redirect("/");

  const resolvedSearchParams = await searchParams;
  const selectedOrgSlug = resolvedSearchParams.org;
  const { organization, allOrganizations, approvedMemberships } = await selectOrganization(
    userId,
    selectedOrgSlug
  );

  if (!organization) redirect("/?onboarding=true");

  if (
    approvedMemberships.length > 1 &&
    (!selectedOrgSlug || selectedOrgSlug !== organization.slug)
  ) {
    const tabSuffix = resolvedSearchParams.tab ? `&tab=${resolvedSearchParams.tab}` : "";
    redirect(`/organizer/settings?org=${organization.slug}${tabSuffix}`);
  }

  const userData = {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    emailAddresses: user.emailAddresses.map((e) => ({
      emailAddress: e.emailAddress,
    })),
    imageUrl: user.imageUrl,
  };

  // Fetch org details
  const { data: orgDetails, error: orgDetailsError } = await supabaseAdmin!
    .from("organizations")
    .select("id, name, slug, instagram_handle, city, description, logo_url")
    .eq("id", organization.id)
    .single();

  if (orgDetailsError || !orgDetails) {
    console.error("Failed to fetch organization details:", { organizationId: organization.id, error: orgDetailsError });
    redirect(organization.slug ? `/organizer?org=${organization.slug}` : "/organizer");
  }

  const currentMembership = approvedMemberships.find(
    m => m.organizations?.id === organization.id
  );
  const memberRole = (currentMembership?.role ?? null) as string | null;

  return (
    <>
      <Navbar />
      <OrgSettingsClient
        user={userData}
        organization={organization}
        organizationDetails={orgDetails}
        memberRole={memberRole}
      />
    </>
  );
}

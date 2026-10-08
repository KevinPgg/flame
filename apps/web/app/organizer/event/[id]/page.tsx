import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "../../../lib/supabase/server";
import { Navbar } from "../../../components";
import OrgEventDetailClient from "./OrgEventDetailClient";
import { selectOrganization } from "../../../lib/utils/organization-selection";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ org?: string }>;
}

export default async function OrgEventDetailPage({ params, searchParams }: Props) {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const selectedOrgSlug = resolvedSearchParams.org;

  if (supabaseAdmin) {
    try {
      const { approvedMemberships } = await selectOrganization(userId, selectedOrgSlug);

      if (approvedMemberships.length > 1 && !selectedOrgSlug) {
        const { data: evt } = await supabaseAdmin
          .from("events")
          .select("organization_id, organizations(slug)")
          .eq("id", id)
          .single();

        const eventOrgSlug = (evt?.organizations as unknown as { slug: string } | null)?.slug;

        // Only redirect when the event's org is one the user is actually approved for.
        // Avoids pointing the URL at an org the service-role query resolved but the user
        // cannot access — the API would silently fall back anyway, but the URL would be wrong.
        const approvedOrgIds = new Set(approvedMemberships.map((m) => m.organization_id));
        if (eventOrgSlug && evt?.organization_id && approvedOrgIds.has(evt.organization_id)) {
          redirect(`/organizer/event/${id}?org=${encodeURIComponent(eventOrgSlug)}`);
        }
      }
    } catch (err) {
      // selectOrganization throws if the user has no approved org membership or on transient
      // DB/network errors. The redirect is best-effort — fall through and let the client
      // component handle the missing-org state gracefully.
      console.error("[OrgEventDetailPage] Failed to resolve org for canonical redirect", {
        userId,
        eventId: id,
        selectedOrgSlug: selectedOrgSlug ?? null,
        action: "resolve-org",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <>
      <Navbar />
      <OrgEventDetailClient eventId={id} orgSlug={selectedOrgSlug} />
    </>
  );
}

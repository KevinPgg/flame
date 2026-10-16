import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { loadOrganizerContext } from "../lib/organizer-context";
import OrganizersList from "./OrganizersList";
import OrganizerDashboard from "./OrganizerDashboard";

/**
 * /v2/organizer            → "My organizers"
 * /v2/organizer?org={slug} → that organizer's dashboard
 * Same query scheme as v1 (/organizer?org=), so links keep working when /v2 is dropped.
 */
export const dynamic = "force-dynamic";

export default async function OrganizerPageV2({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { org } = await searchParams;
  if (!org) return <OrganizersList />;
  // Same server-side checks as v1: membership + approval, canonical slug, role.
  return <OrganizerDashboard {...await loadOrganizerContext(org)} />;
}

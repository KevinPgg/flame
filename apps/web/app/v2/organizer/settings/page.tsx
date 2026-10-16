import { redirect } from "next/navigation";
import { canAccessOrgSettings, type OrgProfile } from "@project-flame/lib";
import { supabaseAdmin } from "../../../lib/supabase/server";
import { loadOrganizerContext } from "../../lib/organizer-context";
import { routes } from "../../lib/routes";
import SettingsView, { type SettingsTab } from "./SettingsView";

/**
 * /v2/organizer/settings?org={slug}[&tab=personal|organization] — prototype "ow:settings".
 * Any member opens it (Personal tab; Organization read-only); owners/admins edit the organization,
 * same rule as PATCH /api/organizations/[id]. Payouts live on their own screen.
 */
export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ org?: string; tab?: string }> }) {
  const { org, tab } = await searchParams;
  const ctx = await loadOrganizerContext(org);

  const { data: details, error } = await supabaseAdmin!
    .from("organizations")
    .select("id, name, slug, instagram_handle, city, description, logo_url")
    .eq("id", ctx.organization.id)
    .single();
  if (error || !details) {
    console.error("[v2 settings] organization details", { organizationId: ctx.organization.id, error });
    redirect(routes.dashboard(ctx.organization.slug));
  }

  const initialTab: SettingsTab =
    tab === "personal" || tab === "organization" ? tab : canAccessOrgSettings(ctx.role) ? "organization" : "personal";

  return (
    <SettingsView
      {...ctx}
      initialTab={initialTab}
      details={details as OrgProfile & { name: string; logo_url: string | null }}
    />
  );
}

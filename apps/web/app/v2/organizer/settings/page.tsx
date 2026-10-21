import { redirect } from "next/navigation";
import type { OrgProfile } from "@project-flame/lib";
import { supabaseAdmin } from "../../../lib/supabase/server";
import { loadOrganizerContext } from "../../lib/organizer-context";
import { routes } from "../../lib/routes";
import SettingsView from "./SettingsView";

/**
 * /v2/organizer/settings?org={slug} — organization settings (prototype "ow:settings").
 * Any member opens it (read-only); owners/admins edit, same rule as PATCH /api/organizations/[id].
 * ?tab=personal (old links) → /v2/account. Payouts live on their own screen.
 */
export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ org?: string; tab?: string }> }) {
  const { org, tab } = await searchParams;
  if (tab === "personal") redirect(routes.account());
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

  return (
    <SettingsView
      {...ctx}
      details={details as OrgProfile & { name: string; logo_url: string | null }}
    />
  );
}

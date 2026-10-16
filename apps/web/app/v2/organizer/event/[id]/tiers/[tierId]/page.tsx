import { redirect } from "next/navigation";
import { canManageAssignedEvents } from "@project-flame/lib";
import { loadOrganizerContext } from "../../../../../lib/organizer-context";
import { routes } from "../../../../../lib/routes";
import TierEditor from "./TierEditor";

/**
 * /v2/organizer/event/{id}/tiers/{tierId|new}?org={slug} — add or edit one tier.
 * Same roles as /api/ticket-tiers: owner/admin, or the organizer assigned to the event.
 */
export const dynamic = "force-dynamic";

export default async function TierEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; tierId: string }>;
  searchParams: Promise<{ org?: string }>;
}) {
  const { id, tierId } = await params;
  const { org } = await searchParams;
  const ctx = await loadOrganizerContext(org);
  if (!canManageAssignedEvents(ctx.role)) redirect(routes.event(id, ctx.organization.slug, "tiers"));
  return <TierEditor eventId={id} tierId={decodeURIComponent(tierId)} {...ctx} />;
}

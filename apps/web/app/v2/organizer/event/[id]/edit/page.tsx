import { redirect } from "next/navigation";
import { canManageAssignedEvents } from "@project-flame/lib";
import { loadOrganizerContext } from "../../../../lib/organizer-context";
import { routes } from "../../../../lib/routes";
import EditEvent from "./EditEvent";

/**
 * /v2/organizer/event/{id}/edit?org={slug} — owner/admin, or an organizer assigned to the event
 * (same rule as PATCH /api/events; unassigned events aren't in the organizer's data at all).
 */
export const dynamic = "force-dynamic";

export default async function EditEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ org?: string }>;
}) {
  const { id } = await params;
  const { org } = await searchParams;
  const ctx = await loadOrganizerContext(org);
  if (!canManageAssignedEvents(ctx.role)) redirect(routes.event(id, ctx.organization.slug));
  return <EditEvent eventId={id} {...ctx} />;
}

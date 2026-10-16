import { redirect } from "next/navigation";
import { canCreateEvents } from "@project-flame/lib";
import { loadOrganizerContext } from "../../lib/organizer-context";
import { routes } from "../../lib/routes";
import CreateEvent from "./CreateEvent";

/** /v2/organizer/create?org={slug} — new event (owners and admins, same rule as POST /api/events). */
export const dynamic = "force-dynamic";

export default async function CreateEventPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const { org } = await searchParams;
  const ctx = await loadOrganizerContext(org);
  if (!canCreateEvents(ctx.role)) redirect(routes.dashboard(ctx.organization.slug));
  return <CreateEvent {...ctx} />;
}

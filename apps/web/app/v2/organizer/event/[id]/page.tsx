import { loadOrganizerContext } from "../../../lib/organizer-context";
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
  const { id } = await params;
  const { org } = await searchParams;
  return <EventAdmin eventId={id} {...await loadOrganizerContext(org)} />;
}

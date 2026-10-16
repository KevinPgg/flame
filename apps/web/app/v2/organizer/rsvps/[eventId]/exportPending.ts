import {
  buildPendingRsvpExportAoa,
  formatCentsAsPrice,
  normalizeRegistrationExportColumns,
  registrationValuesForExportColumns,
  rsvpAmountCents,
  rsvpGuestName,
  rsvpTicketLabel,
  type OrganizerRsvp,
} from "@project-flame/lib";

/**
 * Pending RSVPs → XLSX, same sheet as v1 (RsvpManagement): built from fresh data right before
 * exporting so headers and answers match the current form. Returns false when nothing is pending.
 */
export async function exportPendingRsvps(event: {
  id: string;
  name: string;
  currency?: string | null;
  timezone?: string | null;
}): Promise<boolean> {
  const res = await fetch(`/api/organizer/rsvps?event_id=${encodeURIComponent(event.id)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("export");
  const fresh = (await res.json()) as { rsvps?: OrganizerRsvp[]; registration_form_config?: unknown };
  const pending = (fresh.rsvps ?? []).filter((r) => r.status === "pending");
  if (pending.length === 0) return false;

  const XLSX = await import("xlsx");
  const tz = event.timezone?.trim() ?? "";
  const when = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("en-US", tz ? { timeZone: tz } : undefined);
    } catch {
      return new Date(iso).toLocaleString("en-US");
    }
  };
  const columns = normalizeRegistrationExportColumns(
    (fresh.registration_form_config ?? undefined) as Parameters<typeof normalizeRegistrationExportColumns>[0]
  );
  const rows = buildPendingRsvpExportAoa(
    event.name,
    new Date().toLocaleDateString("en-US"),
    pending.map((r) => ({
      name: rsvpGuestName(r.users),
      tier: rsvpTicketLabel(r).replace(" · ", " - "),
      email: r.users.email,
      price: formatCentsAsPrice(rsvpAmountCents(r), event.currency || "USD"),
      requestedAt: when(r.requested_at),
      ...(columns.length > 0 && {
        registrationValues: registrationValuesForExportColumns(columns, (r.registration_data ?? null) as never),
      }),
    })),
    columns.length > 0 ? columns : undefined
  );
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 25 }, { wch: 25 }, { wch: 30 }, { wch: 12 }, { wch: 22 }, ...columns.map(() => ({ wch: 28 }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pending RSVPs");
  XLSX.writeFile(wb, `${event.name.replace(/[^a-z0-9]/gi, "_")}_rsvps_pending.xlsx`);
  return true;
}

/**
 * Pure data for organizer XLSX exports (no xlsx dependency).
 * Web builds sheets via dynamic `import("xlsx")` + `utils.aoa_to_sheet`;
 * mobile uses the bundled `xlsx` package the same way.
 *
 * Two flows share the registration column helpers below:
 *   - Pending RSVP export (RsvpManagement on web; mobile parity).
 *   - Purchase Details export (paid orders for an event on web + mobile);
 *     for RSVP events with a registration form, each purchase shows the
 *     registrant's answers (joined from `rsvps.registration_data`).
 */

export type PendingRsvpExportSheetRow = {
  name: string;
  tier: string;
  email: string;
  price: string;
  requestedAt: string;
  /**
   * When `registrationColumns` is passed to `buildPendingRsvpExportAoa`, each row
   * should include one string per column (same order as `registrationColumns`).
   */
  registrationValues?: string[];
};

/** Column definition derived from `events.registration_form_config`. */
export type RegistrationExportColumn = {
  id: string;
  /** Spreadsheet header — human-readable label */
  label: string;
};

const BASE_HEADERS = [
  "Name",
  "Tier",
  "Email",
  "Base Ticket Price",
  "Request Date",
] as const;

/**
 * Normalizes event registration form config into export columns (stable order).
 * Skips entries without a usable `id`.
 */
export function normalizeRegistrationExportColumns(
  formConfig: readonly { id: string; label?: string | null }[] | null | undefined,
): RegistrationExportColumn[] {
  if (!formConfig?.length) return [];
  return formConfig
    .filter(f => typeof f.id === "string" && f.id.trim() !== "")
    .map(f => ({
      id: f.id.trim(),
      label: (typeof f.label === "string" && f.label.trim() !== ""
        ? f.label.trim()
        : f.id.trim()
      ).slice(0, 500),
    }));
}

/**
 * Stringify a single registration answer for spreadsheet cells.
 */
export function formatRegistrationValueForExport(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    return value.map(v => formatRegistrationValueForExport(v)).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * One spreadsheet cell per registration column, keyed by field `id`.
 */
export function registrationValuesForExportColumns(
  columns: RegistrationExportColumn[],
  registrationData: Record<string, unknown> | null | undefined,
): string[] {
  if (!registrationData || typeof registrationData !== "object") {
    return columns.map(() => "");
  }
  const data = registrationData as Record<string, unknown>;
  return columns.map(col => formatRegistrationValueForExport(answerAt(data, col.id)));
}

/** "_guests.0.name" → guest 2's "name" (fase 3.4); plain ids → top level as always. */
function answerAt(data: Record<string, unknown>, id: string): unknown {
  const m = /^_guests\.(\d+)\.(.+)$/.exec(id);
  if (!m) return data[id];
  const guests = data._guests;
  if (!Array.isArray(guests)) return undefined;
  const g = guests[Number(m[1])];
  return g && typeof g === "object" ? (g as Record<string, unknown>)[m[2]!] : undefined;
}

/**
 * Fase 3.4: RSVPs can carry answers for guests 2..N (`registration_data._guests`). Adds one
 * column per field for each extra guest present in any row ("Guest 2 · Full name"), after the
 * requester's columns. Rows without guests leave them empty.
 */
export function withGuestExportColumns(
  columns: RegistrationExportColumn[],
  rows: Array<Record<string, unknown> | null | undefined>,
): RegistrationExportColumn[] {
  if (columns.length === 0) return columns;
  const extra = rows.reduce<number>((n, r) => {
    const g = r && Array.isArray((r as Record<string, unknown>)._guests) ? ((r as Record<string, unknown>)._guests as unknown[]).length : 0;
    return Math.max(n, g);
  }, 0);
  const out = [...columns];
  for (let i = 0; i < extra; i++) {
    for (const c of columns) out.push({ id: `_guests.${i}.${c.id}`, label: `Guest ${i + 2} · ${c.label}` });
  }
  return out;
}

/**
 * Returns rows suitable for `XLSX.utils.aoa_to_sheet`.
 *
 * @param registrationColumns — When non-empty, appends one column per field (header = `label`)
 *   and expects each `dataRows[i].registrationValues` to align (or pads with empty strings).
 */
export function buildPendingRsvpExportAoa(
  eventName: string,
  exportedDateLabel: string,
  dataRows: PendingRsvpExportSheetRow[],
  registrationColumns?: RegistrationExportColumn[],
): string[][] {
  const regCols = registrationColumns?.length ? registrationColumns : undefined;

  const headerRow: string[] = regCols
    ? [...BASE_HEADERS, ...regCols.map(c => c.label)]
    : [...BASE_HEADERS];

  const bodyRows = dataRows.map(row => {
    const base = [row.name, row.tier, row.email, row.price, row.requestedAt];
    if (!regCols?.length) return base;
    const vals =
      row.registrationValues && row.registrationValues.length === regCols.length
        ? row.registrationValues
        : regCols.map((_, i) => row.registrationValues?.[i] ?? "");
    return [...base, ...vals];
  });

  return [
    [`Event: ${eventName}`],
    [`Exported: ${exportedDateLabel}`],
    [],
    headerRow,
    ...bodyRows,
  ];
}

/**
 * Per-row data for the Purchase Details export.
 *
 * Registration columns (when supplied) appear immediately after Email so
 * organizers can read the registrant's answers next to their identity.
 */
export type PurchaseExportSheetRow = {
  customer: string;
  email: string;
  tier: string;
  quantity: number | string;
  purchasedAt: string;
  /**
   * Base ticket price (organizer-net, excluding service fee). Matches the
   * "Total Revenue" stat on the organizer dashboard for the same event.
   * Field name kept for backwards compatibility with existing callers; header
   * is rendered as "Base Ticket Price".
   */
  totalCost: string;
  /** One value per registration column, same order as `registrationColumns`. */
  registrationValues?: string[];
};

const PURCHASE_HEADERS_BEFORE_REG = ["Customer", "Email"] as const;
const PURCHASE_HEADERS_AFTER_REG = [
  "Ticket Tier",
  "Quantity",
  "Purchased At",
  "Base Ticket Price",
] as const;

/**
 * Returns rows suitable for `XLSX.utils.aoa_to_sheet` for the purchase export.
 *
 * Registration columns (if any) are inserted between Email and Ticket Tier so
 * the registrant's answers sit next to their identity.
 */
export function buildPurchaseExportAoa(
  eventName: string,
  dataRows: PurchaseExportSheetRow[],
  registrationColumns?: RegistrationExportColumn[],
): (string | number)[][] {
  const regCols = registrationColumns?.length ? registrationColumns : undefined;

  const headerRow: string[] = regCols
    ? [
        ...PURCHASE_HEADERS_BEFORE_REG,
        ...regCols.map(c => c.label),
        ...PURCHASE_HEADERS_AFTER_REG,
      ]
    : [...PURCHASE_HEADERS_BEFORE_REG, ...PURCHASE_HEADERS_AFTER_REG];

  const bodyRows: (string | number)[][] = dataRows.map(row => {
    const before: (string | number)[] = [row.customer, row.email];
    const after: (string | number)[] = [
      row.tier,
      row.quantity,
      row.purchasedAt,
      row.totalCost,
    ];
    if (!regCols?.length) return [...before, ...after];
    const vals =
      row.registrationValues && row.registrationValues.length === regCols.length
        ? row.registrationValues
        : regCols.map((_, i) => row.registrationValues?.[i] ?? "");
    return [...before, ...vals, ...after];
  });

  return [[`Event: ${eventName}`], [], headerRow, ...bodyRows];
}

/** Column widths matching the column order produced by `buildPurchaseExportAoa`. */
export function purchaseExportColumnWidths(
  registrationColumns?: RegistrationExportColumn[],
): { wch: number }[] {
  const before = [{ wch: 25 }, { wch: 30 }];
  const after = [{ wch: 25 }, { wch: 10 }, { wch: 22 }, { wch: 12 }];
  const reg = (registrationColumns ?? []).map(() => ({ wch: 28 }));
  return [...before, ...reg, ...after];
}

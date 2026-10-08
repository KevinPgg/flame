/**
 * Build XLSX exports for organizer flows (web parity: RsvpManagement + PurchasedDetailsSection).
 * Writes to cache and opens the system share sheet via expo-sharing.
 */

import { Alert, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";
import {
  buildPendingRsvpExportAoa,
  buildPurchaseExportAoa,
  formatCentsAsPrice,
  isValidIanaTimezone,
  normalizeRegistrationExportColumns,
  purchaseExportColumnWidths,
  registrationValuesForExportColumns,
  type RegistrationExportColumn,
} from "@project-flame/lib";
import type { EnrichedPurchase } from "../hooks/useOrgEventEnriched";

function formatSheetDateTime(iso: string, eventTimezoneTrimmed: string): string {
  try {
    const d = new Date(iso);
    if (eventTimezoneTrimmed && isValidIanaTimezone(eventTimezoneTrimmed)) {
      return d.toLocaleString("en-US", { timeZone: eventTimezoneTrimmed });
    }
    return d.toLocaleString("en-US");
  } catch {
    return new Date(iso).toLocaleString("en-US");
  }
}

function safeFileNamePart(name: string): string {
  return name.replace(/[^a-z0-9]/gi, "_");
}

async function shareXlsxWorkbook(wb: XLSX.WorkBook, fileName: string): Promise<void> {
  const wbout = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    Alert.alert("Export failed", "No cache directory available.");
    return;
  }
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    Alert.alert("Sharing unavailable", "Sharing is not available on this device.");
    return;
  }
  const uri = `${cacheDir}${fileName}`;
  try {
    await FileSystem.writeAsStringAsync(uri, wbout, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await Sharing.shareAsync(uri, {
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      dialogTitle: fileName,
      ...(Platform.OS === "ios"
        ? { UTI: "com.microsoft.excel.xlsx" as const }
        : {}),
    });
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
}

export type PendingRsvpExportRow = {
  personName: string;
  tierExportLine: string;
  email: string;
  priceCents: number;
  requestedAtIso: string;
  registrationData?: Record<string, unknown> | null;
};

export async function exportPendingRsvpsXlsx(params: {
  eventName: string;
  eventTimezone: string | null | undefined;
  currency: string;
  rows: PendingRsvpExportRow[];
  registrationFormConfig?: readonly { id: string; label?: string | null }[] | null;
}): Promise<void> {
  const rawTz = params.eventTimezone?.trim() ?? "";
  const formatInTz = (iso: string) => formatSheetDateTime(iso, rawTz);

  const registrationColumns: RegistrationExportColumn[] =
    normalizeRegistrationExportColumns(params.registrationFormConfig ?? undefined);

  const exportedDate = new Date().toLocaleDateString("en-US");
  const wsData = buildPendingRsvpExportAoa(
    params.eventName,
    exportedDate,
    params.rows.map(r => ({
      name: r.personName,
      tier: r.tierExportLine,
      email: r.email,
      price: formatCentsAsPrice(r.priceCents, params.currency),
      requestedAt: formatInTz(r.requestedAtIso),
      ...(registrationColumns.length > 0 && {
        registrationValues: registrationValuesForExportColumns(
          registrationColumns,
          r.registrationData ?? null,
        ),
      }),
    })),
    registrationColumns.length > 0 ? registrationColumns : undefined,
  );

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const baseCols = [
    { wch: 25 },
    { wch: 30 },
    { wch: 30 },
    { wch: 12 },
    { wch: 22 },
  ];
  ws["!cols"] = [
    ...baseCols,
    ...registrationColumns.map(() => ({ wch: 28 })),
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pending RSVPs");
  const fileName = `${safeFileNamePart(params.eventName)}_pending_rsvps.xlsx`;
  await shareXlsxWorkbook(wb, fileName);
}

export async function exportPurchasesXlsx(params: {
  eventName: string;
  eventTimezone: string | null | undefined;
  currency: string;
  purchases: EnrichedPurchase[];
  registrationFormConfig?: readonly { id: string; label?: string | null }[] | null;
}): Promise<void> {
  const rawTz = params.eventTimezone?.trim() ?? "";
  const formatInTz = (iso: string) => formatSheetDateTime(iso, rawTz);

  const sorted = [...params.purchases].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const registrationColumns: RegistrationExportColumn[] =
    normalizeRegistrationExportColumns(params.registrationFormConfig ?? undefined);
  const regCols = registrationColumns.length > 0 ? registrationColumns : undefined;

  const wsData = buildPurchaseExportAoa(
    params.eventName,
    sorted.map(p => ({
      customer: p.userName,
      email: p.email || "",
      tier: p.tierName + (p.stageName ? ` - ${p.stageName}` : ""),
      quantity: p.quantity,
      purchasedAt: formatInTz(p.createdAt),
      totalCost: formatCentsAsPrice(p.basePrice, params.currency),
      ...(regCols && {
        registrationValues: registrationValuesForExportColumns(
          regCols,
          p.registrationData ?? null,
        ),
      }),
    })),
    regCols,
  );

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = purchaseExportColumnWidths(regCols);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Purchase Details");
  const fileName = `${safeFileNamePart(params.eventName)}_purchases.xlsx`;
  await shareXlsxWorkbook(wb, fileName);
}

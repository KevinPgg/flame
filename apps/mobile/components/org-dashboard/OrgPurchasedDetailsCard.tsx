import { useState, useMemo, useCallback, useRef } from "react";
import { View, Text, Pressable, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatCentsAsPrice } from "@project-flame/lib";
import { OrgSectionCard } from "./OrgSectionCard";
import type { OrgPurchaseStats } from "../../data/mock";
import type { EnrichedPurchase } from "../../hooks/useOrgEventEnriched";
import { exportPurchasesXlsx } from "../../lib/organizer-xlsx-export";

interface OrgPurchasedDetailsCardProps {
  stats: OrgPurchaseStats;
  purchases?: EnrichedPurchase[];
  currency?: string;
  /** Used for XLSX filename and header (web parity). */
  eventName?: string;
  eventTimezone?: string | null;
  /**
   * When the event has a registration form, the XLSX export adds one column
   * per field (after Email) populated from each purchase's `registrationData`.
   * Mirrors web's RsvpManagement / OrgEventDetail purchase export.
   */
  registrationFormConfig?:
    | readonly { id: string; label?: string | null }[]
    | null;
  /**
   * Optional: if provided, the export awaits a fresh fetch first and uses the
   * returned data to build the sheet. Mirrors the pre-Jan 2026 web pattern —
   * avoids serving a stale TanStack cache from before `registrationData` /
   * `registration_form_config` were added to the API response.
   */
  onRefetchBeforeExport?: () => Promise<{
    purchases: EnrichedPurchase[];
    registrationFormConfig:
      | readonly { id: string; label?: string | null }[]
      | null;
    eventName: string;
    eventTimezone: string | null;
    currency?: string;
  } | null>;
  onClose?: () => void;
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <Text className="text-white-80 text-base leading-[22px] font-poppins">
      {label}{" "}
      <Text className="text-white-100 font-poppins-semibold">{value}</Text>
    </Text>
  );
}

function StatusBadge({ scanned }: { scanned: boolean }) {
  return (
    <View
      className={`rounded-badge px-2 py-[2px] ${
        scanned ? "bg-[rgba(34,197,94,0.15)]" : "bg-white-5"
      }`}
    >
      <Text
        className={`text-xs leading-4 font-poppins-medium ${
          scanned ? "text-[#22C55E]" : "text-white-50"
        }`}
      >
        {scanned ? "Scanned" : "Not Scanned"}
      </Text>
    </View>
  );
}

function PurchaseRow({
  purchase,
  currency,
}: {
  purchase: EnrichedPurchase;
  currency: string;
}) {
  const tierDisplay = purchase.stageName
    ? `${purchase.tierName} - ${purchase.stageName}`
    : purchase.tierName;

  return (
    <View className="border border-white-20 rounded-card p-3 gap-2">
      <View className="flex-row items-center justify-between">
        <Text
          className="text-white-100 text-sm leading-5 font-poppins-semibold flex-1"
          numberOfLines={1}
        >
          {purchase.userName}
        </Text>
        <View className="flex-row items-center gap-3">
          <StatusBadge scanned={purchase.scanned} />
          <Text className="text-white-100 text-xs leading-4 font-poppins-medium">
            {formatCentsAsPrice(purchase.basePrice, currency)}
          </Text>
        </View>
      </View>
      <Text className="text-white-50 text-xs leading-4 font-poppins" numberOfLines={1}>
        {tierDisplay}
      </Text>
      <Text className="text-white-80 text-xs leading-4 font-poppins">
        {purchase.quantity}x
      </Text>
    </View>
  );
}

export function OrgPurchasedDetailsCard({
  stats,
  purchases = [],
  currency = "USD",
  eventName = "",
  eventTimezone = null,
  registrationFormConfig = null,
  onRefetchBeforeExport,
  onClose,
}: OrgPurchasedDetailsCardProps) {
  const [purchaseListExpanded, setPurchaseListExpanded] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const exportingRef = useRef(false);

  const handleExportPurchases = useCallback(async () => {
    if (!purchases.length && !onRefetchBeforeExport) return;
    if (exportingRef.current) return;
    exportingRef.current = true;
    setIsExporting(true);
    try {
      const fresh = onRefetchBeforeExport
        ? await onRefetchBeforeExport()
        : null;
      const data = fresh
        ? {
            purchases: fresh.purchases,
            eventName: fresh.eventName || eventName || "Event",
            eventTimezone: fresh.eventTimezone,
            currency: fresh.currency ?? currency,
            registrationFormConfig: fresh.registrationFormConfig,
          }
        : {
            purchases,
            eventName: eventName || "Event",
            eventTimezone,
            currency,
            registrationFormConfig,
          };
      if (!data.purchases.length) {
        Alert.alert("Nothing to export", "No purchases for this event yet.");
        return;
      }
      await exportPurchasesXlsx({
        eventName: data.eventName,
        eventTimezone: data.eventTimezone,
        currency: data.currency,
        purchases: data.purchases,
        registrationFormConfig: data.registrationFormConfig,
      });
    } catch (err) {
      console.error("[OrgPurchasedDetailsCard] export_xlsx", err);
      Alert.alert("Export failed", "Could not create the spreadsheet.");
    } finally {
      exportingRef.current = false;
      setIsExporting(false);
    }
  }, [
    purchases,
    eventName,
    eventTimezone,
    currency,
    registrationFormConfig,
    onRefetchBeforeExport,
  ]);

  const sortedPurchases = useMemo(
    () =>
      [...purchases].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [purchases],
  );

  return (
    <OrgSectionCard
      icon={<Ionicons name="ticket-outline" size={22} color="#F9FBFE" />}
      title="Purchased Details"
      onClose={onClose}
    >
      <View className="gap-4">
        <View className="flex-row gap-8">
          <StatItem label="Ticket QNT:" value={`${stats.ticketQuantity}`} />
          <StatItem
            label="Requested tickets:"
            value={`${stats.requestedTickets}`}
          />
        </View>
        <View className="flex-row gap-8">
          <StatItem label="Sold Tickets:" value={`${stats.soldTickets}`} />
          <StatItem
            label="Revenue:"
            value={formatCentsAsPrice(stats.revenue, currency)}
          />
        </View>

        {purchases.length > 0 && (
          <View className="pt-2 border-t border-white-10">
            <View className="flex-row items-center justify-between py-1 gap-2">
              <Pressable
                onPress={() => setPurchaseListExpanded((prev) => !prev)}
                className="flex-row items-center gap-2 flex-1 min-w-0"
              >
                <Text className="text-white-100 text-sm leading-5 font-poppins-medium">
                  Purchase List ({purchases.length})
                </Text>
                <Ionicons
                  name={
                    purchaseListExpanded
                      ? "chevron-up-outline"
                      : "chevron-down-outline"
                  }
                  size={20}
                  color="rgba(255,255,255,0.8)"
                />
              </Pressable>
              <Pressable
                onPress={handleExportPurchases}
                disabled={isExporting}
                style={{ opacity: isExporting ? 0.5 : 1 }}
                className="flex-row items-center gap-1.5 bg-white-10 border border-white-20 rounded-pill px-3 py-1.5 shrink-0"
              >
                {isExporting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="download-outline" size={14} color="#F9FBFE" />
                )}
                <Text className="text-white-100 text-xs leading-4 font-poppins-medium">
                  {isExporting ? "Loading..." : "Export XLSX"}
                </Text>
              </Pressable>
            </View>
            {purchaseListExpanded && (
              <View className="mt-2 gap-2">
                {sortedPurchases.map((purchase) => (
                  <PurchaseRow
                    key={purchase.id}
                    purchase={purchase}
                    currency={currency}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    </OrgSectionCard>
  );
}

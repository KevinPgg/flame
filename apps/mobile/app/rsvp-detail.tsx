import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Alert,
  Modal,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, CustomRefreshControl } from "@project-flame/ui";
import { getTabBarPaddingBottom } from "../components/navigation/CustomTabBar";
import { DashboardBar } from "../components/dashboard/DashboardBar";
import { RsvpStatsBar } from "../components/org-dashboard/RsvpStatsBar";
import { RsvpRequestCard } from "../components/org-dashboard/RsvpRequestCard";
import {
  useEventRsvps,
  useRsvpActions,
  type RsvpStatus,
  type RsvpRequestData,
  type FormField,
} from "../hooks/useRsvpManagement";
import { RequireAuthGate } from "../hooks/useRequireAuth";
import { useOptionalAuth } from "../hooks/useOptionalAuth";
import { useOrgData } from "../hooks/useOrgData";
import { exportPendingRsvpsXlsx } from "../lib/organizer-xlsx-export";
import { useMemberRoleContext } from "../contexts/MemberRoleContext";

type FilterStatus = "all" | RsvpStatus;

const FILTER_TABS: { key: FilterStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

// ---------------------------------------------------------------------------
// Registration data modal — ports web's view modal logic
// ---------------------------------------------------------------------------

function RegistrationModal({
  visible,
  onClose,
  userName,
  registrationData,
  formConfig,
}: {
  visible: boolean;
  onClose: () => void;
  userName: string;
  registrationData: Record<string, unknown> | null;
  formConfig: FormField[] | null;
}) {
  const renderValue = (value: unknown, fieldType?: string): string => {
    if (value === undefined || value === null || value === "")
      return "Not provided";
    if (fieldType === "checkbox") return value ? "Yes" : "No";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-[rgba(0,0,0,0.7)] justify-end">
        <View className="bg-surface rounded-t-[16px] max-h-[80%]">
          {/* Header */}
          <View className="flex-row items-center justify-between px-4 py-4 border-b border-white-20">
            <Text className="text-white-100 text-lg font-poppins-semibold">
              Registration Details
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color="#F9FBFE" />
            </Pressable>
          </View>

          <ScrollView
            className="px-4 py-4"
            showsVerticalScrollIndicator={false}
          >
            <Text className="text-white-80 text-sm font-poppins mb-4">
              Registration information for{" "}
              <Text className="text-white-100 font-poppins-semibold">
                {userName}
              </Text>
            </Text>

            {formConfig && formConfig.length > 0 ? (
              <View className="gap-3">
                {formConfig.map(field => {
                  const value = registrationData?.[field.id];
                  return (
                    <View key={field.id} className="gap-1">
                      <Text className="text-white-50 text-xs font-poppins-medium">
                        {field.label}
                        {field.required ? " *" : ""}
                        {field.archived ? (
                          <Text className="text-white-30 font-poppins-light">
                            {"  (archived)"}
                          </Text>
                        ) : null}
                      </Text>
                      <Text className="text-white-100 text-sm font-poppins">
                        {renderValue(value, field.type)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : registrationData && Object.keys(registrationData).length > 0 ? (
              <View className="gap-3">
                <Text className="text-white-50 text-xs font-poppins italic mb-2">
                  No form configuration found. Showing raw submitted data:
                </Text>
                {Object.entries(registrationData).map(([key, value]) => (
                  <View key={key} className="gap-1">
                    <Text className="text-white-50 text-xs font-poppins-medium">
                      {key}
                    </Text>
                    <Text className="text-white-100 text-sm font-poppins">
                      {renderValue(value)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text className="text-white-50 text-sm font-poppins">
                No registration data submitted.
              </Text>
            )}

            <View className="h-8" />
          </ScrollView>

          <View className="px-4 pb-6 pt-2 border-t border-white-20">
            <Pressable
              onPress={onClose}
              className="border border-white-30 rounded-pill py-3 items-center"
            >
              <Text className="text-white-100 text-sm font-poppins-medium">
                Close
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function RsvpDetailScreen() {
  return (
    <RequireAuthGate>
      <RsvpDetailContent />
    </RequireAuthGate>
  );
}

function RsvpDetailContent() {
  const params = useLocalSearchParams<{
    eventId?: string | string[];
    orgId?: string | string[];
  }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId ?? "";
  const routeOrgId = Array.isArray(params.orgId) ? params.orgId[0] : params.orgId;
  const insets = useSafeAreaInsets();
  const { userId } = useOptionalAuth();
  const { selectedOrgId, setSelectedOrgId } = useMemberRoleContext();

  // Ref-based sync — see organizer-admin.tsx for rationale
  const syncedOrgIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (routeOrgId && syncedOrgIdRef.current !== routeOrgId) {
      syncedOrgIdRef.current = routeOrgId;
      setSelectedOrgId(routeOrgId);
    }
  }, [routeOrgId, setSelectedOrgId]);

  const { data: orgData } = useOrgData(routeOrgId ?? selectedOrgId);

  const { data, isLoading, error, refetch, isRefetching } =
    useEventRsvps(eventId);
  const { approve, reject, processingId } = useRsvpActions(eventId);

  const [filter, setFilter] = useState<FilterStatus>("all");
  const [viewModal, setViewModal] = useState<{
    visible: boolean;
    userName: string;
    registrationData: Record<string, unknown> | null;
  }>({ visible: false, userName: "", registrationData: null });
  const [isExporting, setIsExporting] = useState(false);

  const filteredRsvps = useMemo(() => {
    if (!data?.rsvps) return [];
    if (filter === "all") return data.rsvps;
    return data.rsvps.filter(r => r.status === filter);
  }, [data?.rsvps, filter]);

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const confirmApprove = useCallback(
    (rsvp: RsvpRequestData) => {
      Alert.alert(
        "Approve RSVP",
        `Are you sure you want to approve ${rsvp.personName}'s request?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Approve",
            onPress: () => approve(rsvp.id),
          },
        ],
      );
    },
    [approve],
  );

  const confirmReject = useCallback(
    (rsvp: RsvpRequestData) => {
      Alert.alert(
        "Reject RSVP",
        `Are you sure you want to reject ${rsvp.personName}'s request? This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Reject",
            style: "destructive",
            onPress: () => reject(rsvp.id),
          },
        ],
      );
    },
    [reject],
  );

  const openViewModal = useCallback((rsvp: RsvpRequestData) => {
    setViewModal({
      visible: true,
      userName: rsvp.personName,
      registrationData: rsvp.registrationData,
    });
  }, []);

  const handleExportPending = useCallback(async () => {
    if (!data) return;
    setIsExporting(true);
    try {
      // Refetch fresh RSVPs (and registrationFormConfig) right before export so
      // a stale TanStack cache from before the form was last edited can't
      // serve outdated answers / column headers.
      const refetched = await refetch();
      const fresh = refetched.data ?? data;
      const pending = fresh.rsvps.filter(r => r.status === "pending");
      if (!pending.length) return; // `finally` resets isExporting
      await exportPendingRsvpsXlsx({
        eventName: fresh.eventName || "Event",
        eventTimezone: fresh.eventTimezone,
        currency: fresh.currency || "USD",
        registrationFormConfig: fresh.registrationFormConfig ?? undefined,
        rows: pending.map(r => ({
          personName: r.personName,
          tierExportLine: r.tierExportLine,
          email: r.email,
          priceCents: r.price,
          requestedAtIso: r.requestedAtIso,
          registrationData: r.registrationData ?? null,
        })),
      });
    } catch (err) {
      console.error("[rsvp-detail] export_xlsx failed", {
        action: "export_xlsx",
        eventId: eventId ?? null,
        userId: userId ?? null,
        err,
      });
      Alert.alert("Export failed", "Could not create the spreadsheet.");
    } finally {
      setIsExporting(false);
    }
  }, [data, eventId, userId, refetch]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  if (error) {
    console.error("[rsvp-detail] load_rsvps failed", {
      eventId,
      action: "load_rsvps",
      userId: userId ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
    return (
      <View className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-white-100 text-base font-poppins-medium mb-4">
          Failed to load RSVPs
        </Text>
        <Text className="text-white-50 text-sm font-poppins text-center mb-6">
          {error instanceof Error
            ? error.message
            : "An unexpected error occurred."}
        </Text>
        <Pressable
          onPress={onRefresh}
          className="bg-white-100 rounded-pill px-6 py-3"
        >
          <Text className="text-dark text-sm font-poppins-medium">Retry</Text>
        </Pressable>
      </View>
    );
  }

  const stats = data?.stats ?? {
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    expired: 0,
  };
  const isPastEvent = data?.isPastEvent ?? false;

  return (
    <View className="flex-1 bg-background">
      <DashboardBar title="RSVP Detail" avatarUrl={orgData?.logoUrl} />
      <ScrollView
        className="flex-1 bg-background"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: 14,
          paddingBottom: getTabBarPaddingBottom(insets.bottom),
        }}
        refreshControl={
          <CustomRefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
          />
        }
      >
        <View className="gap-[14px] px-4">
          <RsvpStatsBar stats={stats} />

          {stats.pending > 0 && (
            <Pressable
              onPress={handleExportPending}
              disabled={isExporting}
              style={{ opacity: isExporting ? 0.5 : 1 }}
              className="flex-row items-center justify-center gap-2 self-start bg-white-10 border border-white-20 rounded-pill px-4 py-2.5"
            >
              {isExporting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="download-outline" size={18} color="#F9FBFE" />
              )}
              <Text className="text-white-100 text-xs font-poppins-medium">
                {isExporting ? "Loading..." : "Export pending to XLSX"}
              </Text>
            </Pressable>
          )}

          {/* Status filter tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {FILTER_TABS.map(tab => {
              const isActive = filter === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setFilter(tab.key)}
                  className={`rounded-pill px-4 py-2 ${
                    isActive ? "bg-white-100" : "border border-white-30"
                  }`}
                >
                  <Text
                    className={`text-xs font-poppins-medium ${
                      isActive ? "text-dark" : "text-white-50"
                    }`}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {filteredRsvps.length === 0 ? (
            <View className="items-center py-12">
              <Text className="text-white-50 text-sm font-poppins text-center">
                {filter === "all"
                  ? "No RSVPs for this event yet."
                  : `No ${filter} RSVPs.`}
              </Text>
            </View>
          ) : (
            filteredRsvps.map(request => (
              <RsvpRequestCard
                key={request.id}
                request={request}
                isProcessing={processingId === request.id}
                isPastEvent={isPastEvent}
                currency={data?.currency}
                onViewDetails={() => openViewModal(request)}
                onApprove={
                  isPastEvent ? undefined : () => confirmApprove(request)
                }
                onReject={
                  isPastEvent ? undefined : () => confirmReject(request)
                }
              />
            ))
          )}
        </View>
      </ScrollView>

      <RegistrationModal
        visible={viewModal.visible}
        onClose={() =>
          setViewModal({ visible: false, userName: "", registrationData: null })
        }
        userName={viewModal.userName}
        registrationData={viewModal.registrationData}
        formConfig={data?.registrationFormConfig ?? null}
      />
    </View>
  );
}

/**
 * Org event detail screen — shows event info and action cards.
 *
 * Uses useOrgEvents for basic event data and useOrgEventEnriched for
 * accurate purchase/revenue/sent ticket/promoter data from the web API.
 * Industry standard: single batch fetch for all event detail data.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Keyboard,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { DashboardBar } from "../components/dashboard/DashboardBar";
import { OrgEventInfoCard } from "../components/org-dashboard/OrgEventInfoCard";
import {
  OrgActionButtons,
  type SectionKey,
} from "../components/org-dashboard/OrgActionButtons";
import { OrgPromotionsCard } from "../components/org-dashboard/OrgPromotionsCard";
import { OrgSendTicketsCard } from "../components/org-dashboard/OrgSendTicketsCard";
import { OrgPromoterLinksCard } from "../components/org-dashboard/OrgPromoterLinksCard";
import { OrgPurchasedDetailsCard } from "../components/org-dashboard/OrgPurchasedDetailsCard";
import { useOrgEvents } from "../hooks/useOrgEvents";
import { useOrgData } from "../hooks/useOrgData";
import {
  useOrgEventEnriched,
  type EnrichedPromoCode,
  type EnrichedPromoterLink,
  type EnrichedPromotionalTicket,
} from "../hooks/useOrgEventEnriched";
import {
  formatEventDate,
  buildTimeRange,
  isValidIanaTimezone,
  canManageMembers,
} from "@project-flame/lib";
import { RequireAuthGate } from "../hooks/useRequireAuth";
import { colors, CustomRefreshControl } from "@project-flame/ui";
import { getTabBarPaddingBottom } from "../components/navigation/CustomTabBar";
import { CoHostAssignmentSheet } from "../components/org-members/CoHostAssignmentSheet";
import { useEventAssignments } from "../hooks/useEventAssignments";
import { useCohostEvents } from "../hooks/useCohostEvents";
import { useMemberRoleContext } from "../contexts/MemberRoleContext";

type SectionVisibility = Record<SectionKey, boolean>;

const APP_BASE_URL = process.env.EXPO_PUBLIC_APP_URL ?? "https://flme.co";

export default function OrgEventDetailScreen() {
  return (
    <RequireAuthGate>
      <OrgEventDetailContent />
    </RequireAuthGate>
  );
}

/**
 * Placeholder card shown while enriched data is loading.
 * Keeps all 4 section slots present from the first render so the layout
 * doesn't shift when data arrives — industry standard skeleton pattern.
 */
function EnrichedSectionSkeleton({ label }: { label: string }) {
  return (
    <View
      className="rounded-card px-4 flex-row items-center justify-between"
      style={{
        backgroundColor: "rgba(255,255,255,0.05)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        minHeight: 56,
      }}
    >
      <Text className="text-white-50 text-sm font-poppins">{label}</Text>
      <ActivityIndicator size="small" color="#FFFFFF" />
    </View>
  );
}

function OrgEventDetailContent() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // W0-Q2: shared with OrgSendTicketsCard so it can scroll the newly-revealed
  // "configure ticket/order" block into view when a recipient is selected.
  const scrollViewRef = useRef<ScrollView>(null);
  const id = Array.isArray(params.id) ? params.id[0] : (params.id ?? "");
  const { memberRole, selectedOrgId } = useMemberRoleContext();
  const isAdmin = canManageMembers(memberRole);

  const {
    data: orgEvents,
    isLoading: eventsLoading,
    error: eventsError,
    refetch,
  } = useOrgEvents(selectedOrgId);

  // Co-host data (needed for co-host management UI and as a safety-net fallback
  // for event resolution in case useOrgEvents cache hasn't settled yet).
  // Note: useCohostEvents uses selectedOrgId (finds events where THIS org is co-host).
  // useEventAssignments uses ownerOrgId (finds assignments owned by the EVENT's org).
  const { data: cohostEventsData } = useCohostEvents(selectedOrgId);

  // Resolve the event: useOrgEvents now includes both owned + co-hosted events,
  // but we keep the cohostEventsData fallback for safety while cache is still warming.
  const event = useMemo(
    () =>
      orgEvents?.find(e => e.id === id) ??
      cohostEventsData?.find(ce => ce.event.id === id)?.event ??
      null,
    [orgEvents, cohostEventsData, id],
  );

  // For co-hosted events the enriched data (purchases, promo codes, promoter links,
  // promotional tickets) lives under the OWNER org's API response, not the co-host
  // org's. Pass the event's organization_id (owner) so useOrgEventEnriched calls the
  // correct /api/organizer/data endpoint. Falls back to selectedOrgId while the event
  // is still loading (first render); TanStack Query will re-fetch with the correct key.
  const ownerOrgId = event?.organization_id ?? selectedOrgId;
  const { data: ownerOrgData } = useOrgData(ownerOrgId);

  const {
    data: assignments,
    isLoading: assignmentsLoading,
  } = useEventAssignments(ownerOrgId);

  const {
    data: enrichedEvent,
    isLoading: enrichedLoading,
    error: enrichedError,
    refetch: refetchEnriched,
  } = useOrgEventEnriched(id || undefined, ownerOrgId);

  const currentCohosts = useMemo(() => {
    if (!assignments) return null; // null = still loading / unknown
    return assignments.filter(
      (a) => a.event_id === id && a.cohost_organization_id != null
    );
  }, [assignments, id]);
  const [cohostSheetVisible, setCohostSheetVisible] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetch(), refetchEnriched()]);
    } catch (err) {
      console.error("[OrgEventDetail] handleRefresh failed", {
        action: "refresh",
        eventId: id,
        err: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRefreshing(false);
    }
  }, [refetch, refetchEnriched, id]);

  const [sections, setSections] = useState<SectionVisibility>({
    promotions: true,
    sendTickets: true,
    promoterLinks: true,
    purchasedDetails: true,
  });

  const toggleSection = (key: SectionKey) => {
    setSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const eventDisplay = useMemo(() => {
    if (!event) return null;
    const raw = event.timezone?.trim() ?? "";
    const tz = raw && isValidIanaTimezone(raw) ? raw : undefined;
    return {
      id: event.id,
      eventName: event.name,
      description: event.description ?? "",
      eventImageUrl:
        event.image_url ||
        "https://placehold.co/600x400/1a1a2e/ffffff?text=No+Image",
      date: event.starts_at ? formatEventDate(event.starts_at, tz) : "",
      timeRange: buildTimeRange(event.starts_at, event.ends_at, tz, event.city),
      location: [event.venue, event.city].filter(Boolean).join(", "),
    };
  }, [event]);

  const promoCodesDisplay = useMemo(
    () =>
      (enrichedEvent?.promotional_codes ?? []).map((p: EnrichedPromoCode) => ({
        id: p.id,
        code: p.code,
        discountPercent: p.discount_percentage,
        usedCount: p.usage_count,
        maxUses: p.usage_limit,
      })),
    [enrichedEvent],
  );

  const eventSlug = event?.slug ?? "";

  const promoterLinksDisplay = useMemo(
    () =>
      (enrichedEvent?.promoter_links ?? []).map((l: EnrichedPromoterLink) => ({
        id: l.id,
        code: l.promoter_code,
        fullUrl: eventSlug
          ? `${APP_BASE_URL}/events/${eventSlug}?promoter=${encodeURIComponent(l.promoter_code)}`
          : null,
        ticketsSold: l.total_tickets_sold,
        revenueCents: l.total_revenue_cents,
      })),
    [enrichedEvent, eventSlug],
  );

  const purchaseStats = useMemo(() => {
    if (!event)
      return {
        ticketQuantity: 0,
        requestedTickets: 0,
        soldTickets: 0,
        revenue: 0,
      };
    const totalCapacity = event.ticket_tiers.reduce(
      (s, t) => s + t.quantity_total,
      0,
    );

    // Use enriched data for accurate revenue (from actual orders, not tier prices)
    // Web: totalRevenue = purchases.reduce((sum, p) => sum + p.basePrice, 0)
    if (enrichedEvent) {
      return {
        ticketQuantity: totalCapacity,
        requestedTickets: enrichedEvent.pending_rsvps ?? 0,
        soldTickets: enrichedEvent.totalAttendees,
        revenue: enrichedEvent.totalRevenue,
      };
    }

    // Fallback: tier-based estimate while enriched data loads (revenue ≈ sum of tier.price * sold)
    const sold = event.ticket_tiers.reduce((s, t) => s + t.quantity_sold, 0);
    const revenueCents = event.ticket_tiers.reduce(
      (s, t) => s + (t.price_cents ?? 0) * (t.quantity_sold ?? 0),
      0,
    );
    return {
      ticketQuantity: totalCapacity,
      requestedTickets: 0,
      soldTickets: sold,
      revenue: revenueCents,
    };
  }, [event, enrichedEvent]);

  const tiers = useMemo(() => event?.ticket_tiers ?? [], [event]);

  useEffect(() => {
    if (eventsError) {
      console.error("[OrgEventDetail] fetch events failed", {
        action: "fetchEvents",
        eventId: id,
        err:
          eventsError instanceof Error
            ? eventsError.message
            : String(eventsError),
      });
    }
  }, [eventsError, id]);

  useEffect(() => {
    if (enrichedError) {
      console.error("[OrgEventDetail] enriched data failed", {
        action: "fetchEnriched",
        eventId: id,
        err:
          enrichedError instanceof Error
            ? enrichedError.message
            : String(enrichedError),
      });
    }
  }, [enrichedError, id]);

  if (eventsLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  if (eventsError) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6 gap-3">
        <Ionicons
          name="alert-circle-outline"
          size={36}
          color={colors["white-30"]}
        />
        <Text className="text-white-100 text-lg font-poppins-semibold text-center">
          Failed to load event
        </Text>
        <Text className="text-white-50 text-sm font-poppins text-center">
          Unable to load events. Please try again.
        </Text>
        <Pressable
          onPress={() => handleRefresh()}
          className="bg-white-10 rounded-card px-4 py-2"
        >
          <Text className="text-white-100 text-sm font-poppins-medium">
            Retry
          </Text>
        </Pressable>
        <Pressable onPress={() => router.back()} className="mt-1">
          <Text className="text-white-50 text-sm font-poppins">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  if (!event || !eventDisplay) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Pressable
          onPress={() => router.back()}
          className="absolute left-4 flex-row items-center gap-[7px]"
          style={{ top: Math.max(16, insets.top) }}
        >
          <Ionicons name="arrow-back" size={24} color="#F9FBFE" />
          <Text className="text-white-100 text-sm leading-5 font-poppins">
            Go Back
          </Text>
        </Pressable>
        <Text className="text-white-100 text-base leading-[22px] font-poppins">
          Event not found
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <DashboardBar avatarUrl={ownerOrgData?.logoUrl} />
      <ScrollView
        ref={scrollViewRef}
        className="flex-1 bg-background"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // W0-Q2: keep the focused input (e.g. the Send Tickets email/qty fields
        // at the bottom of the page) above the on-screen keyboard. iOS-only;
        // no-op on Android, which resizes via android:windowSoftInputMode.
        // More reliable than KeyboardAvoidingView for a form deep inside a
        // ScrollView — it grows the scroll inset so the field rides above the
        // keyboard instead of being clipped at the bottom of the page.
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        onScrollBeginDrag={Keyboard.dismiss}
        contentContainerStyle={{
          paddingTop: 14,
          paddingBottom: getTabBarPaddingBottom(insets.bottom),
        }}
        refreshControl={
          <CustomRefreshControl
            refreshing={refreshing && !eventsLoading}
            onRefresh={handleRefresh}
          />
        }
      >
        <View className="gap-[30px]">
          <View className="px-4 gap-6">
            <Pressable
              onPress={() => router.back()}
              className="flex-row items-center gap-[7px]"
            >
              <Ionicons name="arrow-back" size={24} color="#F9FBFE" />
              <Text className="text-white-100 text-sm leading-5 font-poppins">
                Go Back
              </Text>
            </Pressable>
            <View className="flex-row items-center justify-between">
              <Text className="text-white-100 text-sm leading-5 font-poppins flex-1">
                {event.name ?? "Untitled event"}
              </Text>
              <Pressable
                onPress={() => router.push(`/edit-event?id=${id}`)}
                className="flex-row items-center bg-white-10 rounded-card px-3 py-[6px] gap-[6px] ml-3"
              >
                <Ionicons
                  name="create-outline"
                  size={16}
                  color={colors["white-100"]}
                />
                <Text className="text-white-100 text-xs font-poppins-medium">
                  Edit
                </Text>
              </Pressable>
            </View>
          </View>

          <OrgEventInfoCard event={eventDisplay} />

          {/* Co-hosts row — admin only */}
          {isAdmin && (
            <View className="px-4">
              <Pressable
                onPress={() => setCohostSheetVisible(true)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: "rgba(255,255,255,0.05)",
                  borderRadius: 14,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: "#238FDA20",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="people-outline" size={20} color="#238FDA" />
                  </View>
                  <View>
                    <Text className="text-white-100 text-sm font-poppins-medium">
                      Co-hosts
                    </Text>
                    <Text className="text-white-50 text-xs font-poppins">
                      {assignmentsLoading || currentCohosts === null
                        ? "Loading…"
                        : currentCohosts.length === 0
                        ? "No co-host organizations"
                        : `${currentCohosts.length} co-host${currentCohosts.length > 1 ? "s" : ""}`}
                    </Text>
                  </View>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors["white-50"]}
                />
              </Pressable>
            </View>
          )}

          <OrgActionButtons onToggle={toggleSection} sections={sections} />

          {/* Inline error + retry when enriched API fails (event found but enriched data failed) */}
          {!enrichedEvent && enrichedError && (
            <View className="px-4 py-4 bg-white-5 rounded-card gap-3 mx-4">
              <Ionicons
                name="alert-circle-outline"
                size={24}
                color={colors["white-30"]}
              />
              <Text className="text-white-100 text-sm font-poppins">
                Could not load purchase stats and tickets
              </Text>
              <Text className="text-white-50 text-xs font-poppins">
                {enrichedError instanceof Error
                  ? enrichedError.message
                  : "Please try again."}
              </Text>
              <Pressable
                onPress={async () => {
                  try {
                    await refetchEnriched();
                  } catch (err) {
                    console.error("[OrgEventDetail] retry enriched failed", {
                      action: "retryEnriched",
                      eventId: id,
                      err: err instanceof Error ? err.message : String(err),
                    });
                  }
                }}
                className="bg-white-10 rounded-card px-4 py-2 self-start"
              >
                <Text className="text-white-100 text-sm font-poppins-medium">
                  Retry
                </Text>
              </Pressable>
            </View>
          )}

          <View className="px-4 gap-2">
            {/* Industry standard: all 4 sections are always mounted so content
                doesn't pop in staggered. While enriched data is in flight, the
                3 enriched sections show a skeleton shell. Once data arrives they
                transition in-place — no layout shift, no surprise pop-in. */}
            {sections.promotions && (
              enrichedLoading && !enrichedEvent ? (
                <EnrichedSectionSkeleton label="Promotions" />
              ) : enrichedEvent ? (
                <OrgPromotionsCard
                  eventId={id}
                  promoCodes={promoCodesDisplay}
                  onClose={() => toggleSection("promotions")}
                />
              ) : null
            )}
            {sections.sendTickets && (
              enrichedLoading && !enrichedEvent ? (
                <EnrichedSectionSkeleton label="Send Tickets" />
              ) : (
                <OrgSendTicketsCard
                  eventId={id}
                  scrollViewRef={scrollViewRef}
                  tiers={tiers}
                  promotionalTickets={
                    enrichedEvent
                      ? (enrichedEvent.promotional_tickets ?? []).filter(
                          (t: EnrichedPromotionalTicket) => !t.is_bank_transfer,
                        )
                      : []
                  }
                  bankTransferOrders={
                    enrichedEvent
                      ? (enrichedEvent.bank_transfer_orders ?? []).concat(
                          (enrichedEvent.promotional_tickets ?? []).filter(
                            (t: EnrichedPromotionalTicket) => t.is_bank_transfer,
                          ),
                        )
                      : []
                  }
                  currency={event?.currency}
                  onClose={() => toggleSection("sendTickets")}
                />
              )
            )}
            {sections.promoterLinks && (
              enrichedLoading && !enrichedEvent ? (
                <EnrichedSectionSkeleton label="Promoter Links" />
              ) : enrichedEvent ? (
                <OrgPromoterLinksCard
                  eventId={id}
                  links={promoterLinksDisplay}
                  onClose={() => toggleSection("promoterLinks")}
                />
              ) : null
            )}
            {sections.purchasedDetails && (
              enrichedLoading && !enrichedEvent ? (
                <EnrichedSectionSkeleton label="Purchase Details" />
              ) : enrichedEvent ? (
                <OrgPurchasedDetailsCard
                  stats={purchaseStats}
                  purchases={enrichedEvent.purchases ?? []}
                  currency={event?.currency}
                  eventName={enrichedEvent.name ?? event?.name ?? ""}
                  eventTimezone={enrichedEvent.timezone ?? event?.timezone ?? null}
                  registrationFormConfig={
                    enrichedEvent.registration_form_config ?? null
                  }
                  onRefetchBeforeExport={async () => {
                    const result = await refetchEnriched();
                    const fresh = (result.data ?? []).find(
                      (e) => e.id === id,
                    );
                    if (!fresh) return null;
                    return {
                      purchases: fresh.purchases ?? [],
                      registrationFormConfig:
                        fresh.registration_form_config ?? null,
                      eventName: fresh.name,
                      eventTimezone: fresh.timezone ?? null,
                      currency: fresh.currency,
                    };
                  }}
                  onClose={() => toggleSection("purchasedDetails")}
                />
              ) : null
            )}
          </View>
        </View>
      </ScrollView>

      {/* Co-host assignment sheet */}
      {isAdmin && ownerOrgId && (
        <CoHostAssignmentSheet
          visible={cohostSheetVisible}
          onClose={() => setCohostSheetVisible(false)}
          orgId={ownerOrgId}
          eventId={id}
          eventName={event?.name ?? ""}
        />
      )}
    </View>
  );
}

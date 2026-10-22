/**
 * Organizer Admin — Screen 3 of the mobile nav restructure.
 *
 * Pushed from Personal Profile when the user taps one of their organizations.
 * Shows (in order): back bar, Stripe payment-account banner (if action needed),
 * stats + QR scanner card, org header row with Manage CTA, Manage Team +
 * Manage RSVPs buttons, description, current & upcoming events search/list,
 * past-events accordion.
 *
 * Role gating drives which action buttons render (canManageMembers,
 * canManagePayouts, canViewAllEvents). Unapproved orgs fall through to
 * PendingApprovalBanner.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Linking,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SCANNING_SUPPORTED } from "../lib/scanner-platform";
import { Feather, Ionicons } from "@expo/vector-icons";
import {
  FlameImage,
  FlameText,
  colors,
  CustomRefreshControl,
  Skeleton,
} from "@project-flame/ui";
import { getTabBarPaddingBottom } from "../components/navigation/CustomTabBar";
import { TicketSearchBar } from "../components/dashboard/TicketSearchBar";
import type { OrgStatsSectionProps } from "../components/org-dashboard/OrgStatsSection";
import {
  OrgEventCard,
  type OrgEventCardData,
} from "../components/org-dashboard/OrgEventCard";
import {
  useOrgEvents,
  type OrgEvent,
  type OrgEventTier,
} from "../hooks/useOrgEvents";
import { useOrgData } from "../hooks/useOrgData";
import { useOptionalAuth } from "../hooks/useOptionalAuth";
import { RequireAuthGate } from "../hooks/useRequireAuth";
import {
  useOrgDashboardStats,
  type RevenueMap,
} from "../hooks/useOrgDashboardStats";
import { useMemberRoleContext } from "../contexts/MemberRoleContext";
import { PastItemsAccordion } from "../components/shared/PastItemsAccordion";
import { PendingApprovalBanner } from "../components/org-dashboard/PendingApprovalBanner";
import { useStripeConnect } from "../hooks/useStripeConnect";
import {
  separateEventsByDate,
  formatEventDate,
  buildTimeRange,
  isValidIanaTimezone,
  canManageMembers,
  canManagePayouts,
  canViewAllEvents,
  canManageAssignedEvents,
  canCreateEvents,
  formatCentsAsPrice,
  foldForSearch,
} from "@project-flame/lib";
import { useEventAssignments } from "../hooks/useEventAssignments";
import { useCohostEvents } from "../hooks/useCohostEvents";
import { useCohostRevenueMap } from "../hooks/useOrgEventEnriched";
import { useAssignedEvents } from "../hooks/useAssignedEvents";

const DEFAULT_IMAGE = "https://placehold.co/100x100/1a1a2e/ffffff?text=No+Img";

function computeTierRevenueCents(tiers: OrgEventTier[]): number {
  return tiers.reduce((sum, t) => {
    if (t.ticket_stages && t.ticket_stages.length > 0) {
      return (
        sum +
        t.ticket_stages.reduce(
          (s, st) => s + (st.sold_quantity || 0) * (st.price_cents || 0),
          0,
        )
      );
    }
    return sum + (t.quantity_sold || 0) * (t.price_cents || 0);
  }, 0);
}

function computeTierAttendees(tiers: OrgEventTier[]): number {
  return tiers.reduce((sum, t) => {
    if (t.ticket_stages && t.ticket_stages.length > 0) {
      return (
        sum + t.ticket_stages.reduce((s, st) => s + (st.sold_quantity || 0), 0)
      );
    }
    return sum + (t.quantity_sold || 0);
  }, 0);
}

function mapOrgEventToCardData(
  event: OrgEvent,
  revenueMap?: RevenueMap,
  revenueLoading = false,
): OrgEventCardData {
  const attendees = computeTierAttendees(event.ticket_tiers);
  const revenueCents =
    revenueMap !== undefined
      ? revenueMap.has(event.id)
        ? revenueMap.get(event.id)!
        : 0
      : computeTierRevenueCents(event.ticket_tiers);
  const rawTz = event.timezone?.trim() ?? "";
  const tz = isValidIanaTimezone(rawTz) ? rawTz : undefined;
  return {
    id: event.id,
    eventName: event.name,
    eventImageUrl: event.image_url || DEFAULT_IMAGE,
    date: formatEventDate(event.starts_at, tz),
    timeRange: buildTimeRange(event.starts_at, event.ends_at, tz, event.city),
    location: [event.venue, event.city].filter(Boolean).join(", "),
    attendees,
    revenueCents,
    revenueLoading,
    currency: event.currency,
    isRsvp: event.requires_rsvp,
  };
}

export default function OrganizerAdminScreen() {
  return (
    <RequireAuthGate>
      <OrganizerAdminContent />
    </RequireAuthGate>
  );
}

function OrganizerAdminContent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ orgId?: string | string[] }>();
  const routeOrgId = Array.isArray(params.orgId) ? params.orgId[0] : params.orgId;
  const { userId } = useOptionalAuth();
  const {
    memberRole,
    selectedOrgId,
    setSelectedOrgId,
    isLoading: roleLoading,
  } = useMemberRoleContext();

  // Keep selected-org context in sync with the route param so downstream
  // screens (scanner, org-event-detail) operate on the same org.
  // Ref-based sync — the exposed selectedOrgId is derived from TanStack Query
  // state and can transiently flip during refetches; depending on it here
  // caused an infinite update loop.
  const syncedOrgIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (routeOrgId && syncedOrgIdRef.current !== routeOrgId) {
      syncedOrgIdRef.current = routeOrgId;
      setSelectedOrgId(routeOrgId);
    }
  }, [routeOrgId, setSelectedOrgId]);

  const effectiveOrgId = routeOrgId ?? selectedOrgId;

  // Role-sync gate (full doc at the original site near the action-tile render).
  // Computed here because useAssignedEvents downstream needs to know whether
  // the caller has full-event access (skip the assignment fetch) or organizer
  // scope (fetch only their assigned events).
  const isRoleSynced =
    !routeOrgId || (selectedOrgId === routeOrgId && !roleLoading);
  const isFullEventAccess = isRoleSynced && canViewAllEvents(memberRole);

  // For organizer-role: fetch only the events assigned to this user (direct
  // user assignments + their org's co-host assignments). Pause until role
  // sync settles to avoid querying with the prior org's permissions.
  // assignedEventIds semantics: undefined = full access (no filter); null =
  // still resolving (skeleton); string[] = resolved set.
  const { data: assignedEvents } = useAssignedEvents(
    isFullEventAccess ? undefined : userId,
    isFullEventAccess ? undefined : effectiveOrgId,
  );
  const assignedEventIds = useMemo<string[] | null | undefined>(() => {
    if (!isRoleSynced) return null;
    if (isFullEventAccess) return undefined;
    if (assignedEvents === undefined) return null;
    return assignedEvents.map(e => e.id);
  }, [isRoleSynced, isFullEventAccess, assignedEvents]);

  const {
    data: orgData,
    isLoading: orgLoading,
    error: orgError,
    refetch: orgRefetch,
    isRefetching: orgRefetching,
  } = useOrgData(effectiveOrgId);

  const {
    data: orgEvents,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useOrgEvents(effectiveOrgId);
  const {
    data: revenueMap,
    error: statsError,
    isLoading: statsLoading,
    refetch: refetchStats,
    isRefetching: statsRefetching,
  } = useOrgDashboardStats(effectiveOrgId);

  // Co-host data: assignments made BY this org + events where this org is co-host
  const {
    data: assignments,
    isLoading: assignmentsLoading,
    error: assignmentsError,
    refetch: refetchAssignments,
    isRefetching: assignmentsRefetching,
  } = useEventAssignments(effectiveOrgId);
  const {
    data: cohostEvents,
    isLoading: cohostEventsLoading,
    error: cohostEventsError,
    refetch: refetchCohostEvents,
    isRefetching: cohostEventsRefetching,
  } = useCohostEvents(effectiveOrgId);
  // Per-event net revenue for cohosted events (server-computed — RLS hides the
  // owner's orders from this client, so it can't be derived locally).
  const {
    data: cohostRevenueMap,
    error: cohostRevenueError,
    isLoading: cohostRevenueLoading,
    isRefetching: cohostRevenueRefetching,
    refetch: refetchCohostRevenue,
  } = useCohostRevenueMap(effectiveOrgId);

  const cohostBadgeMap = useMemo(() => {
    const map = new Map<string, string>();
    if (assignments && !assignmentsLoading && !assignmentsError) {
      const byEvent = new Map<string, string[]>();
      for (const a of assignments) {
        if (a.cohost_organization_id && a.cohost_org_name) {
          const list = byEvent.get(a.event_id) ?? [];
          list.push(a.cohost_org_name);
          byEvent.set(a.event_id, list);
        }
      }
      for (const [eventId, cohostNames] of byEvent) {
        const uniqueNames = [...new Set(cohostNames)];
        map.set(eventId, `Co-host with ${uniqueNames.join(" & ")}`);
      }
    }
    if (cohostEvents && !cohostEventsLoading && !cohostEventsError) {
      for (const ce of cohostEvents) {
        if (!map.has(ce.event.id)) {
          map.set(ce.event.id, `Co-host with ${ce.ownerOrgName}`);
        }
      }
    }
    return map;
  }, [
    assignments,
    assignmentsLoading,
    assignmentsError,
    cohostEvents,
    cohostEventsLoading,
    cohostEventsError,
  ]);

  const hasError = Boolean(orgError || error);
  const statsFailed = Boolean(statsError && !revenueMap && !statsLoading);
  const statsLoadingBanner = Boolean(!revenueMap && statsLoading);
  const isRefreshing =
    orgRefetching ||
    isRefetching ||
    statsRefetching ||
    assignmentsRefetching ||
    cohostEventsRefetching ||
    cohostRevenueRefetching;

  const [searchQuery, setSearchQuery] = useState("");

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      orgRefetch(),
      refetch(),
      refetchStats(),
      refetchAssignments(),
      refetchCohostEvents(),
      refetchCohostRevenue(),
    ]);
  }, [
    orgRefetch,
    refetch,
    refetchStats,
    refetchAssignments,
    refetchCohostEvents,
    refetchCohostRevenue,
  ]);

  const { currentEvents, pastEvents } = useMemo(() => {
    if (!orgEvents) return { currentEvents: [], pastEvents: [] };
    // Organizer-role: scope to assigned events. `undefined` = full access
    // (owner/admin), `null` = still resolving (skeleton stays visible),
    // array = filter by these IDs.
    if (assignedEventIds === null) return { currentEvents: [], pastEvents: [] };
    const scopedEvents =
      assignedEventIds === undefined
        ? orgEvents
        : orgEvents.filter(e => assignedEventIds.includes(e.id));
    return separateEventsByDate(scopedEvents);
  }, [orgEvents, assignedEventIds]);

  const { cohostCurrentEvents, cohostPastEvents } = useMemo(() => {
    if (!cohostEvents || cohostEvents.length === 0)
      return { cohostCurrentEvents: [], cohostPastEvents: [] };
    const ownEventIds = new Set(orgEvents?.map((e) => e.id) ?? []);
    const uniqueCohostEvents = cohostEvents.filter(
      (ce) => !ownEventIds.has(ce.event.id),
    );
    const separated = separateEventsByDate(
      uniqueCohostEvents.map((ce) => ce.event),
    );
    return {
      cohostCurrentEvents: separated.currentEvents,
      cohostPastEvents: separated.pastEvents,
    };
  }, [cohostEvents, orgEvents]);

  // Pick the correct revenue source per event by OWNERSHIP, not by bucket.
  // useOrgEvents returns BOTH owned and co-hosted events in `orgEvents` (see its
  // `.or(organization_id.eq…, id.in.(cohostEventIds))` query), so co-hosted
  // events land in currentEvents/pastEvents (the "own" bucket) and are deduped
  // OUT of cohostCurrentEvents/cohostPastEvents. A co-hosted event's orders live
  // under the OWNER org and are hidden from this client by RLS, so its local
  // revenueMap entry is always $0 — its net revenue can only come from the
  // server (cohostRevenueMap). Owned events (organization_id === effectiveOrgId)
  // keep using the locally-computed revenueMap.
  const revenueMapForEvent = useCallback(
    (e: OrgEvent): RevenueMap | undefined =>
      effectiveOrgId && e.organization_id !== effectiveOrgId
        ? cohostRevenueMap
        : revenueMap,
    [effectiveOrgId, revenueMap, cohostRevenueMap],
  );

  // Mirror of revenueMapForEvent for the loading state. A card's authoritative
  // revenue is "still loading" when its source query is loading and hasn't yet
  // produced a map. During that window the card renders a "—" placeholder
  // instead of the gross tier estimate, so the figure never visibly corrects
  // downward once the real value lands (the co-hosted $15,600 → $15,542 flash).
  // On ERROR this is false (query settled), so the card falls back to the gross
  // estimate + the "Revenue estimates shown…" banner — the intended degraded
  // state. Applies symmetrically to owned (revenueMap/statsLoading) and
  // co-hosted (cohostRevenueMap/cohostRevenueLoading) events.
  const revenueLoadingForEvent = useCallback(
    (e: OrgEvent): boolean =>
      effectiveOrgId && e.organization_id !== effectiveOrgId
        ? Boolean(cohostRevenueLoading && !cohostRevenueMap)
        : Boolean(statsLoading && !revenueMap),
    [
      effectiveOrgId,
      cohostRevenueLoading,
      cohostRevenueMap,
      statsLoading,
      revenueMap,
    ],
  );

  // Surface the cohost revenue banners whenever the dashboard actually shows a
  // co-hosted event (owner org differs from the current org), regardless of
  // which bucket it renders in. Only then is the disclaimer meaningful.
  const hasCohostCards = useMemo(
    () =>
      (Boolean(effectiveOrgId) &&
        (orgEvents ?? []).some((e) => e.organization_id !== effectiveOrgId)) ||
      cohostCurrentEvents.length > 0 ||
      cohostPastEvents.length > 0,
    [orgEvents, effectiveOrgId, cohostCurrentEvents, cohostPastEvents],
  );
  // Cohost equivalent of statsFailed: live net revenue couldn't be fetched, so
  // the co-hosted cards fall back to a gross tier estimate (undefined map).
  const cohostStatsFailed = Boolean(
    hasCohostCards &&
      cohostRevenueError &&
      !cohostRevenueMap &&
      !cohostRevenueLoading,
  );
  // Cohost equivalent of statsLoadingBanner: while live net revenue is loading
  // the co-hosted cards fall back to a gross tier estimate, so mirror the owner
  // "Loading live revenue…" affordance instead of showing gross with no context.
  const cohostStatsLoading = Boolean(
    hasCohostCards && cohostRevenueLoading && !cohostRevenueMap,
  );

  const cohostRevenueBucketLoading = Boolean(
    cohostRevenueLoading && !cohostRevenueMap,
  );

  const currentCardData = useMemo(() => {
    const own = currentEvents.map((e) =>
      mapOrgEventToCardData(e, revenueMapForEvent(e), revenueLoadingForEvent(e)),
    );
    const cohost = cohostCurrentEvents.map((e) =>
      mapOrgEventToCardData(e, cohostRevenueMap, cohostRevenueBucketLoading),
    );
    return [...own, ...cohost];
  }, [
    currentEvents,
    cohostCurrentEvents,
    revenueMapForEvent,
    revenueLoadingForEvent,
    cohostRevenueMap,
    cohostRevenueBucketLoading,
  ]);

  const pastCardData = useMemo(() => {
    const own = pastEvents.map((e) =>
      mapOrgEventToCardData(e, revenueMapForEvent(e), revenueLoadingForEvent(e)),
    );
    const cohost = cohostPastEvents.map((e) =>
      mapOrgEventToCardData(e, cohostRevenueMap, cohostRevenueBucketLoading),
    );
    return [...own, ...cohost];
  }, [
    pastEvents,
    cohostPastEvents,
    revenueMapForEvent,
    revenueLoadingForEvent,
    cohostRevenueMap,
    cohostRevenueBucketLoading,
  ]);

  const filteredCurrentData = useMemo(() => {
    if (!searchQuery.trim()) return currentCardData;
    const q = foldForSearch(searchQuery.trim());
    return currentCardData.filter((c) => foldForSearch(c.eventName).includes(q));
  }, [currentCardData, searchQuery]);

  const filteredPastData = useMemo(() => {
    if (!searchQuery.trim()) return pastCardData;
    const q = foldForSearch(searchQuery.trim());
    return pastCardData.filter((c) => foldForSearch(c.eventName).includes(q));
  }, [pastCardData, searchQuery]);

  const stats: OrgStatsSectionProps = useMemo(() => {
    if (!orgEvents)
      return { totalEvents: 0, totalRevenueCents: 0, currency: "USD" };
    const totalEvents = orgEvents.length;
    const perCurrency = new Map<string, number>();
    let totalRevenueCents = 0;
    for (const e of orgEvents) {
      // Co-hosted events (owned by another org) must never contribute to THIS
      // org's headline total — their orders live under the owner and are
      // surfaced only on the individual card (via cohostRevenueMap). Skip them
      // entirely: excluding revenue alone would still add their currency to
      // `perCurrency` as a zero-value bucket, which corrupts the single-currency
      // detection below (a co-hosted EUR event on an otherwise all-USD org would
      // flip `perCurrency.size` to 2 and mislabel the headline currency). The
      // `totalEvents` count above still includes them, matching the card list.
      const isCohosted =
        Boolean(effectiveOrgId) && e.organization_id !== effectiveOrgId;
      if (isCohosted) continue;
      const rev =
        revenueMap !== undefined
          ? revenueMap.has(e.id)
            ? revenueMap.get(e.id)!
            : 0
          : computeTierRevenueCents(e.ticket_tiers);
      totalRevenueCents += rev;
      const cur = e.currency || "USD";
      perCurrency.set(cur, (perCurrency.get(cur) || 0) + rev);
    }
    const currency =
      perCurrency.size === 1
        ? [...perCurrency.keys()][0]
        : orgEvents[0]?.currency || "USD";
    return {
      totalEvents,
      totalRevenueCents,
      revenueByCurrency: perCurrency,
      currency,
    };
  }, [orgEvents, revenueMap, effectiveOrgId]);

  const handleScanPress = useCallback(() => {
    router.push({
      pathname: "/scanner",
      params: effectiveOrgId ? { orgId: effectiveOrgId } : {},
    });
  }, [router, effectiveOrgId]);

  // Pending-approval state: show banner in place of content
  if (orgData && !orgData.approved) {
    return (
      <View className="flex-1 bg-background">
        <TopBar onBack={() => router.back()} />
        <PendingApprovalBanner organizationName={orgData.organizationName} />
      </View>
    );
  }

  const initials = orgData?.organizationName.charAt(0).toUpperCase() ?? "?";
  const orgCity = orgData?.city ?? null;
  const normalizedInstagram =
    orgData?.instagramHandle?.trim().replace(/^@+/, "") || "";
  const hasMetaRow = Boolean(orgCity || normalizedInstagram);

  // Role-sync gate — release UI only when (a) selectedOrgId has caught up to
  // the routed org, AND (b) the member-role query has settled for that org.
  //
  // Why both signals are required:
  //   - selectedOrgId match alone: when re-entering a cached org, selectedOrgId
  //     already === routeOrgId, but the role query may still be in flight, so
  //     memberRole is null briefly and role-gated tiles compute as "no perms"
  //     → user sees "QR Scanner only" before the real 4-tile set arrives.
  //   - !roleLoading alone: when switching from Org A admin to Org B admin,
  //     roleLoading flips false fast but memberRole is still A's role for one
  //     render before the new query starts.
  //
  // Derived from reactive context values (not refs) so the gate releases
  // automatically when either signal updates.
  // isRoleSynced + isFullEventAccess are computed earlier in this component
  // (right after effectiveOrgId) because useAssignedEvents needs them.
  const canManage = isRoleSynced && canManagePayouts(memberRole);
  const canTeam = isRoleSynced && canManageMembers(memberRole);
  // RSVPs tile is visible to organizers too (they manage RSVPs of assigned
  // events). Per-event scope is enforced by useAssignedEvents downstream.
  const canRsvp = isRoleSynced && canManageAssignedEvents(memberRole);
  const canCreate = isRoleSynced && canCreateEvents(memberRole);

  // Build action tiles conditionally based on role
  const actionTiles: Array<{
    key: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  }> = SCANNING_SUPPORTED
    ? [
        {
          key: "qr",
          label: "QR Scanner",
          icon: "qr-code-outline",
          onPress: handleScanPress,
        },
      ]
    : [];
  // Append ?orgId=X only when effectiveOrgId is present. A blank ?orgId=
  // would be treated as truthy by receivers and defeat their fall-back to the
  // shared context's selectedOrgId.
  const withOrgParam = (base: string) =>
    effectiveOrgId
      ? `${base}?orgId=${encodeURIComponent(effectiveOrgId)}`
      : base;

  if (canTeam) {
    actionTiles.push({
      key: "team",
      label: "Team",
      icon: "people-outline",
      onPress: () => router.push(withOrgParam("/org-members") as never),
    });
  }
  if (canRsvp) {
    actionTiles.push({
      key: "rsvps",
      label: "RSVPs",
      icon: "mail-open-outline",
      onPress: () => router.push(withOrgParam("/rsvp-management") as never),
    });
  }
  if (canCreate) {
    actionTiles.push({
      key: "create",
      label: "Create Event",
      icon: "add-circle-outline",
      onPress: () => router.push(withOrgParam("/create-event") as never),
    });
  }

  return (
    <View className="flex-1 bg-background">
      <TopBar onBack={() => router.back()} />
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: 14,
          paddingBottom: getTabBarPaddingBottom(insets.bottom),
        }}
        refreshControl={
          <CustomRefreshControl
            refreshing={isRefreshing && !orgLoading && !isLoading}
            onRefresh={handleRefresh}
          />
        }
      >
        <View className="gap-[30px]">
          {/* Org header row */}
          <View className="px-4">
            <View className="flex-row items-start gap-3">
              {orgLoading && !orgData ? (
                <Skeleton className="size-[70px] rounded-card" />
              ) : (
                <View className="size-[70px] rounded-card bg-white-10 items-center justify-center overflow-hidden">
                  {orgData?.logoUrl ? (
                    <FlameImage
                      source={{ uri: orgData.logoUrl }}
                      className="w-full h-full"
                      contentFit="cover"
                    />
                  ) : (
                    <Text className="text-white-100 text-2xl font-poppins-semibold">
                      {initials}
                    </Text>
                  )}
                </View>
              )}
              <View className="flex-1 min-w-0">
                {orgLoading && !orgData ? (
                  <View className="gap-2 pt-1">
                    <Skeleton className="h-5 w-[55%] rounded" />
                    <Skeleton className="h-3 w-[35%] rounded" />
                  </View>
                ) : (
                  <Text
                    className="text-white-100 text-lg leading-7 font-poppins-semibold"
                    numberOfLines={1}
                  >
                    {orgData?.organizationName ?? " "}
                  </Text>
                )}
                {hasMetaRow && (
                  <View className="gap-1 mt-[2px]">
                    {orgCity ? (
                      <View className="flex-row items-center gap-1">
                        <Ionicons
                          name="location-outline"
                          size={14}
                          color={colors["white-50"]}
                        />
                        <Text className="text-white-50 text-xs leading-4 font-poppins">
                          {orgCity}
                        </Text>
                      </View>
                    ) : null}
                    {normalizedInstagram ? (
                      <Pressable
                        onPress={() =>
                          Linking.openURL(
                            `https://instagram.com/${normalizedInstagram}`,
                          )
                        }
                        accessibilityRole="link"
                        accessibilityLabel={`Instagram @${normalizedInstagram}`}
                      >
                        <View className="flex-row items-center gap-1">
                          <Ionicons
                            name="logo-instagram"
                            size={14}
                            color={colors["white-50"]}
                          />
                          <Text className="text-white-50 text-xs leading-4 font-poppins">
                            @{normalizedInstagram}
                          </Text>
                        </View>
                      </Pressable>
                    ) : null}
                  </View>
                )}
              </View>
              <View className="items-end gap-2">
                {canManage && (
                  <StripeStatusPill
                    organizationId={effectiveOrgId ?? undefined}
                    onConnect={() =>
                      router.push({
                        pathname: "/account",
                        params: {
                          tab: "payouts",
                          ...(effectiveOrgId ? { orgId: effectiveOrgId } : {}),
                        },
                      })
                    }
                  />
                )}
                {canManage && (
                  <Pressable
                    onPress={() =>
                      router.push(
                        (effectiveOrgId
                          ? `/account?tab=organization&orgId=${encodeURIComponent(effectiveOrgId)}`
                          : "/account?tab=organization") as never,
                      )
                    }
                    className="bg-white-5 border border-white-5 rounded-pill px-4 py-2 flex-row items-center gap-[6px]"
                  >
                    <Ionicons
                      name="settings-outline"
                      size={14}
                      color={colors["white-100"]}
                    />
                    <Text className="text-white-100 text-sm leading-5 font-poppins-medium">
                      Manage
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>

          {/* Stats (Total Events + Total Revenue) — owner/admin only.
              Organizers don't see org-wide revenue numbers; they only act on
              events explicitly assigned to them. */}
          <View className="px-4 gap-2">
            {isFullEventAccess && (
              <View className="flex-row gap-2">
                <StatCard
                  label="Total Events"
                  value={`${stats.totalEvents}`}
                  loading={isLoading && !orgEvents}
                />
                <StatCard
                  label="Total Revenue"
                  value={
                    stats.revenueByCurrency && stats.revenueByCurrency.size > 1
                      ? undefined
                      : formatCentsAsPrice(
                          stats.totalRevenueCents,
                          stats.currency,
                        )
                  }
                  multiCurrency={
                    stats.revenueByCurrency && stats.revenueByCurrency.size > 1
                      ? stats.revenueByCurrency
                      : undefined
                  }
                  // Hold the skeleton until BOTH orgEvents (for the per-event
                  // iteration) and revenueMap (live revenue per event) are
                  // present. Releasing on statsLoading alone caused a flash
                  // through "0" when stats settled before orgEvents.
                  // If stats errors, fall through to the tier-derived estimate
                  // (the "Revenue estimates shown" banner explains it).
                  loading={!orgEvents || (!revenueMap && !statsError)}
                />
              </View>
            )}

            {/* Action tile row — skeleton while role syncs to avoid flashing
                only the role-independent QR Scanner tile. */}
            {!isRoleSynced ? (
              <View className="flex-row gap-2 bg-white-5 border border-white-5 rounded-card p-3">
                <ActionTileSkeleton />
                <ActionTileSkeleton />
                <ActionTileSkeleton />
                <ActionTileSkeleton />
              </View>
            ) : (
              <View className="flex-row gap-2 bg-white-5 border border-white-5 rounded-card p-3">
                {actionTiles.map((tile, idx) => (
                  <Pressable
                    key={tile.key}
                    onPress={tile.onPress}
                    className={`flex-1 items-center gap-2 py-1 ${
                      idx < actionTiles.length - 1 ? "border-r border-white-10" : ""
                    }`}
                  >
                    <Ionicons
                      name={tile.icon}
                      size={26}
                      color={colors["white-100"]}
                    />
                    <Text className="text-white-80 text-xs leading-4 font-poppins-medium">
                      {tile.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {(statsLoadingBanner || cohostStatsLoading) && (
            <Text className="text-white-50 text-xs font-poppins text-center px-4">
              Loading live revenue...
            </Text>
          )}
          {(statsFailed || cohostStatsFailed) && (
            <Text className="text-white-50 text-xs font-poppins text-center px-4">
              Revenue estimates shown — live data unavailable.
            </Text>
          )}

          {/* Events list */}
          <View className="px-4 gap-6">
            <Text className="text-white-100 text-sm leading-5 font-poppins-semibold uppercase">
              {"Current & upcoming events"}
            </Text>
            <TicketSearchBar
              value={searchQuery}
              onChangeText={setSearchQuery}
            />

            {orgLoading || isLoading ? (
              <View className="gap-2">
                <EventCardSkeleton />
                <EventCardSkeleton />
              </View>
            ) : hasError ? (
              <View className="py-12 items-center gap-3">
                <Ionicons
                  name="alert-circle-outline"
                  size={36}
                  color={colors["white-30"]}
                />
                <Text className="text-white-50 text-sm font-poppins text-center">
                  Failed to load events. Please try again.
                </Text>
                <Pressable
                  onPress={handleRefresh}
                  className="bg-white-10 rounded-card px-4 py-2"
                >
                  <Text className="text-white-100 text-sm font-poppins-medium">
                    Retry
                  </Text>
                </Pressable>
              </View>
            ) : filteredCurrentData.length === 0 &&
              filteredPastData.length === 0 ? (
              <View className="py-12 items-center gap-3">
                <Text className="text-white-50 text-sm font-poppins text-center">
                  {searchQuery.trim()
                    ? "No events match your search."
                    : "No current or upcoming events."}
                </Text>
              </View>
            ) : (
              <View className="gap-[30px]">
                {filteredCurrentData.length > 0 && (
                  <View className="gap-2">
                    {filteredCurrentData.map((event) => (
                      <OrgEventCard
                        key={event.id}
                        event={event}
                        cohostBadge={cohostBadgeMap.get(event.id)}
                        onViewDetails={() =>
                          router.push(
                            effectiveOrgId
                              ? `/org-event-detail?id=${event.id}&orgId=${encodeURIComponent(effectiveOrgId)}`
                              : `/org-event-detail?id=${event.id}`,
                          )
                        }
                      />
                    ))}
                  </View>
                )}
                {filteredPastData.length > 0 && (
                  <PastItemsAccordion
                    label="Past events"
                    count={filteredPastData.length}
                  >
                    {filteredPastData.map((event) => (
                      <OrgEventCard
                        key={event.id}
                        event={event}
                        cohostBadge={cohostBadgeMap.get(event.id)}
                        onViewDetails={() =>
                          router.push(
                            effectiveOrgId
                              ? `/org-event-detail?id=${event.id}&orgId=${encodeURIComponent(effectiveOrgId)}`
                              : `/org-event-detail?id=${event.id}`,
                          )
                        }
                      />
                    ))}
                  </PastItemsAccordion>
                )}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function StatCard({
  label,
  value,
  multiCurrency,
  loading,
}: {
  label: string;
  value?: string;
  multiCurrency?: Map<string, number>;
  loading?: boolean;
}) {
  return (
    <View className="flex-1 bg-white-5 border border-white-5 rounded-card p-3 gap-2">
      <Text className="text-white-80 text-base leading-[22px] font-poppins-semibold">
        {label}
      </Text>
      {loading ? (
        <Skeleton className="h-6 w-[60%] rounded" />
      ) : multiCurrency ? (
        <View>
          {[...multiCurrency.entries()].map(([cur, cents]) => (
            <Text
              key={cur}
              className="text-white-100 text-lg font-poppins-semibold"
            >
              {formatCentsAsPrice(cents, cur)}
            </Text>
          ))}
        </View>
      ) : (
        <Text className="text-white-100 text-lg font-poppins-semibold">
          {value ?? ""}
        </Text>
      )}
    </View>
  );
}

function ActionTileSkeleton() {
  return (
    <View className="flex-1 items-center gap-2 py-1">
      <Skeleton className="size-[26px] rounded" />
      <Skeleton className="h-3 w-[70%] rounded" />
    </View>
  );
}

function EventCardSkeleton() {
  return (
    <View className="bg-white-5 border border-white-5 rounded-card p-3 flex-row gap-3">
      <Skeleton className="size-[80px] rounded-card" />
      <View className="flex-1 gap-2 pt-1">
        <Skeleton className="h-5 w-[80%] rounded" />
        <Skeleton className="h-3 w-[55%] rounded" />
        <Skeleton className="h-3 w-[40%] rounded" />
      </View>
    </View>
  );
}

function StripeStatusPill({
  organizationId,
  onConnect,
}: {
  organizationId: string | undefined;
  onConnect: () => void;
}) {
  const { status, isLoading } = useStripeConnect(organizationId);
  // Reserve the slot with a skeleton so the pill doesn't pop in late and
  // shift the org header layout. ~120×24 matches the "Stripe Connected"
  // pill's rendered size.
  if (isLoading || !status) {
    return <Skeleton className="h-6 w-[120px] rounded-pill" />;
  }

  const isFullyConnected =
    status.connected && status.chargesEnabled && status.payoutsEnabled;

  if (isFullyConnected) {
    return (
      <View className="bg-[rgba(34,197,94,0.15)] rounded-pill px-3 py-1 flex-row items-center gap-[6px]">
        <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
        <Text className="text-[#22C55E] text-xs leading-4 font-poppins-medium">
          Stripe Connected
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onConnect}
      className="bg-[rgba(234,179,8,0.15)] rounded-pill px-3 py-1 flex-row items-center gap-[6px]"
    >
      <Ionicons name="time" size={14} color="#EAB308" />
      <Text className="text-[#EAB308] text-xs leading-4 font-poppins-medium">
        Stripe Not Connected
      </Text>
      <Ionicons name="chevron-forward" size={14} color="#EAB308" />
    </Pressable>
  );
}

function TopBar({ onBack }: { onBack: () => void }) {
  return (
    <View className="flex-row items-center justify-between px-4 py-3">
      <Pressable
        onPress={onBack}
        hitSlop={10}
        className="flex-row gap-[7px] items-center"
      >
        <Feather name="arrow-left" size={24} color={colors["white-100"]} />
        <FlameText variant="subtitle1" className="text-white-100">
          Go Back
        </FlameText>
      </Pressable>
      {/* 3-dot menu slot reserved — out of scope */}
      <View className="size-[38px]" />
    </View>
  );
}

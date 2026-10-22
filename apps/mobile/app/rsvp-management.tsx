import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { CustomRefreshControl } from "@project-flame/ui";
import { getTabBarPaddingBottom } from "../components/navigation/CustomTabBar";
import { DashboardBar } from "../components/dashboard/DashboardBar";
import { TicketSearchBar } from "../components/dashboard/TicketSearchBar";
import { RsvpEventCard } from "../components/org-dashboard/RsvpEventCard";
import { useRsvpEvents } from "../hooks/useRsvpManagement";
import { useOrgData } from "../hooks/useOrgData";
import { useOptionalAuth } from "../hooks/useOptionalAuth";
import { useMemberRoleContext } from "../contexts/MemberRoleContext";
import { useAssignedEvents } from "../hooks/useAssignedEvents";
import { canViewAllEvents, foldForSearch } from "@project-flame/lib";
import { RequireAuthGate } from "../hooks/useRequireAuth";
import { PastItemsAccordion } from "../components/shared/PastItemsAccordion";

export default function RsvpManagementScreen() {
  return (
    <RequireAuthGate>
      <RsvpManagementContent />
    </RequireAuthGate>
  );
}

function RsvpManagementContent() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ orgId?: string | string[] }>();
  const routeOrgId = Array.isArray(params.orgId) ? params.orgId[0] : params.orgId;
  const [search, setSearch] = useState("");

  const {
    memberRole,
    selectedOrgId,
    setSelectedOrgId,
    isLoading: roleLoading,
  } = useMemberRoleContext();

  // Ref-based sync — see organizer-admin.tsx for rationale
  const syncedOrgIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (routeOrgId && syncedOrgIdRef.current !== routeOrgId) {
      syncedOrgIdRef.current = routeOrgId;
      setSelectedOrgId(routeOrgId);
    }
  }, [routeOrgId, setSelectedOrgId]);

  const effectiveOrgId = routeOrgId ?? selectedOrgId;
  const { data: orgData, isLoading: orgLoading } = useOrgData(effectiveOrgId);
  const { userId } = useOptionalAuth();

  // Role-sync gate — see organizer-admin.tsx. Both signals required:
  // selectedOrgId match (so we're not reading the prior org's role) AND
  // !roleLoading (so memberRole has actually resolved for this org).
  const isRoleSynced =
    !routeOrgId || (selectedOrgId === routeOrgId && !roleLoading);
  const isFullAccess = isRoleSynced && canViewAllEvents(memberRole);

  // For organizer-role: fetch only assigned events, pass their IDs to useRsvpEvents.
  // assignedEventIds semantics:
  //   undefined → full access (no filter)
  //   null      → still loading assignments (pause the RSVP query)
  //   string[]  → resolved; filter to these IDs (empty = no events)
  const { data: assignedEvents } = useAssignedEvents(
    isFullAccess ? undefined : userId,
    isFullAccess ? undefined : effectiveOrgId,
  );
  const assignedEventIds = useMemo<string[] | null | undefined>(() => {
    if (!isRoleSynced) return null; // pause until role query matches route
    if (isFullAccess) return undefined;
    if (assignedEvents === undefined) return null;
    return assignedEvents.map((e) => e.id);
  }, [isRoleSynced, isFullAccess, assignedEvents]);

  const { data, isLoading, error, refetch, isRefetching } = useRsvpEvents(assignedEventIds);

  const filteredCurrent = useMemo(() => {
    if (!data?.currentEvents) return [];
    if (!search.trim()) return data.currentEvents;
    const q = foldForSearch(search.trim());
    return data.currentEvents.filter((e) => foldForSearch(e.eventName).includes(q));
  }, [data?.currentEvents, search]);

  const filteredPast = useMemo(() => {
    if (!data?.pastEvents) return [];
    if (!search.trim()) return data.pastEvents;
    const q = foldForSearch(search.trim());
    return data.pastEvents.filter((e) => foldForSearch(e.eventName).includes(q));
  }, [data?.pastEvents, search]);

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  if (orgLoading || isLoading) {
    return (
      <View className="flex-1 bg-background">
        <DashboardBar title="RSVP Management" onBack={() => router.back()} avatarUrl={orgData?.logoUrl} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-background">
        <DashboardBar title="RSVP Management" onBack={() => router.back()} avatarUrl={orgData?.logoUrl} />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-white-100 text-base font-poppins-medium mb-4">
            Failed to load RSVP data
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
      </View>
    );
  }

  const hasNoEvents = filteredCurrent.length === 0 && filteredPast.length === 0;

  return (
    <View className="flex-1 bg-background">
      <DashboardBar title="RSVP Management" onBack={() => router.back()} avatarUrl={orgData?.logoUrl} />
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
        <View className="px-4 gap-6">
          <TicketSearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search by event name"
          />

          {hasNoEvents ? (
            <View className="items-center py-12">
              <Text className="text-white-50 text-sm font-poppins text-center">
                {search.trim()
                  ? "No events match your search."
                  : "No events with RSVPs yet."}
              </Text>
            </View>
          ) : (
            <>
              {filteredCurrent.length > 0 && (
                <View className="gap-3">
                  <Text className="text-white-100 text-sm leading-5 font-poppins-semibold uppercase">
                    {"Current & upcoming events"}
                  </Text>
                  <View className="gap-2">
                    {filteredCurrent.map((event) => (
                      <RsvpEventCard
                        key={event.id}
                        event={event}
                        onActions={() =>
                          router.push(
                            effectiveOrgId
                              ? `/rsvp-detail?eventId=${event.id}&orgId=${encodeURIComponent(effectiveOrgId)}`
                              : `/rsvp-detail?eventId=${event.id}`,
                          )
                        }
                      />
                    ))}
                  </View>
                </View>
              )}

              {filteredPast.length > 0 && (
                <PastItemsAccordion
                  label="Past events"
                  count={filteredPast.length}
                >
                  {filteredPast.map((event) => (
                    <RsvpEventCard
                      key={event.id}
                      event={event}
                      onActions={() =>
                        router.push(
                          effectiveOrgId
                            ? `/rsvp-detail?eventId=${event.id}&orgId=${encodeURIComponent(effectiveOrgId)}`
                            : `/rsvp-detail?eventId=${event.id}`,
                        )
                      }
                    />
                  ))}
                </PastItemsAccordion>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

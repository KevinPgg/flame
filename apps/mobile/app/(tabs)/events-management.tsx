import { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, CustomRefreshControl } from "@project-flame/ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getTabBarPaddingBottom } from "../../components/navigation/CustomTabBar";
import { DashboardBar } from "../../components/dashboard/DashboardBar";
import {
  CreateEventTabs,
  type CreateEventTab,
} from "../../components/create-event/CreateEventTabs";
import { EditEventDetailsTab } from "../../components/events-management/EditEventDetailsTab";
import { EditTiersTab } from "../../components/events-management/EditTiersTab";
import { EventsListView } from "../../components/events-management/EventsListView";
import { useOrgEvents, type OrgEvent } from "../../hooks/useOrgEvents";
import { useOrgData } from "../../hooks/useOrgData";
import { useMemberRoleContext } from "../../contexts/MemberRoleContext";
import { RequireAuthGate } from "../../hooks/useRequireAuth";
import {
  formatEventDate,
  buildTimeRange,
  separateEventsByDate,
} from "@project-flame/lib";

type ScreenView = "list" | "edit";

function toManageEvent(e: OrgEvent) {
  const totalCapacity = e.ticket_tiers.reduce(
    (s, t) => s + t.quantity_total,
    0,
  );
  const attendees = e.ticket_tiers.reduce((s, t) => s + t.quantity_sold, 0);
  const tz = e.timezone || "America/Guayaquil";
  return {
    id: e.id,
    eventName: e.name,
    eventImageUrl:
      e.image_url || "https://placehold.co/100x100/1a1a2e/ffffff?text=No+Img",
    date: e.starts_at ? formatEventDate(e.starts_at, tz) : "",
    timeRange: buildTimeRange(e.starts_at, e.ends_at, tz, e.city),
    location: [e.venue, e.city].filter(Boolean).join(", "),
    attendees,
    totalCapacity,
    ticketTierCount: e.ticket_tiers.length,
  };
}

export default function EventsManagementScreen() {
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<ScreenView>("list");
  const [activeTab, setActiveTab] = useState<CreateEventTab>("event-details");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const { selectedOrgId } = useMemberRoleContext();
  const { isLoading: orgLoading } = useOrgData(selectedOrgId);
  const { data: orgEvents, isLoading, error, refetch } = useOrgEvents();

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } catch (err) {
      console.error("[EventsManagement] handleRefresh failed", {
        action: "events_refresh",
        selectedEventId: selectedEventId ?? undefined,
        err: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRefreshing(false);
    }
  }, [refetch, selectedEventId]);

  const selectedEvent = useMemo(
    () => orgEvents?.find(e => e.id === selectedEventId) ?? null,
    [orgEvents, selectedEventId],
  );

  const { currentEvents, pastEvents } = useMemo(() => {
    if (!orgEvents) return { currentEvents: [], pastEvents: [] };
    return separateEventsByDate(orgEvents);
  }, [orgEvents]);

  const currentList = useMemo(
    () => currentEvents.map(toManageEvent),
    [currentEvents],
  );
  const pastList = useMemo(() => pastEvents.map(toManageEvent), [pastEvents]);
  const isSelectedEventPast = useMemo(() => {
    if (!selectedEvent?.ends_at) return false;
    const endDate = new Date(selectedEvent.ends_at);
    if (Number.isNaN(endDate.getTime())) return false;
    return endDate <= new Date();
  }, [selectedEvent]);

  return (
    <RequireAuthGate>
      <View className="flex-1 bg-background">
        <DashboardBar title="Events Management" />

        <ScrollView
          className="flex-1 bg-background"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: 14,
            paddingBottom: getTabBarPaddingBottom(insets.bottom),
          }}
          refreshControl={
            view === "list" ? (
              <CustomRefreshControl
                refreshing={refreshing && !orgLoading && !isLoading}
                onRefresh={handleRefresh}
              />
            ) : undefined
          }
        >
          {view === "list" ? (
            orgLoading || isLoading ? (
              <View className="items-center py-12 gap-3">
                <ActivityIndicator size="large" color="#FFFFFF" />
                <Text className="text-white-50 text-sm font-poppins">
                  Loading events...
                </Text>
              </View>
            ) : error ? (
              <View className="px-4 py-12 items-center gap-3">
                <Ionicons
                  name="alert-circle-outline"
                  size={36}
                  color={colors["white-30"]}
                />
                <Text className="text-white-50 text-sm font-poppins text-center">
                  Failed to load events. Please try again.
                </Text>
                <Pressable
                  onPress={() => handleRefresh()}
                  className="bg-white-10 rounded-card px-4 py-2"
                >
                  <Text className="text-white-100 text-sm font-poppins-medium">
                    Retry
                  </Text>
                </Pressable>
              </View>
            ) : (
              <EventsListView
                currentEvents={currentList}
                pastEvents={pastList}
                onManageEvent={eventId => {
                  setSelectedEventId(eventId);
                  setView("edit");
                }}
              />
            )
          ) : (
            <>
              <View className="gap-[14px]">
                <View className="px-4">
                  <Pressable
                    className="flex-row items-center gap-[7px]"
                    onPress={() => {
                      setView("list");
                      setActiveTab("event-details");
                    }}
                  >
                    <Ionicons
                      name="arrow-back"
                      size={20}
                      color={colors["white-100"]}
                    />
                    <Text className="text-white-100 text-sm leading-5 font-poppins">
                      Go Back
                    </Text>
                  </Pressable>
                </View>

                <View className="px-4 flex-row items-center gap-2">
                  <Text className="text-white-100 text-lg font-poppins-semibold">
                    {selectedEvent?.name ?? "Edit Event"}
                  </Text>
                  {isSelectedEventPast && (
                    <View className="bg-white-10 rounded-full px-2 py-0.5">
                      <Text className="text-white-70 text-xs font-poppins-medium">
                        View only (past event)
                      </Text>
                    </View>
                  )}
                </View>

                <CreateEventTabs
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                />
              </View>

              <View className="mt-6">
                {activeTab === "event-details" ? (
                  <EditEventDetailsTab
                    event={selectedEvent}
                    readOnly={isSelectedEventPast}
                  />
                ) : (
                  <EditTiersTab
                    event={selectedEvent}
                    readOnly={isSelectedEventPast}
                  />
                )}
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </RequireAuthGate>
  );
}

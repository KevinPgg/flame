/**
 * Edit event screen — renders event-details / tiers edit tabs.
 *
 * Extracted from the inline edit view in events-management.tsx so it can be
 * reached via: Dashboard → org-event-detail → Edit button → /edit-event?id=xxx
 */

import { useState, useMemo } from "react";
import { View, Text, ScrollView, Pressable, Keyboard } from "react-native";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { organizerV2Enabled } from "../lib/v2/flags";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@project-flame/ui";
import { getTabBarPaddingBottom } from "../components/navigation/CustomTabBar";
import { DashboardBar } from "../components/dashboard/DashboardBar";
import {
  CreateEventTabs,
  type CreateEventTab,
} from "../components/create-event/CreateEventTabs";
import { EditEventDetailsTab } from "../components/events-management/EditEventDetailsTab";
import { EditTiersTab } from "../components/events-management/EditTiersTab";
import { useOrgEvents } from "../hooks/useOrgEvents";
import { useOrgData } from "../hooks/useOrgData";
import { useMemberRoleContext } from "../contexts/MemberRoleContext";
import { RequireAuthGate } from "../hooks/useRequireAuth";

export default function EditEventScreen() {
  // Fase 1b.4: v2 when the link carries the organization (v2 links do; the v1 detail screen doesn't).
  const v2Params = useLocalSearchParams<{ id?: string | string[]; orgId?: string | string[] }>();
  if (organizerV2Enabled()) {
    const ev = Array.isArray(v2Params.id) ? v2Params.id[0] : v2Params.id;
    const org = Array.isArray(v2Params.orgId) ? v2Params.orgId[0] : v2Params.orgId;
    if (ev && org) return <Redirect href={`/v2/organizer/event/${encodeURIComponent(ev)}/edit?orgId=${encodeURIComponent(org)}` as Href} />;
  }
  return (
    <RequireAuthGate>
      <EditEventContent />
    </RequireAuthGate>
  );
}

function EditEventContent() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id ?? "");

  const [activeTab, setActiveTab] = useState<CreateEventTab>("event-details");
  const { selectedOrgId } = useMemberRoleContext();
  const { data: orgEvents } = useOrgEvents(selectedOrgId);
  const { data: orgData } = useOrgData(selectedOrgId);

  const selectedEvent = useMemo(
    () => orgEvents?.find((e) => e.id === id) ?? null,
    [orgEvents, id],
  );

  const isSelectedEventPast = useMemo(() => {
    if (!selectedEvent?.ends_at) return false;
    const endDate = new Date(selectedEvent.ends_at);
    if (Number.isNaN(endDate.getTime())) return false;
    return endDate <= new Date();
  }, [selectedEvent]);

  return (
    <View className="flex-1 bg-background">
      <DashboardBar title="Edit Event" avatarUrl={orgData?.logoUrl} />
      <ScrollView
        className="flex-1 bg-background"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        contentContainerStyle={{
          paddingTop: 14,
          paddingBottom: getTabBarPaddingBottom(insets.bottom),
        }}
      >
        <View className="gap-[14px]">
          <View className="px-4">
            <Pressable
              className="flex-row items-center gap-[7px]"
              onPress={() => router.back()}
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
            <Text className="text-white-100 text-lg font-poppins-semibold flex-1">
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

          <CreateEventTabs activeTab={activeTab} onTabChange={setActiveTab} />
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
      </ScrollView>
    </View>
  );
}

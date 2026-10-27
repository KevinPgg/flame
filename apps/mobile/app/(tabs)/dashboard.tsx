import { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, CustomRefreshControl } from "@project-flame/ui";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getTabBarPaddingBottom } from "../../components/navigation/CustomTabBar";
import { DashboardBar } from "../../components/dashboard/DashboardBar";
import { StatsGrid } from "../../components/dashboard/StatsGrid";
import { TicketSearchBar } from "../../components/dashboard/TicketSearchBar";
import { TicketCard } from "../../components/dashboard/TicketCard";
import { HistoryCard } from "../../components/history/HistoryCard";
import { useUserTickets } from "../../hooks/useUserTickets";
import { useUserOrgs, type UserOrg } from "../../hooks/useUserOrgs";
import { RequireAuthGate } from "../../hooks/useRequireAuth";
import {
  separateTicketGroupsByDate,
  getFirstTicketIdForGroup,
} from "../../lib/user-ticket-mappers";
import { PastItemsAccordion } from "../../components/shared/PastItemsAccordion";
import { attendeeV2Enabled } from "../../lib/v2/flags";
import { Wallet } from "../../components/v2/attendee/tickets/Wallet";

/** My tickets: Flame 2.0 (fase 2.3) unless EXPO_PUBLIC_ATTENDEE_V1=true. */
export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <RequireAuthGate>
      {attendeeV2Enabled() ? <Wallet /> : <DashboardContent router={router} insets={insets} />}
    </RequireAuthGate>
  );
}

function DashboardContent({
  router,
  insets,
}: {
  router: ReturnType<typeof useRouter>;
  insets: { bottom: number };
}) {
  const { data, isLoading, error, refetch } = useUserTickets();
  const userOrgsQuery = useUserOrgs();
  const userOrgs = userOrgsQuery.data as UserOrg[] | undefined;
  const refetchUserOrgs = userOrgsQuery.refetch;
  const unapprovedOrg = userOrgs?.find((o) => !o.approved) ?? null;

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetch(), refetchUserOrgs()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetch, refetchUserOrgs]);

  const { currentGroups, pastGroups, ticketStats } = useMemo(() => {
    const tickets = data?.tickets ?? [];
    const { currentGroups, pastGroups } = separateTicketGroupsByDate(tickets);
    const currentTickets = currentGroups.flatMap(g => g.tickets);
    // Purchased: each issued/checked-in row represents one ticket — row count
    // equals ticket count.
    const purchased = currentTickets.filter(
      t =>
        (t.type === "ticket" || t.type === "promotional") &&
        (t.status === "issued" || t.status === "checked_in"),
    ).length;
    // Pending: a single RSVP row can represent multiple requested tickets, so
    // sum requested_quantity instead of counting rows. Otherwise the card
    // shows "QNT: 3" while the stat pill says "Pending: 1".
    const pending = currentTickets
      .filter(
        t =>
          t.type === "rsvp" &&
          (t.status === "pending" || t.status === "approved"),
      )
      .reduce((sum, t) => sum + (t.requested_quantity ?? t.quantity ?? 1), 0);
    const ticketStats = {
      total: purchased + pending,
      purchased,
      pending,
    };
    return { currentGroups, pastGroups, ticketStats };
  }, [data?.tickets]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text className="text-white-80 mt-4 text-sm font-poppins">
          Loading your tickets...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-white-100 text-lg font-poppins-semibold text-center">
          Error loading tickets
        </Text>
        <Text className="text-white-80 mt-2 text-sm font-poppins text-center">
          {error instanceof Error ? error.message : "Please try again later."}
        </Text>
        <Pressable
          onPress={() => handleRefresh()}
          className="mt-4 bg-white-100 rounded-pill px-6 py-2"
        >
          <Text className="text-dark font-poppins-medium">Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <DashboardBar />
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: 14,
          paddingBottom: getTabBarPaddingBottom(insets.bottom),
        }}
        refreshControl={
          <CustomRefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        }
      >
        <View className="gap-[30px]">
          {unapprovedOrg && (
            <View className="mx-4 bg-[rgba(234,179,8,0.10)] border border-[rgba(234,179,8,0.3)] rounded-card px-4 py-3 flex-row items-center gap-3">
              <View className="size-8 rounded-[9999px] bg-[rgba(234,179,8,0.15)] items-center justify-center">
                <Ionicons name="time" size={16} color="#EAB308" />
              </View>
              <View className="flex-1">
                <Text className="text-[#EAB308] text-xs font-poppins-semibold">
                  Waiting for Approval
                </Text>
                <Text className="text-white-80 text-xs font-poppins mt-0.5">
                  <Text className="font-poppins-semibold">{unapprovedOrg.organizationName}</Text> is under review.
                </Text>
              </View>
              <View className="bg-[rgba(234,179,8,0.15)] rounded-pill px-2.5 py-1">
                <Text className="text-[#EAB308] text-[10px] font-poppins-medium">Pending</Text>
              </View>
            </View>
          )}
          <StatsGrid
            totalTickets={ticketStats.total}
            pending={ticketStats.pending}
            purchased={ticketStats.purchased}
          />

          <View className="px-4 gap-6">
            <Text className="text-white-100 text-lg font-poppins-semibold uppercase">
              My Tickets
            </Text>
            <TicketSearchBar />
            {currentGroups.length === 0 && pastGroups.length === 0 ? (
              <View className="py-8 items-center">
                <Text className="text-white-80 text-base font-poppins text-center">
                  No tickets yet
                </Text>
                <Text className="text-white-50 text-sm font-poppins mt-2 text-center">
                  Start exploring events and RSVP to get your first tickets!
                </Text>
              </View>
            ) : (
              <View className="gap-[30px]">
                {currentGroups.length > 0 && (
                  <View className="gap-2">
                    {currentGroups.map(group => {
                      const ticketId = getFirstTicketIdForGroup(group);
                      return (
                        <TicketCard
                          key={group.id}
                          ticket={group}
                          onQRPress={
                            group.status === "purchased" && ticketId
                              ? () => router.push(`/ticket/${ticketId}`)
                              : undefined
                          }
                        />
                      );
                    })}
                  </View>
                )}
                {pastGroups.length > 0 && (
                  <PastItemsAccordion
                    label="Past tickets"
                    count={pastGroups.length}
                  >
                    {pastGroups.map(group => {
                      const ticketId = getFirstTicketIdForGroup(group);
                      return (
                        <HistoryCard
                          key={group.id}
                          ticket={group}
                          onPress={
                            ticketId
                              ? () => router.push(`/ticket/${ticketId}`)
                              : undefined
                          }
                        />
                      );
                    })}
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

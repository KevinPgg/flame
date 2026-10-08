import { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { colors, CustomRefreshControl } from "@project-flame/ui";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getTabBarPaddingBottom } from "../../components/navigation/CustomTabBar";
import { DashboardBar } from "../../components/dashboard/DashboardBar";
import { TicketSearchBar } from "../../components/dashboard/TicketSearchBar";
import { HistoryCard } from "../../components/history/HistoryCard";
import { useUserTickets } from "../../hooks/useUserTickets";
import { RequireAuthGate } from "../../hooks/useRequireAuth";
import {
  separateTicketGroupsByDate,
  getFirstTicketIdForGroup,
} from "../../lib/user-ticket-mappers";

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <RequireAuthGate>
      <HistoryContent router={router} insets={insets} />
    </RequireAuthGate>
  );
}

function HistoryContent({
  router,
  insets,
}: {
  router: ReturnType<typeof useRouter>;
  insets: { bottom: number };
}) {
  const { data, isLoading, error, refetch } = useUserTickets();

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const sortedPastGroups = useMemo(() => {
    const { pastGroups } = separateTicketGroupsByDate(data?.tickets ?? []);
    return [...pastGroups].sort((a, b) => {
      const aDate = a.tickets[0]?.ticket_tier?.event?.starts_at ?? "";
      const bDate = b.tickets[0]?.ticket_tier?.event?.starts_at ?? "";
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
  }, [data?.tickets]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text className="text-white-80 mt-4 text-sm font-poppins">
          Loading purchase history...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-white-100 text-lg font-poppins-semibold text-center">
          Error loading history
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
      <DashboardBar title="Purchase History" />
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
        <View className="px-4 gap-6">
          <TicketSearchBar />
          <View className="gap-2">
            {sortedPastGroups.length === 0 ? (
              <View className="py-8 items-center">
                <Text className="text-white-80 text-base font-poppins text-center">
                  No past purchases
                </Text>
                <Text className="text-white-50 text-sm font-poppins mt-2 text-center">
                  Your past event tickets will appear here.
                </Text>
              </View>
            ) : (
              sortedPastGroups.map(group => {
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
              })
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

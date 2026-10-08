import { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
  Modal,
  Dimensions,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import {
  formatEventDate,
  buildTimeRange,
  isValidIanaTimezone,
  formatCentsAsPrice,
  getOrderDisplayCents,
  type QRCodeData,
  type UserTicket,
} from "@project-flame/lib";
import { colors, FlameImage, CustomRefreshControl } from "@project-flame/ui";
import { getTabBarPaddingBottom } from "../../components/navigation/CustomTabBar";
import { DashboardBar } from "../../components/dashboard/DashboardBar";
import { useUserTickets } from "../../hooks/useUserTickets";
import { RequireAuthGate } from "../../hooks/useRequireAuth";

const QR_SIZE = 200;
const SCREEN_WIDTH = Dimensions.get("window").width;
const FULLSCREEN_QR_SIZE = Math.min(SCREEN_WIDTH - 64, 320);

/**
 * Per-ticket price label for the QR detail view.
 * - Promotional → "Complimentary"
 * - Free (order total_cents === 0) → "FREE"
 * - Bank transfer → base price (no platform fee — see getOrderDisplayCents)
 * - Regular paid → total_cents / quantity (reflects discounts)
 * - Fallback → tier price
 */
function getTicketPriceLabel(
  ticket: UserTicket,
  tierInfo: { price_cents?: number } | null | undefined,
  currency?: string,
): string {
  if (ticket.type === "promotional") return "Complimentary";

  if (ticket.order) {
    if (ticket.order.total_cents === 0) return "FREE";

    const displayCents = getOrderDisplayCents(ticket.order);
    if (
      displayCents != null &&
      displayCents > 0 &&
      ticket.order.quantity &&
      ticket.order.quantity > 0
    ) {
      const pricePerTicket = Math.round(displayCents / ticket.order.quantity);
      return formatCentsAsPrice(pricePerTicket, currency);
    }

    if (ticket.order.unit_price_cents !== undefined && ticket.order.unit_price_cents > 0) {
      return formatCentsAsPrice(ticket.order.unit_price_cents, currency);
    }
  }

  if (tierInfo?.price_cents !== undefined) {
    if (tierInfo.price_cents === 0) return "FREE";
    if (tierInfo.price_cents > 0) return formatCentsAsPrice(tierInfo.price_cents, currency);
  }

  return "";
}

export default function TicketDetailScreen() {
  return (
    <RequireAuthGate>
      <TicketDetailContent />
    </RequireAuthGate>
  );
}

function TicketDetailContent() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { data, isLoading, error, refetch } = useUserTickets();

  const [refreshing, setRefreshing] = useState(false);
  const [qrFullscreen, setQrFullscreen] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const { ticketsInGroup, currentTicket, currentIndex } = useMemo(() => {
    const allTickets = data?.tickets ?? [];
    const ticket = allTickets.find(t => t.id === id);
    if (!ticket)
      return { ticketsInGroup: [], currentTicket: null, currentIndex: 0 };

    const eventId = ticket.ticket_tier?.event?.id;
    const tierId = ticket.ticket_tier?.id;
    if (!eventId || !tierId)
      return {
        ticketsInGroup: [ticket],
        currentTicket: ticket,
        currentIndex: 0,
      };

    // Apply identical filters for both siblings and locating the current ticket
    // so ticketsInGroup, currentTicket, and currentIndex are always consistent.
    const isQRViewable = (t: (typeof allTickets)[number]) =>
      t.ticket_tier?.event?.id === eventId &&
      t.ticket_tier?.id === tierId &&
      (t.type === "ticket" || t.type === "promotional") &&
      (t.status === "issued" || t.status === "checked_in");

    const siblings = allTickets.filter(isQRViewable);

    // Ensure the navigated ticket is included in the group even if it doesn't
    // pass the filter (e.g. a refunded ticket navigated to directly).
    const ticketsInGroup = siblings.some(t => t.id === id)
      ? siblings
      : [ticket, ...siblings];

    const idx = ticketsInGroup.findIndex(t => t.id === id);
    return {
      ticketsInGroup,
      currentTicket: ticket,
      currentIndex: idx >= 0 ? idx : 0,
    };
  }, [id, data?.tickets]);

  // Status check mirrors isQRViewable: revoked/refunded/void tickets must not
  // show an active QR code even if the qr_code/qr_token field is still populated.
  const hasValidQR =
    currentTicket &&
    (currentTicket.status === "issued" ||
      currentTicket.status === "checked_in") &&
    ((currentTicket.type === "ticket" && currentTicket.qr_code) ||
      (currentTicket.type === "promotional" && currentTicket.qr_token));

  const qrValue = useMemo(() => {
    if (!currentTicket) return null;
    if (currentTicket.qr_code && currentTicket.type === "ticket") return null;
    if (currentTicket.qr_token) {
      const eventInfo = currentTicket.ticket_tier?.event;
      const tierInfo = currentTicket.ticket_tier;
      // Matches web UserDashboard.tsx promotional QR generation exactly.
      // orderId is "" for promotional tickets (no order); userId uses attendee_email
      // as the identifier (same as web source).
      const qrData: QRCodeData = {
        orderId: currentTicket.order?.id ?? "",
        eventId: eventInfo?.id ?? "",
        userId: currentTicket.attendee_email ?? "",
        tierName: tierInfo?.name ?? "",
        eventName: eventInfo?.name ?? "",
        ticketNumber: currentIndex + 1,
        qrToken: currentTicket.qr_token,
        timestamp: currentTicket.created_at ?? new Date().toISOString(),
      };
      return JSON.stringify(qrData);
    }
    return null;
  }, [currentTicket, currentIndex]);

  const navigateTicket = (direction: "prev" | "next") => {
    const newIndex =
      direction === "prev"
        ? Math.max(0, currentIndex - 1)
        : Math.min(ticketsInGroup.length - 1, currentIndex + 1);
    const nextTicket = ticketsInGroup[newIndex];
    if (nextTicket) router.replace(`/ticket/${nextTicket.id}`);
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  if (error) {
    const isNotFound = (error as { status?: number })?.status === 404;
    if (!isNotFound) {
      return (
        <View className="flex-1 bg-background items-center justify-center px-6">
          <Text className="text-white-100 text-lg font-poppins-semibold text-center">
            Failed to load ticket
          </Text>
          <Text className="text-white-50 text-sm leading-5 font-poppins text-center mt-2">
            Something went wrong. Please try again.
          </Text>
          <View className="flex-row gap-3 mt-4">
            <Pressable
              onPress={() => refetch()}
              className="px-6 py-2 bg-white-100 rounded-pill"
            >
              <Text className="text-dark font-poppins-medium">Retry</Text>
            </Pressable>
            <Pressable
              onPress={() => router.back()}
              className="px-6 py-2 bg-white-10 rounded-pill"
            >
              <Text className="text-white-100 font-poppins-medium">
                Go Back
              </Text>
            </Pressable>
          </View>
        </View>
      );
    }
  }

  if (!currentTicket) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-white-100 text-lg font-poppins-semibold text-center">
          Ticket not found
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-4 px-6 py-2 bg-white-100 rounded-pill"
        >
          <Text className="text-dark font-poppins-medium">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const eventInfo = currentTicket.ticket_tier?.event;
  const tierInfo = currentTicket.ticket_tier;

  const tz =
    eventInfo?.timezone && isValidIanaTimezone(eventInfo.timezone)
      ? eventInfo.timezone
      : "America/Guayaquil";
  const dateStr = eventInfo?.starts_at
    ? formatEventDate(eventInfo.starts_at, tz)
    : "";
  const timeRange = eventInfo?.starts_at
    ? buildTimeRange(eventInfo.starts_at, eventInfo.ends_at, tz, eventInfo.city)
    : "";

  const orgs = eventInfo?.organizations;
  const organizerName =
    eventInfo?.organization?.name ??
    (Array.isArray(orgs) ? orgs.find(o => o.name)?.name : orgs?.name) ??
    "Unknown Organizer";

  // Tier + stage + price label for display below QR title and in fullscreen
  const stageName = currentTicket.metadata?.stage_name || currentTicket.stage_name;
  const tierLabel = [tierInfo?.name, stageName].filter(Boolean).join(" - ");
  const priceLabel = getTicketPriceLabel(currentTicket, tierInfo, eventInfo?.currency);
  const ticketInfoLine = [tierLabel, priceLabel].filter(Boolean).join(" • ");

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
        <View className="gap-6">
          <View className="px-4 items-start">
            <Pressable
              onPress={() => router.back()}
              className="flex-row items-center gap-[7px]"
            >
              <Ionicons
                name="arrow-back"
                size={24}
                color={colors["white-100"]}
              />
              <Text className="text-white-100 text-sm leading-5 font-poppins">
                Go Back
              </Text>
            </Pressable>
          </View>

          <View className="gap-8 items-center">
            <View className="gap-4 items-center">
              <Text className="text-white-100 text-lg font-poppins-semibold uppercase text-center">
                QR Code
              </Text>
              {ticketInfoLine ? (
                <Text className="text-white-80 text-sm font-poppins text-center px-4">
                  {ticketInfoLine}
                </Text>
              ) : null}
              <Pressable
                onPress={hasValidQR ? () => setQrFullscreen(true) : undefined}
                disabled={!hasValidQR}
              >
                <View className="bg-white rounded-card size-[246px] items-center justify-center">
                  {hasValidQR ? (
                    currentTicket.qr_code ? (
                      <Image
                        source={{ uri: currentTicket.qr_code }}
                        style={{ width: QR_SIZE, height: QR_SIZE }}
                        resizeMode="contain"
                      />
                    ) : (
                      qrValue && (
                        <QRCode
                          value={qrValue}
                          size={QR_SIZE}
                          backgroundColor="#FFFFFF"
                          color="#000000"
                        />
                      )
                    )
                  ) : (
                    <MaterialCommunityIcons
                      name="qrcode"
                      size={180}
                      color={colors.dark}
                    />
                  )}
                  {hasValidQR && (
                    <View className="absolute top-2 right-2 bg-black/20 rounded-full p-1">
                      <Ionicons
                        name="expand-outline"
                        size={18}
                        color="#000000"
                      />
                    </View>
                  )}
                </View>
              </Pressable>
            </View>

            {ticketsInGroup.length > 1 && (
              <View className="flex-row items-center gap-4">
                <Pressable
                  onPress={() => navigateTicket("prev")}
                  disabled={currentIndex === 0}
                  className="p-2 rounded-full bg-white-10"
                >
                  <Ionicons
                    name="chevron-back"
                    size={24}
                    color={
                      currentIndex === 0
                        ? colors["white-30"]
                        : colors["white-100"]
                    }
                  />
                </Pressable>
                <Text className="text-white-80 text-sm font-poppins">
                  Ticket {currentIndex + 1} of {ticketsInGroup.length}
                </Text>
                <Pressable
                  onPress={() => navigateTicket("next")}
                  disabled={currentIndex === ticketsInGroup.length - 1}
                  className="p-2 rounded-full bg-white-10"
                >
                  <Ionicons
                    name="chevron-forward"
                    size={24}
                    color={
                      currentIndex === ticketsInGroup.length - 1
                        ? colors["white-30"]
                        : colors["white-100"]
                    }
                  />
                </Pressable>
              </View>
            )}

            <View className="w-full px-4 gap-[21px]">
              {eventInfo?.image_url && (
                <FlameImage
                  source={{ uri: eventInfo.image_url }}
                  className="w-full h-[254px] rounded-card"
                  contentFit="cover"
                />
              )}

              <View className="flex-row items-center gap-2">
                <Ionicons
                  name="people-outline"
                  size={24}
                  color={colors["white-100"]}
                />
                <Text className="flex-1 text-white-100 text-xs leading-4 font-poppins-light">
                  By {organizerName}
                </Text>
              </View>

              <View className="gap-6">
                <View className="gap-2">
                  <Text className="text-white-100 text-lg font-poppins-semibold uppercase">
                    {eventInfo?.name ?? "Event"}
                  </Text>
                  <Text className="text-white-80 text-sm leading-5 font-poppins-light">
                    {eventInfo?.description ?? ""}
                  </Text>
                </View>

                <View className="gap-4">
                  <View className="flex-row items-center gap-4">
                    <View className="bg-white-10 size-[36px] rounded-full items-center justify-center">
                      <Ionicons
                        name="calendar-outline"
                        size={24}
                        color={colors["white-100"]}
                      />
                    </View>
                    <View className="flex-1 gap-2">
                      <Text className="text-white-100 text-xs leading-4 font-poppins-light">
                        {dateStr}
                      </Text>
                      <Text className="text-white-100 text-xs leading-4 font-poppins-light">
                        {timeRange}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-4">
                    <View className="bg-white-10 size-[36px] rounded-full items-center justify-center">
                      <Ionicons
                        name="location-outline"
                        size={24}
                        color={colors["white-100"]}
                      />
                    </View>
                    <Text className="flex-1 text-white-100 text-xs leading-4 font-poppins-light">
                      {eventInfo?.venue ?? ""}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {hasValidQR && (
            <Text className="text-white-50 text-sm font-poppins text-center px-4">
              Present this QR code at the event entrance
            </Text>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={qrFullscreen}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setQrFullscreen(false)}
      >
        <View className="flex-1 bg-white items-center justify-center">
          <Pressable
            onPress={() => setQrFullscreen(false)}
            className="absolute top-14 right-5 z-10 bg-black/10 rounded-full p-2"
          >
            <Ionicons name="close" size={28} color="#000000" />
          </Pressable>

          {currentTicket?.qr_code ? (
            <Image
              source={{ uri: currentTicket.qr_code }}
              style={{ width: FULLSCREEN_QR_SIZE, height: FULLSCREEN_QR_SIZE }}
              resizeMode="contain"
            />
          ) : (
            qrValue && (
              <QRCode
                value={qrValue}
                size={FULLSCREEN_QR_SIZE}
                backgroundColor="#FFFFFF"
                color="#000000"
              />
            )
          )}

          <Text className="text-black text-base font-poppins-medium mt-6 text-center px-8">
            {eventInfo?.name ?? "Event"}
          </Text>
          {ticketInfoLine ? (
            <Text className="text-black/60 text-sm font-poppins mt-1 text-center px-8">
              {ticketInfoLine}
            </Text>
          ) : null}
          {ticketsInGroup.length > 1 ? (
            <Text className="text-black/40 text-xs font-poppins mt-1 text-center px-8">
              Ticket {currentIndex + 1} of {ticketsInGroup.length}
            </Text>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

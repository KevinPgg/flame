import { View, Text, Pressable } from "react-native";
import { Skeleton } from "@project-flame/ui";
import { EventInfoHeader } from "./EventInfoHeader";
import { formatCentsAsPrice } from "@project-flame/lib";
/**
 * Display shape derived from OrgEvent (useOrgEvents) for the card.
 * Matches EventInfoHeaderData + attendees + revenueCents.
 */
export interface OrgEventCardData {
  id: string;
  eventName: string;
  eventImageUrl: string;
  date: string;
  timeRange: string;
  location: string;
  attendees: number;
  revenueCents: number;
  currency?: string;
  isRsvp?: boolean;
  /**
   * True while the authoritative revenue for this card is still loading (e.g. a
   * co-hosted event whose server-computed net revenue hasn't arrived yet). When
   * set we render a neutral "—" placeholder instead of the gross tier estimate,
   * so the value never visibly corrects downward once the real figure lands.
   */
  revenueLoading?: boolean;
}

interface OrgEventCardProps {
  event: OrgEventCardData;
  onViewDetails?: () => void;
  /** e.g. "By Org A & Org B" — shown below event info */
  cohostLabel?: string;
  /** e.g. "Co-host with Org A" — badge shown top-right of card */
  cohostBadge?: string;
}

export function OrgEventCard({
  event,
  onViewDetails,
  cohostLabel,
  cohostBadge,
}: OrgEventCardProps) {
  return (
    <Pressable
      onPress={onViewDetails}
      className="bg-white-5 rounded-card p-[10px] gap-2"
      style={{ position: "relative" }}
    >
      {/* Top-right badge stack: cohost first, then RSVP. */}
      {(cohostBadge || event.isRsvp) && (
        <View
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 10,
            maxWidth: "60%",
            alignItems: "flex-end",
            gap: 4,
          }}
        >
          {cohostBadge && (
            <View
              style={{
                backgroundColor: "#238FDA",
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}
            >
              <Text
                className="text-white-100 font-poppins-medium"
                style={{ fontSize: 10, lineHeight: 14 }}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {cohostBadge}
              </Text>
            </View>
          )}
          {event.isRsvp && (
            <View className="bg-primary rounded-badge px-2 py-[3px]">
              <Text
                className="text-white-100 font-poppins-medium uppercase"
                style={{ fontSize: 10, lineHeight: 14 }}
              >
                RSVP
              </Text>
            </View>
          )}
        </View>
      )}

      <EventInfoHeader
        event={{
          eventName: event.eventName,
          eventImageUrl: event.eventImageUrl,
          date: event.date,
          timeRange: event.timeRange,
          location: event.location,
        }}
      />

      {cohostLabel && (
        <Text className="text-white-50 text-xs font-poppins px-1">
          {cohostLabel}
        </Text>
      )}

      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-4">
          <Text className="text-white-80 text-base leading-[22px] font-poppins">
            Attendees:{" "}
            <Text className="text-white-100 font-poppins-semibold">
              {event.attendees}
            </Text>
          </Text>
          {event.revenueLoading ? (
            // Match the "Total Revenue" StatCard: skeleton the metric until its
            // authoritative value resolves, rather than flashing a gross tier
            // estimate that then corrects downward. The rest of the card
            // (name/date/attendees) still renders immediately.
            <View className="flex-row items-center gap-2">
              <Text className="text-white-80 text-base leading-[22px] font-poppins">
                Revenue:
              </Text>
              <Skeleton className="h-4 w-14 rounded" />
            </View>
          ) : (
            <Text className="text-white-80 text-base leading-[22px] font-poppins">
              Revenue:{" "}
              <Text className="text-white-100 font-poppins-semibold">
                {formatCentsAsPrice(event.revenueCents, event.currency)}
              </Text>
            </Text>
          )}
        </View>
        <Text className="text-accent text-sm leading-5 font-poppins-medium">
          View Details
        </Text>
      </View>
    </Pressable>
  );
}

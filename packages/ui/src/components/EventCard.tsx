import { View, Pressable } from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { FlameText } from "./FlameText";
import { FlameImage } from "./FlameImage";
import { colors } from "../theme/colors";

export interface EventCardData {
  id: string;
  title: string;
  imageUrl: string;
  date: string;
  day: string;
  month: string;
  time: string;
  /** Full time range string, e.g. "16:00 - 18:00 GMT" */
  timeRange?: string;
  location: string;
  /** Raw event description — used for search matching (not displayed on card) */
  description?: string;
  /** Event city — used for city filter (not displayed on card) */
  city?: string | null;
  /** Organization slug — used for organizer filtering */
  organizationSlug?: string | null;
  /** Organization display name */
  organizationName?: string | null;
  /** Whether this event requires RSVP (shows tag on card) */
  isRsvp?: boolean;
  /** Pre-computed price display string from getLowestPrice(), e.g. "From $10.00" or "Sold Out" */
  priceDisplay?: string | null;
}

interface EventCardProps {
  event: EventCardData;
  onPress?: () => void;
  className?: string;
}

// --- Sub-components ---

function DateBadge({ day, month }: { day: string; month: string }) {
  return (
    <View className="absolute top-[7px] left-[6px] bg-[rgba(0,0,0,0.55)] rounded-badge px-[10px] py-[6px] flex-row items-center gap-2">
      <FlameText
        variant="subtitle1"
        className="text-white font-poppins-bold uppercase"
      >
        {day}
      </FlameText>
      <FlameText
        variant="subtitle1"
        className="text-white font-poppins-light"
      >
        {month}
      </FlameText>
    </View>
  );
}

function RsvpBadge() {
  return (
    <View className="absolute top-[7px] right-[6px] bg-primary rounded-badge px-[10px] py-[6px]">
      <FlameText
        variant="subtitle1"
        className="text-white font-poppins-bold uppercase"
      >
        RSVP
      </FlameText>
    </View>
  );
}

function MetadataRow({
  icon,
  children,
}: {
  icon: "calendar" | "map-pin";
  children: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <View className="w-4 h-4 rounded-circle overflow-hidden items-center justify-center">
        <Feather name={icon} size={14} color={colors["white-100"]} />
      </View>
      {children}
    </View>
  );
}

// --- Main Component ---

export function EventCard({
  event,
  onPress,
  className = "",
}: EventCardProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`bg-card rounded-card p-2 pb-4 w-[234px] ${className}`}
    >
      {/* Image with date badge and RSVP tag */}
      <View className="h-[130px] w-[218px] rounded-card overflow-hidden relative">
        <FlameImage
          source={{ uri: event.imageUrl }}
          className="w-full h-full rounded-card"
          contentFit="cover"
        />
        <DateBadge day={event.day} month={event.month} />
        {event.isRsvp && <RsvpBadge />}
      </View>

      {/* Event info */}
      <View className="mt-2 gap-3">
        <FlameText
          variant="h4"
          className="text-white-100 font-poppins-semibold"
          numberOfLines={2}
        >
          {event.title}
        </FlameText>
        {/* Date and time row */}
        <MetadataRow icon="calendar">
          <View className="flex-1 flex-row items-center gap-2">
            <View className="border-r border-white-10 pr-1">
              <FlameText variant="subtitle2-light" className="text-white-100">
                {event.date}
              </FlameText>
            </View>
            <FlameText variant="subtitle2-light" className="text-white-100">
              {event.time}
            </FlameText>
          </View>
        </MetadataRow>

        {/* Location row */}
        <MetadataRow icon="map-pin">
          <FlameText
            variant="subtitle2-light"
            className="text-white-100 flex-1"
            numberOfLines={1}
          >
            {event.location}
          </FlameText>
        </MetadataRow>

        {/* Price row */}
        {event.priceDisplay != null && (
          <View className="flex-row items-center gap-2">
            <View className="w-4 h-4 rounded-circle overflow-hidden items-center justify-center">
              <Ionicons name="pricetag-outline" size={14} color={colors["white-100"]} />
            </View>
            <FlameText
              variant="subtitle2"
              className="text-white-100"
              numberOfLines={1}
            >
              {event.priceDisplay}
            </FlameText>
          </View>
        )}
      </View>
    </Pressable>
  );
}

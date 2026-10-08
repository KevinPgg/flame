import { View, Pressable } from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { FlameText } from "./FlameText";
import { FlameImage } from "./FlameImage";
import { colors } from "../theme/colors";
import type { EventCardData } from "./EventCard";

interface EventListCardProps {
  event: EventCardData;
  onPress?: () => void;
  className?: string;
}

/**
 * Horizontal event card for list views (Events page).
 * Matches Figma node 197:1008 — glass card with 100x100 image,
 * event info (name, date/time, location), and bookmark icon.
 */
export function EventListCard({
  event,
  onPress,
  className = "",
}: EventListCardProps) {
  const displayTime = event.timeRange || event.time;

  return (
    <Pressable
      onPress={onPress}
      className={`bg-card rounded-card p-[10px] flex-row items-start justify-between ${className}`}
    >
      {/* Left: Image + Info */}
      <View className="flex-row flex-1 gap-3 items-center">
        {/* Event image */}
        <View className="w-[100px] h-[100px] relative">
          <FlameImage
            source={{ uri: event.imageUrl }}
            className="w-full h-full rounded-[8px]"
            contentFit="cover"
          />
          {event.isRsvp && (
            <View className="absolute top-[4px] right-[4px] bg-primary rounded-badge px-[6px] py-[2px]">
              <FlameText
                variant="subtitle2"
                className="text-white font-poppins-bold uppercase"
                style={{ fontSize: 9, lineHeight: 13 }}
              >
                RSVP
              </FlameText>
            </View>
          )}
        </View>

        {/* Event info */}
        <View className="flex-1 gap-2">
          {/* Event name */}
          <FlameText
            variant="body"
            className="text-white-100 font-poppins-semibold uppercase"
            numberOfLines={1}
          >
            {event.title}
          </FlameText>

          {/* Date + Time row */}
          <View className="flex-row gap-2 items-start">
            <View className="w-6 h-6 items-center justify-center">
              <Feather
                name="calendar"
                size={16}
                color={colors["white-100"]}
              />
            </View>
            <View className="flex-1 gap-2">
              <FlameText variant="subtitle2-light" className="text-white-100">
                {event.date}
              </FlameText>
              <FlameText variant="subtitle2-light" className="text-white-100">
                {displayTime}
              </FlameText>
            </View>
          </View>

          {/* Location row */}
          <View className="flex-row gap-2 items-center">
            <View className="w-6 h-6 items-center justify-center">
              <Feather
                name="map-pin"
                size={16}
                color={colors["white-100"]}
              />
            </View>
            <FlameText
              variant="subtitle2-light"
              className="text-white-100 flex-1"
              numberOfLines={1}
            >
              {event.location}
            </FlameText>
          </View>

          {/* Price row */}
          {event.priceDisplay != null && (
            <View className="flex-row gap-2 items-center">
              <View className="w-6 h-6 items-center justify-center">
                <Ionicons
                  name="pricetag-outline"
                  size={16}
                  color={colors["white-100"]}
                />
              </View>
              <FlameText
                variant="subtitle2"
                className="text-white-100 flex-1"
                numberOfLines={1}
              >
                {event.priceDisplay}
              </FlameText>
            </View>
          )}
        </View>
      </View>

    </Pressable>
  );
}

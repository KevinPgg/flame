import { View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FlameText, FlameImage, colors } from "@project-flame/ui";
import { formatEventDate } from "@project-flame/lib";
import type { EventDetail } from "../../hooks/useEventDetails";
import { OrganizerBadge } from "./OrganizerBadge";
import { EventMeta } from "./EventMeta";
import { LinkableText } from "../LinkableText";

interface EventHeroProps {
  event: EventDetail;
  organizerName: string | undefined;
  timeRange: string;
  location: string;
  isRsvp: boolean;
  onShare?: () => void;
}

export function EventHero({
  event,
  organizerName,
  timeRange,
  location,
  isRsvp,
  onShare,
}: EventHeroProps) {
  return (
    <View className="w-full gap-[21px] px-4">
      <FlameImage
        source={{
          uri:
            event.image_url ||
            "https://placehold.co/600x400/1a1a2e/ffffff?text=No+Image",
        }}
        className="w-full aspect-[4/5] rounded-card"
        contentFit="cover"
      />

      {organizerName && <OrganizerBadge organizerName={organizerName} />}

      <View className="gap-6">
        <View className="gap-2">
          <View className="flex-row items-start justify-between">
            <FlameText variant="h3" className="text-white-100 uppercase flex-1 mr-3">
              {event.name}
            </FlameText>
            {onShare && (
              <Pressable
                onPress={onShare}
                accessible
                accessibilityRole="button"
                accessibilityLabel="Share"
                accessibilityHint="Shares the current event"
                className="w-[36px] h-[36px] rounded-full bg-white-10 items-center justify-center"
              >
                <Ionicons name="share-outline" size={20} color={colors["white-100"]} />
              </Pressable>
            )}
          </View>
          {event.description && (
            <LinkableText
              className="text-white-80 text-base leading-[22px] font-poppins-light"
            >
              {event.description}
            </LinkableText>
          )}
        </View>

        <EventMeta
          isRsvp={isRsvp}
          dateFormatted={formatEventDate(event.starts_at, event.timezone || "America/Guayaquil")}
          timeRange={timeRange}
          location={location}
        />
      </View>
    </View>
  );
}

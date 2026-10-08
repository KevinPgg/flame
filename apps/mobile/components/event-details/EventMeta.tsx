import { type ReactNode } from "react";
import { View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { FlameText, colors } from "@project-flame/ui";

interface EventMetaProps {
  isRsvp: boolean;
  dateFormatted: string;
  timeRange: string;
  location: string;
}

function InfoRow({
  icon,
  children,
}: {
  icon: keyof typeof Feather.glyphMap;
  children: ReactNode;
}) {
  return (
    <View className="flex-row gap-4 items-center">
      <View className="size-[36px] rounded-full bg-white-10 items-center justify-center">
        <Feather name={icon} size={20} color={colors["white-100"]} />
      </View>
      <View className="flex-1">{children}</View>
    </View>
  );
}

export function EventMeta({
  isRsvp,
  dateFormatted,
  timeRange,
  location,
}: EventMetaProps) {
  return (
    <View className="gap-4">
      {isRsvp && (
        <InfoRow icon="alert-triangle">
          <FlameText variant="subtitle1-light" className="text-white-100">
            RSVP Required
          </FlameText>
        </InfoRow>
      )}

      <InfoRow icon="calendar">
        <View className="gap-2">
          <FlameText
            variant="subtitle1-light"
            className="text-white-100"
          >
            {dateFormatted}
          </FlameText>
          <FlameText
            variant="subtitle1-light"
            className="text-white-100"
          >
            {timeRange}
          </FlameText>
        </View>
      </InfoRow>

      {location && (
        <InfoRow icon="map-pin">
          <FlameText variant="subtitle1-light" className="text-white-100">
            {location}
          </FlameText>
        </InfoRow>
      )}
    </View>
  );
}

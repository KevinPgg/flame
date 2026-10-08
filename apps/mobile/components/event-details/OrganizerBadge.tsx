import { View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { FlameText, colors } from "@project-flame/ui";

interface OrganizerBadgeProps {
  organizerName: string;
}

export function OrganizerBadge({ organizerName }: OrganizerBadgeProps) {
  return (
    <View className="flex-row gap-2 items-center">
      <Feather name="users" size={24} color={colors["white-100"]} />
      <FlameText
        variant="subtitle1"
        className="text-white-100 flex-1"
      >
        By {organizerName}
      </FlameText>
    </View>
  );
}

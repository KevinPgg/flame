import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FlameImage, colors } from "@project-flame/ui";
import { useUserProfile } from "../../hooks/useUserProfile";

interface DashboardBarProps {
  title?: string;
  className?: string;
  /** When provided, shows a back chevron before the title. Keeps unified bar height. */
  onBack?: () => void;
  /** Override avatar shown on the right. Defaults to the user's profile image. */
  avatarUrl?: string | null;
}

export function DashboardBar({
  title = "Dashboard",
  className,
  onBack,
  avatarUrl: avatarOverride,
}: DashboardBarProps) {
  const { profile } = useUserProfile();
  const avatarUrl = avatarOverride ?? profile?.profile_image_url;

  return (
    <View
      className={`bg-surface flex-row items-center justify-between px-4 py-3 ${className ?? ""}`}
    >
      <View className="flex-row items-center gap-3 flex-1 min-w-0">
        {onBack && (
          <Pressable onPress={onBack} hitSlop={10}>
            <Ionicons
              name="chevron-back"
              size={24}
              color={colors["white-100"]}
            />
          </Pressable>
        )}
        <Text className="text-white-100 text-lg font-poppins-semibold">
          {title}
        </Text>
      </View>
      {avatarUrl ? (
        <FlameImage
          source={{ uri: avatarUrl }}
          className="size-[38px] rounded-[9999px]"
          contentFit="cover"
        />
      ) : (
        <View className="size-[38px] rounded-[9999px] bg-white-10 items-center justify-center">
          <Ionicons name="person" size={20} color={colors["white-50"]} />
        </View>
      )}
    </View>
  );
}

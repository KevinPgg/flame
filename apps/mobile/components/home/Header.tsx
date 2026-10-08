import { View, Pressable, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@project-flame/ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { FlameLogo } from "../FlameLogo";

export interface HeaderProps {
  onNotificationPress?: () => void;
  unreadCount?: number;
}

export function Header({ onNotificationPress, unreadCount = 0 }: HeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      style={{ paddingTop: insets.top, height: insets.top + 60 }}
      className="bg-background flex-row items-center justify-between px-4 z-10"
    >
      <Pressable
        onPress={() => {
          router.replace("/(tabs)");
        }}
      >
        <FlameLogo width={85} height={19} />
      </Pressable>

      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={() => router.push("/settings" as never)}
          className="bg-white-5 rounded-circle size-[44px] items-center justify-center"
        >
          <Ionicons
            name="settings-outline"
            size={22}
            color={colors["white-100"]}
          />
        </Pressable>

        <Pressable
          onPress={onNotificationPress}
          className="bg-white-5 rounded-circle size-[44px] items-center justify-center"
        >
          <Ionicons
            name="notifications"
            size={24}
            color={colors["white-100"]}
          />
          {unreadCount > 0 && (
            <View className="absolute -top-[2px] -right-[2px] bg-primary rounded-full min-w-[18px] h-[18px] items-center justify-center px-[4px]">
              <Text className="text-white-100 text-[10px] font-poppins-semibold leading-[12px]">
                {unreadCount > 99 ? "99+" : unreadCount}
              </Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

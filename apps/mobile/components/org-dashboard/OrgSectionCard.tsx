import { type ReactNode } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface OrgSectionCardProps {
  icon: ReactNode;
  title: string;
  onClose?: () => void;
  children: ReactNode;
}

export function OrgSectionCard({
  icon,
  title,
  onClose,
  children,
}: OrgSectionCardProps) {
  return (
    <View
      className="bg-card rounded-card p-3"
      style={{
        shadowColor: "rgba(80,85,136,0.06)",
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 30,
        shadowOpacity: 1,
        elevation: 4,
      }}
    >
      <View className="gap-6">
        <View className="flex-row items-center gap-4">
          <View className="size-[42px] bg-white-5 border border-white-100 rounded-full items-center justify-center">
            {icon}
          </View>
          <Text className="flex-1 text-[#EAEAEB] text-base leading-[22px] font-poppins-medium">
            {title}
          </Text>
          {onClose && (
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color="#F9FBFE" />
            </Pressable>
          )}
        </View>
        {children}
      </View>
    </View>
  );
}

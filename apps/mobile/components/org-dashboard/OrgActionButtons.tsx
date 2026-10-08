import { type ReactNode } from "react";
import { View, Pressable } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

type SectionKey = "promotions" | "sendTickets" | "promoterLinks" | "purchasedDetails";

type SectionVisibility = Record<SectionKey, boolean>;

interface OrgActionButtonsProps {
  onToggle: (section: SectionKey) => void;
  sections: SectionVisibility;
}

function ActionButton({
  onPress,
  active,
  children,
}: {
  onPress: () => void;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`size-[52px] rounded-full items-center justify-center ${
        active
          ? "bg-white-100"
          : "bg-white-5 border border-white-100"
      }`}
    >
      {children}
    </Pressable>
  );
}

export function OrgActionButtons({ onToggle, sections }: OrgActionButtonsProps) {
  return (
    <View className="flex-row items-center justify-center gap-4 px-4 py-2">
      <ActionButton onPress={() => onToggle("promotions")} active={sections.promotions}>
        <MaterialCommunityIcons name="percent" size={22} color={sections.promotions ? "#041C2B" : "#F9FBFE"} />
      </ActionButton>

      <ActionButton onPress={() => onToggle("sendTickets")} active={sections.sendTickets}>
        <Ionicons name="send" size={20} color={sections.sendTickets ? "#041C2B" : "#F9FBFE"} />
      </ActionButton>

      <ActionButton onPress={() => onToggle("promoterLinks")} active={sections.promoterLinks}>
        <Ionicons name="link" size={20} color={sections.promoterLinks ? "#041C2B" : "#F9FBFE"} />
      </ActionButton>

      <ActionButton onPress={() => onToggle("purchasedDetails")} active={sections.purchasedDetails}>
        <Ionicons name="ticket-outline" size={20} color={sections.purchasedDetails ? "#041C2B" : "#F9FBFE"} />
      </ActionButton>
    </View>
  );
}

export type { SectionKey };

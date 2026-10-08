import { View, Text, Pressable } from "react-native";

export type CreateEventTab = "event-details" | "ticket-tiers";

interface CreateEventTabsProps {
  activeTab: CreateEventTab;
  onTabChange: (tab: CreateEventTab) => void;
}

const TABS: { id: CreateEventTab; label: string }[] = [
  { id: "event-details", label: "Event Details" },
  { id: "ticket-tiers", label: "Ticket Tiers" },
];

export function CreateEventTabs({
  activeTab,
  onTabChange,
}: CreateEventTabsProps) {
  return (
    <View className="bg-background flex-row items-center px-4 py-[2px] gap-[6px]">
      {TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <Pressable
            key={tab.id}
            className={`flex-1 items-center justify-center p-2 ${
              isActive ? "border-b-[1.5px] border-white-100" : ""
            }`}
            onPress={() => onTabChange(tab.id)}
          >
            <Text
              className={`text-base leading-[22px] font-poppins ${
                isActive ? "text-white-100" : "text-white-80"
              }`}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

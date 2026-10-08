import { useMemo } from "react";
import { View, Text, Pressable } from "react-native";

export type SettingsTab = "personal" | "organization" | "payouts";

interface SettingsTabsProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  isOrg?: boolean;
  isOwner?: boolean;
}

const ALL_TABS: { id: SettingsTab; label: string; orgOnly?: boolean; ownerOnly?: boolean }[] = [
  { id: "personal", label: "Personal" },
  { id: "organization", label: "Organization", orgOnly: true },
  { id: "payouts", label: "Payouts", ownerOnly: true },
];

export function SettingsTabs({ activeTab, onTabChange, isOrg, isOwner }: SettingsTabsProps) {
  const tabs = useMemo(
    () => ALL_TABS.filter((t) => {
      if (t.ownerOnly) return isOwner;
      if (t.orgOnly) return isOrg;
      return true;
    }),
    [isOrg, isOwner]
  );

  return (
    <View className="bg-background flex-row items-center px-4 py-[2px] gap-[6px]">
      {tabs.map((tab) => {
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

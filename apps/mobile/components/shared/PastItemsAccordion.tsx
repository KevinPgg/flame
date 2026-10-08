import { useState, type ReactNode } from "react";
import { View, Text, Pressable, LayoutAnimation, Platform, UIManager } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@project-flame/ui";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface PastItemsAccordionProps {
  label: string;
  count: number;
  children: ReactNode;
  /** Initial expanded state (default collapsed). Used by the profile
   *  org-approval sections where "My Organizers" starts open. */
  defaultExpanded?: boolean;
}

export function PastItemsAccordion({
  label,
  count,
  children,
  defaultExpanded = false,
}: PastItemsAccordionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  return (
    <View className="gap-3">
      <Pressable
        onPress={toggle}
        className="flex-row items-center justify-between"
      >
        <Text className="text-white-100 text-sm leading-5 font-poppins-semibold uppercase">
          {label} ({count})
        </Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={colors["white-50"]}
        />
      </Pressable>
      {expanded && <View className="gap-2">{children}</View>}
    </View>
  );
}

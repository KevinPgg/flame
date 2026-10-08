import React, { useState } from "react";
import { View, Pressable, Text } from "react-native";
import { FlameText } from "./FlameText";

export interface FAQData {
  id: string;
  question: string;
  answer: string;
}

interface FAQItemProps {
  item: FAQData;
  /** Optional expand/collapse icon (e.g. chevron-down). When expanded, rotated 180deg. Falls back to "+" if omitted. */
  icon?: React.ReactElement;
  className?: string;
}

export function FAQItem({ item, icon, className = "" }: FAQItemProps) {
  const [expanded, setExpanded] = useState(false);

  const ToggleIcon = icon ? (
    <View style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}>
      {icon}
    </View>
  ) : (
    <Text
      className="text-white-100 text-lg leading-none"
      style={{ transform: [{ rotate: expanded ? "45deg" : "0deg" }] }}
    >
      +
    </Text>
  );

  return (
    <Pressable
      onPress={() => setExpanded(!expanded)}
      className={`bg-white-5 rounded-card p-4 ${expanded ? "border border-card-border gap-2" : ""} ${className}`}
    >
      <View className="flex-row items-center justify-between">
        <FlameText
          variant="body"
          className={`text-white-100 flex-1 mr-4 ${expanded ? "font-poppins-bold" : "font-poppins-medium"}`}
        >
          {item.question}
        </FlameText>
        <View className="w-[27px] h-[27px] items-center justify-center">
          {ToggleIcon}
        </View>
      </View>
      {expanded && (
        <FlameText variant="subtitle1-light" className="text-white-80">
          {item.answer}
        </FlameText>
      )}
    </Pressable>
  );
}

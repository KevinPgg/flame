import { useState, useCallback } from "react";
import { View, Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { FlameText, colors, type FAQData } from "@project-flame/ui";

interface AnimatedFAQItemProps {
  item: FAQData;
  className?: string;
}

const TIMING_CONFIG = {
  duration: 300,
  easing: Easing.bezier(0.4, 0, 0.2, 1),
};

export function AnimatedFAQItem({
  item,
  className = "",
}: AnimatedFAQItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [bodyHeight, setBodyHeight] = useState(0);
  const progress = useSharedValue(0);

  const toggleExpand = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      progress.value = withTiming(next ? 1 : 0, TIMING_CONFIG);
      return next;
    });
  }, [progress]);

  const bodyStyle = useAnimatedStyle(() => ({
    height:
      bodyHeight > 0
        ? interpolate(progress.value, [0, 1], [0, bodyHeight])
        : 0,
    opacity: interpolate(progress.value, [0, 0.4, 1], [0, 0, 1]),
    overflow: "hidden" as const,
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${interpolate(progress.value, [0, 1], [0, 180])}deg` },
    ],
  }));

  const borderClass = expanded ? "border border-card-border" : "";

  return (
    <Pressable
      onPress={toggleExpand}
      className={`bg-white-5 rounded-card p-4 ${borderClass} ${className}`}
    >
      <View className="flex-row items-center justify-between">
        <FlameText
          variant="body"
          className={`text-white-100 flex-1 mr-4 ${expanded ? "font-poppins-bold" : "font-poppins-medium"}`}
        >
          {item.question}
        </FlameText>
        <Animated.View
          style={chevronStyle}
          className="w-[27px] h-[27px] items-center justify-center"
        >
          <Feather
            name="chevron-down"
            size={22}
            color={colors["white-100"]}
          />
        </Animated.View>
      </View>

      {/* Invisible measurer — positioned absolute so it doesn't affect layout */}
      {bodyHeight === 0 && (
        <View
          style={{ position: "absolute", opacity: 0, left: 16, right: 16 }}
          onLayout={(e) => setBodyHeight(e.nativeEvent.layout.height)}
          pointerEvents="none"
        >
          <FlameText variant="subtitle1-light" className="text-white-80 pt-2">
            {item.answer}
          </FlameText>
        </View>
      )}

      {/* Animated answer body */}
      <Animated.View style={bodyStyle}>
        <FlameText variant="subtitle1-light" className="text-white-80 pt-2">
          {item.answer}
        </FlameText>
      </Animated.View>
    </Pressable>
  );
}

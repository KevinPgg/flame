import { View } from "react-native";

interface DotsIndicatorProps {
  count: number;
  activeIndex: number;
}

export function DotsIndicator({ count, activeIndex }: DotsIndicatorProps) {
  return (
    <View className="flex-row items-center justify-center mt-3 gap-2">
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          className={`h-[6px] rounded-full ${
            index === activeIndex ? "w-6 bg-white-100" : "w-[6px] bg-white-30"
          }`}
        />
      ))}
    </View>
  );
}

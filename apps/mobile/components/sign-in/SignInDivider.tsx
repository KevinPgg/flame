import { View } from "react-native";
import { FlameText } from "@project-flame/ui";

export function SignInDivider() {
  return (
    <View className="flex-row items-center mb-4">
      <View className="flex-1 h-px bg-white-10" />
      <FlameText variant="subtitle2-light" className="text-white-30 mx-4">
        or
      </FlameText>
      <View className="flex-1 h-px bg-white-10" />
    </View>
  );
}

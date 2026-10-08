import { View } from "react-native";
import { FlameText } from "@project-flame/ui";
import { FlameLogo } from "../FlameLogo";

interface BrandingHeaderProps {
  mode: "sign-in" | "sign-up";
}

export function BrandingHeader({ mode }: BrandingHeaderProps) {
  return (
    <View className="items-center mb-8">
      <View className="mb-3">
        <FlameLogo width={140} height={32} color="#FFFFFF" />
      </View>
      <FlameText variant="subtitle1" className="text-white-50">
        {mode === "sign-in"
          ? "Sign in to continue"
          : "Create your account"}
      </FlameText>
    </View>
  );
}

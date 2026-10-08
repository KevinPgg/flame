import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FlameText, colors } from "@project-flame/ui";

interface OAuthButtonProps {
  onPress: () => void;
  disabled?: boolean;
  /** Visually faded but still clickable — used for pending-state cues (e.g. T&C not yet accepted). */
  dimmed?: boolean;
}

export function OAuthButton({ onPress, disabled, dimmed }: OAuthButtonProps) {
  const opacity = disabled ? 0.6 : dimmed ? 0.5 : 1;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="flex-row items-center justify-center gap-3 bg-white-5 border border-white-20 rounded-card py-3.5 mb-4"
      style={opacity !== 1 ? { opacity } : undefined}
    >
      <Ionicons name="logo-google" size={20} color={colors["white-100"]} />
      <FlameText variant="subtitle1" className="text-white-100">
        Continue with Google
      </FlameText>
    </Pressable>
  );
}

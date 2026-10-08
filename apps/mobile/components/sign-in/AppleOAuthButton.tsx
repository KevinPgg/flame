import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FlameText } from "@project-flame/ui";

interface AppleOAuthButtonProps {
  onPress: () => void;
  disabled?: boolean;
  /** Visually faded but still clickable — used for pending-state cues (e.g. T&C not yet accepted). */
  dimmed?: boolean;
}

// Per Apple HIG and App Store Guideline 4.8: Sign in with Apple button
// must be visually distinct and at least as prominent as other sign-in
// options. Spec: black background, white Apple logo, "Sign in with Apple"
// label, same size as sibling OAuth buttons.
// https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple
export function AppleOAuthButton({
  onPress,
  disabled,
  dimmed,
}: AppleOAuthButtonProps) {
  const opacity = disabled ? 0.6 : dimmed ? 0.5 : 1;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Sign in with Apple"
      className="flex-row items-center justify-center gap-3 bg-black border border-black rounded-card py-3.5 mb-3"
      style={opacity !== 1 ? { opacity } : undefined}
    >
      <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
      <FlameText variant="subtitle1" className="text-white-100">
        Sign in with Apple
      </FlameText>
    </Pressable>
  );
}

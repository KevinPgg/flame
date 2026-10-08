import { View } from "react-native";
import { PillButton } from "@project-flame/ui";

interface CheckoutCTAProps {
  /**
   * Tri-state: `true` signed in, `false` signed out, `undefined` still
   * resolving (Clerk not loaded yet, e.g. on cold relaunch). We only show the
   * "Sign In to Continue" affordance on an explicit `false` so a resuming
   * signed-in user never sees a transient signed-out CTA (W8-M1).
   */
  isSignedIn: boolean | undefined;
  quantity: number;
  onPress: () => void;
  disabled?: boolean;
  loadingLabel?: string;
}

export function CheckoutCTA({
  isSignedIn,
  quantity,
  onPress,
  disabled = false,
  loadingLabel,
}: CheckoutCTAProps) {
  if (quantity < 1) return null;

  const authResolving = isSignedIn === undefined;
  const label = loadingLabel
    ? loadingLabel
    : isSignedIn === false
      ? "Sign In to Continue"
      : "Continue to Checkout";

  return (
    <View className="items-end px-4 mt-2">
      <PillButton
        label={label}
        variant="solid"
        onPress={onPress}
        // Disable while auth resolves so a tap can't be routed on a transient
        // signed-out reading before Clerk rehydrates.
        disabled={disabled || authResolving}
      />
    </View>
  );
}

/**
 * VersionGate — wraps the entire app and renders the appropriate version-gate
 * UI based on the remote app-config.
 *
 * Layering (top to bottom of the tree):
 *   1. <ForceUpdateScreen /> when status === "hard" — replaces the entire app.
 *   2. <UpdateAvailableBanner /> when status === "soft" — slim banner above
 *      everything else; the normal app still renders underneath.
 *   3. <OtaRestartSheet /> on top of the app whenever a new JS bundle is
 *      ready. Bottom sheet, dismissible.
 *
 * Why this lives ABOVE the router (Stack/Tabs):
 *   - The hard block must cover deep-linked navigation, modal stacks, tab
 *     bars — everything. Mounting at the root of _layout.tsx gives us that.
 *   - The OTA sheet is just a Modal so it sits above whatever's below it
 *     regardless of where it's mounted, but co-locating with the gate keeps
 *     the "system surfaces" concept tidy.
 */

import { type ReactNode } from "react";
import { View } from "react-native";
import {
  useAppVersionGate,
  useSoftBannerDismissal,
} from "../../hooks/useAppVersionGate";
import { useOtaUpdatePrompt } from "../../hooks/useOtaUpdatePrompt";
import { ForceUpdateScreen } from "./ForceUpdateScreen";
import { UpdateAvailableBanner } from "./UpdateAvailableBanner";
import { OtaRestartSheet } from "./OtaRestartSheet";

interface VersionGateProps {
  children: ReactNode;
}

export function VersionGate({ children }: VersionGateProps) {
  const { status, config } = useAppVersionGate();
  const ota = useOtaUpdatePrompt();
  const softDismissal = useSoftBannerDismissal(config?.latest_version);

  if (status === "hard" && config) {
    return (
      <ForceUpdateScreen
        title={config.force_update_title || "Update Flame to continue"}
        message={
          config.force_update_message ||
          "Please update to the latest version to keep using Flame."
        }
        storeUrl={config.store_url}
      />
    );
  }

  const showSoftBanner =
    status === "soft" && config && !softDismissal.isDismissed;

  return (
    <View className="flex-1">
      {children}
      {/* Soft banner is rendered AFTER children and positioned absolutely so
          it floats on top like a toast — does NOT push the header/app shell
          down. Toast-style overlay is the industry convention for non-blocking
          update prompts (Eventbrite, Airbnb, etc.). The banner itself handles
          its own safe-area inset via `useSafeAreaInsets`. */}
      {showSoftBanner && config ? (
        <UpdateAvailableBanner
          storeUrl={config.store_url}
          onDismiss={softDismissal.dismiss}
        />
      ) : null}
      <OtaRestartSheet visible={ota.ready} onPostpone={ota.postpone} />
    </View>
  );
}

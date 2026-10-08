/**
 * OtaRestartSheet — bottom sheet shown when a new JS bundle has been silently
 * downloaded via expo-updates. Asks the user to restart now, or defer.
 *
 * Deferral is keyed by Updates.updateId (see useOtaUpdatePrompt), so if we
 * ship a second OTA within 24h the user will still see the prompt for the
 * new bundle. Critical Tier-1 fix from the second-pass plan review.
 *
 * "Restart" calls Updates.reloadAsync which swaps in the fresh bundle.
 */

import { useCallback, useState } from "react";
import {
  Modal,
  View,
  Pressable,
  Text,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FlameText, colors } from "@project-flame/ui";
import * as Updates from "expo-updates";

interface OtaRestartSheetProps {
  visible: boolean;
  onPostpone: () => void;
}

export function OtaRestartSheet({ visible, onPostpone }: OtaRestartSheetProps) {
  const [restarting, setRestarting] = useState(false);

  // Guard every dismissal path while a restart is in flight. The "Later" CTA
  // already short-circuits via `disabled={restarting}`, but the scrim Pressable
  // and the Modal's `onRequestClose` (Android hardware-back) would otherwise
  // fire unconditionally — if `reloadAsync()` fails mid-flight and the user
  // taps the scrim during that window, `onPostpone` would write a 24h
  // suppression keyed by the current `updateId`, hiding the sheet with no way
  // for the user to retry until a NEW updateId ships or the TTL expires.
  // Routing all three exits through this wrapper makes "tap outside" a no-op
  // during the in-flight restart, matching the "Later" button's behavior.
  const handlePostpone = useCallback(() => {
    if (restarting) return;
    onPostpone();
  }, [restarting, onPostpone]);

  const handleRestart = useCallback(async () => {
    if (restarting) return;
    setRestarting(true);
    try {
      if (__DEV__) {
        // In dev (Metro), reloadAsync swaps the bundle to the latest published
        // OTA — which is NOT what we want in the test matrix where we're using
        // a fake updateId. No-op locally so the dev flow can be re-run without
        // killing Metro. Reset `restarting` BEFORE delegating to onPostpone so
        // a subsequent reopen of the sheet doesn't find both CTAs disabled —
        // this sheet stays mounted across visibility toggles (it lives at the
        // root of VersionGate), so state persists.
        console.log("[OtaRestartSheet] __DEV__: skipping Updates.reloadAsync()");
        setRestarting(false);
        onPostpone();
        return;
      }
      // In production: reloadAsync swaps the bundle and the component
      // unmounts before the promise resolves — no need to reset state on
      // the success path.
      await Updates.reloadAsync();
    } catch (err) {
      console.error("[OtaRestartSheet] reloadAsync failed", err);
      setRestarting(false);
    }
  }, [restarting, onPostpone]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handlePostpone}
    >
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        {/* Scrim — tapping postpones (consistent with iOS sheet idioms),
            BUT only when no restart is in flight. See `handlePostpone`
            above for the stranded-user bug this guard prevents. */}
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }}
          onPress={handlePostpone}
          disabled={restarting}
          accessibilityRole="button"
          accessibilityLabel="Dismiss update prompt"
        />

        <View className="bg-surface rounded-t-[28px] pb-10">
          {/* Drag handle */}
          <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: "rgba(255,255,255,0.2)",
              }}
            />
          </View>

          <View
            style={{
              paddingHorizontal: 24,
              paddingTop: 16,
              paddingBottom: 8,
              gap: 18,
            }}
          >
            {/* Hero icon */}
            <View
              style={{ alignSelf: "center", paddingTop: 4, paddingBottom: 4 }}
            >
              <View
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 48,
                  backgroundColor: "rgba(255,255,255,0.06)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 36,
                    backgroundColor: "rgba(255,255,255,0.1)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name="sparkles-outline"
                    size={36}
                    color={colors["white-100"]}
                  />
                </View>
              </View>
            </View>

            <FlameText
              variant="h3"
              className="text-white-100 text-center font-poppins-semibold"
            >
              Flame just got better
            </FlameText>

            <FlameText
              variant="body"
              className="text-white-80 text-center"
              style={{ lineHeight: 22 }}
            >
              Restart now to load the latest version with the newest improvements
              and fixes.
            </FlameText>

            {/* Inline action row — Later on the left (ghost), Restart now on
                the right (primary white pill). Equal flex so they share the
                row 50/50. Both use className (not inline style) so colors
                actually render — see ForceUpdateScreen CTA for the same
                rationale. */}
            <View className="mt-1 flex-row items-center gap-3">
              {/* Ghost CTA — "Later" suppresses for 24h keyed by updateId.
                  Routes through `handlePostpone` (same guard as the scrim) so
                  every dismissal path is consistent. The `disabled` prop is
                  retained for visual feedback (greys out during restart). */}
              <Pressable
                onPress={handlePostpone}
                disabled={restarting}
                accessibilityRole="button"
                accessibilityLabel="Restart Flame later"
                className="h-14 flex-1 items-center justify-center rounded-pill border border-white-20 bg-white-5 active:opacity-70"
              >
                <Text className="text-base leading-[22px] font-poppins-semibold text-white-100">
                  Later
                </Text>
              </Pressable>

              {/* Primary CTA */}
              <Pressable
                onPress={handleRestart}
                disabled={restarting}
                accessibilityRole="button"
                accessibilityLabel="Restart Flame now"
                accessibilityState={{ disabled: restarting, busy: restarting }}
                className={`h-14 flex-1 flex-row items-center justify-center gap-2 rounded-pill bg-white-100 ${
                  restarting ? "opacity-70" : "active:opacity-85"
                }`}
              >
                {restarting ? (
                  <ActivityIndicator size="small" color={colors.dark} />
                ) : (
                  <Text className="text-base leading-[22px] font-poppins-semibold text-dark">
                    Restart now
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

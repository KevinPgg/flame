/**
 * Flame 2.0 welcome behind the sign-in screen (fase 2.6). Prototype `SCREENS.splash`: a collage
 * of real flyers (the Home's events) fading to black, and one line under the logo. The sign-in
 * itself (Apple, Google, e-mail, Clerk) is the existing screen, unchanged.
 */
import { useMemo } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useI18n } from "../../../lib/i18n";
import { useAppEvents } from "../../../hooks/useAppEvents";
import type { FeedEvent } from "./home/EventFeedCard";

export function WelcomeBackdrop() {
  const { width } = useWindowDimensions();
  const { data } = useAppEvents();
  const flyers = useMemo(
    () =>
      (((data as { rawEvents?: FeedEvent[] } | undefined)?.rawEvents ?? []) as FeedEvent[])
        .map((e) => e.image_url)
        .filter((u): u is string => !!u)
        .slice(0, 9),
    [data],
  );
  const w = (width - 8) / 3;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View testID="welcome-collage" style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, opacity: 0.55 }}>
        {flyers.map((src, i) => (
          <Image key={i} source={{ uri: src }} style={{ width: w, height: w * 1.25 }} contentFit="cover" />
        ))}
      </View>
      <LinearGradient colors={["rgba(0,0,0,0.25)", "rgba(0,0,0,0.88)", "#000000"]} locations={[0, 0.45, 0.75]} style={StyleSheet.absoluteFill} />
    </View>
  );
}

export function WelcomeHeadline() {
  const { t } = useI18n();
  return (
    <Text className="mb-6 text-center font-v2-display-bold text-[26px] leading-[29px] tracking-[-1px] text-v2-cream">{t("welcome.headline")}</Text>
  );
}
